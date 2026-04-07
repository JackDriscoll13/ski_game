/** WebGL2 terrain shading renderer. Heightfield is computed on CPU and uploaded
 *  as a texture; all lighting, AO, shadows, snow, and contours run in a
 *  fragment shader so the light direction can update in real time on pointer move. */

import { type HField, MAP_W, MAP_H, clamp, buildPaletteData } from "./terrainField";

export type GLRenderer = {
  /** Re-shade with a new interactive light offset (−1…1 each axis). */
  updateLight: (px: number, py: number) => void;
  destroy: () => void;
};

/* ── Shaders ───────────────────────────────────────────────────────── */

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv=vec2(a_pos.x*.5+.5,-.5*a_pos.y+.5);
  gl_Position=vec4(a_pos,0,1);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 O;

uniform sampler2D u_h;
uniform sampler2D u_pal;
uniform vec2 u_tx;
uniform vec2 u_ptr;

float H(vec2 p){return texture(u_h,p).r;}
vec3 P(float t){return texture(u_pal,vec2(t,.5)).rgb;}

void main(){
  vec2 tx=u_tx;
  float c=H(v_uv);

  // ── Sobel normals (strong for dramatic relief) ──
  float l=H(v_uv+vec2(-tx.x,0)),r=H(v_uv+vec2(tx.x,0));
  float u=H(v_uv+vec2(0,-tx.y)),d=H(v_uv+vec2(0,tx.y));
  float ul=H(v_uv+vec2(-tx.x,-tx.y)),ur=H(v_uv+vec2(tx.x,-tx.y));
  float dl=H(v_uv+vec2(-tx.x, tx.y)),dr=H(v_uv+vec2(tx.x, tx.y));
  float dx=(r-l)*.5+(ur-ul+dr-dl)*.25;
  float dy=(d-u)*.5+(dl-ul+dr-ur)*.25;
  vec3 N=normalize(vec3(-dx*11.,1.3,-dy*13.));

  // ── Interactive raking light ──
  vec3 L=normalize(vec3(
    -0.55+u_ptr.x*.20,
    0.48,
    0.52-u_ptr.y*.15
  ));
  float NdL=dot(N,L);
  float shade=clamp(.62+NdL*.68,.12,1.45);

  // specular
  vec3 Hv=normalize(L+vec3(0,1,0));
  float spec=pow(max(dot(N,Hv),0.),28.);

  // slope & aspect
  float slope=length(vec2(r-l,d-u))*16.;
  float aspect=atan(-(d-u),-(r-l));

  // ── AO (8-tap) ──
  float ao=0.;
  float R=3.5;
  ao+=clamp(H(v_uv+vec2(-R, 0)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2( R, 0)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2( 0,-R)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2( 0, R)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2(-R,-R)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2( R,-R)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2(-R, R)*tx)-c,0.,.25);
  ao+=clamp(H(v_uv+vec2( R, R)*tx)-c,0.,.25);
  ao=clamp(1.-ao*3.0,0.,1.);

  // ── Cast shadow (follows interactive light) ──
  vec2 sm=normalize(vec2(L.x,-L.z));
  float lit=1.;
  for(int s=1;s<=10;s++){
    float sd=float(s)*1.4;
    float sh=H(v_uv+sm*sd*tx);
    float df=sh-c;
    if(df>.015) lit=min(lit,1.-smoothstep(.015,.10,df));
  }

  // ── Snow (subtle — palette already has white at top) ──
  float altSnow=smoothstep(.60,.88,c);
  float slopeSnow=clamp(1.-slope*.5,0.,1.);
  float aspSnow=.5+.5*cos(aspect-2.356);
  float snow=altSnow*(.25+slopeSnow*.45+aspSnow*.3);

  // ── Compose ──
  vec3 col=P(c);
  col*=.68+(shade-.5)*.92;

  // Snow: enhance brightness on lit snow
  vec3 sLit=vec3(.96,.97,.99),sSh=vec3(.72,.78,.86);
  vec3 sCol=mix(sSh,sLit,clamp((shade-.35)/.5,0.,1.));
  col=mix(col,sCol,clamp(snow*.60,0.,1.));
  col+=vec3(1)*spec*smoothstep(.50,.78,c)*.28;

  // AO — strong valley darkening
  col*=.42+ao*.58;

  // Cast shadow — deep
  col=mix(col,vec3(.035,.05,.09),(1.-lit)*.58);

  // warm/cool tint
  float wc=clamp(NdL*.12+.02,-.07,.07);
  col.r+=wc*.16; col.b-=wc*.08;

  // ── Contours ──
  float cBase=.08,minSp=.048;
  float hq=(c-cBase)/minSp;
  float minE=abs(fract(hq+.5)-.5);
  float minFw=fwidth(hq);
  float mn=1.-smoothstep(0.,max(minFw*1.5,.04),minE);

  float hmq=(c-cBase)/(minSp*4.);
  float majE=abs(fract(hmq+.5)-.5);
  float majFw=fwidth(hmq);
  float mj=1.-smoothstep(0.,max(majFw*1.8,.06),majE);

  // Contour color: brown on green terrain, dark gray on snow
  vec3 cGreen=vec3(.40,.32,.22);
  vec3 cSnow=vec3(.18,.22,.32);
  vec3 cCol=mix(cGreen,cSnow,smoothstep(.50,.72,c));
  float mA=mn*(c>.55?.14:.10);
  float MA=mj*(c>.55?.28:.20);
  col=mix(col,cCol,clamp(mA+MA,0.,.35));

  // ── Vignette + atmosphere ──
  vec2 vc=v_uv-vec2(.5,.38);
  float vig=1.-smoothstep(.28,.72,length(vc*vec2(1.,1.15)));
  col=mix(col*.78,col,vig);
  col+=vec3(.30,.75,.95)*smoothstep(.35,0.,v_uv.y)*.07;

  O=vec4(clamp(col,0.,1.),1.);
}`;

/* ── GL helpers ────────────────────────────────────────────────────── */

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("shader compile:", gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function link(
  gl: WebGL2RenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram | null {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn("program link:", gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

/* ── Public ────────────────────────────────────────────────────────── */

export function createGLRenderer(
  canvas: HTMLCanvasElement,
  field: HField,
): GLRenderer | null {
  const maybeGL = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  if (!maybeGL) return null;
  const gl: WebGL2RenderingContext = maybeGL;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = link(gl, vs, fs);
  if (!prog) return null;

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const posLoc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Height texture
  const hTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, hTex);
  const texBytes = new Uint8Array(field.w * field.h);
  for (let i = 0; i < field.data.length; i++) {
    texBytes[i] = Math.round(clamp(field.data[i], 0, 1) * 255);
  }
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.R8,
    field.w, field.h, 0,
    gl.RED, gl.UNSIGNED_BYTE, texBytes,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Palette texture
  const palTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, palTex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA,
    256, 1, 0,
    gl.RGBA, gl.UNSIGNED_BYTE, buildPaletteData(),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Uniforms
  gl.useProgram(prog);
  gl.uniform1i(gl.getUniformLocation(prog, "u_h"), 0);
  gl.uniform1i(gl.getUniformLocation(prog, "u_pal"), 1);
  gl.uniform2f(gl.getUniformLocation(prog, "u_tx"), 1 / field.w, 1 / field.h);
  const uPtr = gl.getUniformLocation(prog, "u_ptr");

  function render(px: number, py: number) {
    gl.viewport(0, 0, MAP_W, MAP_H);
    gl.useProgram(prog);
    gl.uniform2f(uPtr, px, py);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(0, 0);

  return {
    updateLight(px, py) { render(px, py); },
    destroy() {
      gl.deleteTexture(hTex);
      gl.deleteTexture(palTex);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(prog);
    },
  };
}
