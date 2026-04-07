import * as THREE from "three";
import { createScene } from "../scene/setupScene";

export type PlaySessionOptions = {
  /** Mountains / servers the player joined from the range map (for HUD + future multiplayer). */
  mountains: readonly { id: string; name: string }[];
};

export type PlaySessionApi = {
  dispose: () => void;
};

export function startPlaySession(
  host: HTMLElement,
  options: PlaySessionOptions,
): PlaySessionApi {
  const label = options.mountains.map((m) => m.name).join(", ");
  host.setAttribute("aria-label", label ? `Skiing: ${label}` : "Game");

  const { scene, spinMesh } = createScene();

  const camera = new THREE.PerspectiveCamera(
    55,
    host.clientWidth / Math.max(host.clientHeight, 1),
    0.1,
    200,
  );
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);

  const onResize = (): void => {
    const w = host.clientWidth;
    const h = Math.max(host.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();
  let raf = 0;

  function frame(): void {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    spinMesh.rotation.y = t * 0.6;
    renderer.render(scene, camera);
  }
  frame();

  return {
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          const mats = obj.material;
          if (Array.isArray(mats)) mats.forEach((m) => m.dispose());
          else mats?.dispose();
        }
      });
      renderer.dispose();
      host.removeChild(renderer.domElement);
    },
  };
}
