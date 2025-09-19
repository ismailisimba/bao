import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// This array will no longer be populated here, as pits are not separate objects.
// We keep it for the raycaster in scene.js, which will contain the single board mesh.
export const interactivePits = [];
export let interactiveBoardMesh = null; // <-- We'll store the single board mesh here.

/**

Loads all necessary 3D assets for the game.

@returns {Promise<{boardModel: THREE.Group, seedMeshTemplate: THREE.Mesh}>} A promise that resolves with the board model and a template mesh for the seeds.
*/
export async function loadGameAssets() {
interactivePits.length = 0;
interactiveBoardMesh = null;

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const GCS_ASSET_URL = './assets/';

const [
woodAlbedo,
woodRoughness,
woodNormal
] = await Promise.all([
textureLoader.loadAsync(GCS_ASSET_URL + 'wood_albedo.jpg'),
//textureLoader.loadAsync(GCS_ASSET_URL + 'wood_roughness.jpg'),
//textureLoader.loadAsync(GCS_ASSET_URL + 'wood_normal.jpg')
]);

woodAlbedo.colorSpace = THREE.SRGBColorSpace;

const mainBoardMaterial = new THREE.MeshStandardMaterial({
map: woodAlbedo,
//roughnessMap: woodRoughness,
//normalMap: woodNormal,
//metalness: 0.4,
});

// NOTE: The opponent pit material can no longer be applied this way, as the board is one mesh.
// The visual distinction would need to be part of the texture itself.
// We will now apply the single main material to the whole board.

const assetPromises = [
loader.loadAsync('assets/bao_board.glb'),
loader.loadAsync('assets/seed.glb')
];

try {
const [boardGltf, seedGltf] = await Promise.all(assetPromises);

const boardModel = boardGltf.scene;
boardModel.scale.set(320, 220, 320);

boardModel.traverse((object) => {
// Find the main board mesh based on the name you logged.
if (object.isMesh && object.name === 'BaoBoard_WoodBoard_0') {
console.log("Found the main interactive board mesh:", object.name);
object.material = mainBoardMaterial;
object.receiveShadow = true;

// Store this single mesh for raycasting.
interactiveBoardMesh = object;
interactivePits.push(object); // Add to the array for the raycaster
}
});

if (!interactiveBoardMesh) {
console.warn("Could not find the 'BaoBoard_WoodBoard_0' mesh in the model!");
}

let seedMeshTemplate = null;
seedGltf.scene.traverse(child => {
if (child.isMesh && seedMeshTemplate === null) {
seedMeshTemplate = child;
}
});

if (!seedMeshTemplate) throw new Error("No mesh found in seed.glb");

seedMeshTemplate.scale.set(2, 2, 2);
seedMeshTemplate.castShadow = true;

return { boardModel, seedMeshTemplate };
} catch (error) {
console.error("Error loading game assets:", error);
return {
boardModel: new THREE.Group(),
seedMeshTemplate: new THREE.Mesh(new THREE.SphereGeometry(0.25))
};
}

}