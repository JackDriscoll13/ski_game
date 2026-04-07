import * as THREE from "three";
import { createScene } from "../scene/setupScene";

export function initGame(container: HTMLElement): void {
  const { scene, spinMesh } = createScene();

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(container.clientHeight, 1),
    0.1,
    200,
  );
  camera.position.set(0, 2, 8);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const onResize = (): void => {
    const w = container.clientWidth;
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  const clock = new THREE.Clock();

  function frame(): void {
    requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    spinMesh.rotation.y = t * 0.6;
    renderer.render(scene, camera);
  }
  frame();
}
