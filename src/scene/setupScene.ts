import * as THREE from "three";

export type GameScene = {
  scene: THREE.Scene;
  spinMesh: THREE.Mesh;
};

export function createScene(): GameScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  const hemi = new THREE.HemisphereLight(0x9ec8ff, 0x1a1a24, 0.9);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.85);
  dir.position.set(4, 10, 6);
  scene.add(dir);

  const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x5ad4ff,
    metalness: 0.15,
    roughness: 0.35,
  });
  const spinMesh = new THREE.Mesh(geo, mat);
  spinMesh.position.y = 0.6;
  scene.add(spinMesh);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  return { scene, spinMesh };
}
