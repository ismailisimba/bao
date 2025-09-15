import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { loadGameAssets, interactivePits } from './gameObjects.js';
import { initUI, renderGameState } from './ui.js';

let scene, camera, renderer, controls;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

let onPitClickCallback = null; 

export async function init(onPitClick) {

    onPitClickCallback = onPitClick; 
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 5000); // Increased near/far planes
    camera.position.set(0, -250, 250); // <-- Adjusted camera position for new scale
    camera.lookAt(0, 0, 0);

    const canvas = document.getElementById('game-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 150;  // <-- Adjusted zoom in limit
    controls.maxDistance = 600;  // <-- Adjusted zoom out limit
    controls.minPolarAngle = Math.PI / 4;
    controls.maxPolarAngle = Math.PI / 2.2;

    const rgbeLoader = new RGBELoader();
    const textureLoader = new THREE.TextureLoader();
    const GCS_ASSET_URL = './assets/'; // <-- Updated to relative path for local assets

    rgbeLoader.load(GCS_ASSET_URL + 'room_env.hdr', (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.environment = texture;
    });

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(-150, -200, 300); // <-- Adjusted light position
    directionalLight.castShadow = true; 
    directionalLight.shadow.mapSize.width = 4096; // Increased shadow map resolution for quality
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 1000;
    // --- ADJUSTED SHADOW AREA TO ENCOMPASS THE LARGE BOARD ---
    directionalLight.shadow.camera.left = -250;
    directionalLight.shadow.camera.right = 250;
    directionalLight.shadow.camera.top = 250;
    directionalLight.shadow.camera.bottom = -250;
    scene.add(directionalLight);

    const floorGeometry = new THREE.PlaneGeometry(5000, 3000); // Made floor bigger
    const floorTexture = textureLoader.load(GCS_ASSET_URL + 'table_texture.jpg');
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(80, 80);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 });
    const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -20; // <-- Adjusted floor position
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const { boardModel, seedMeshTemplate } = await loadGameAssets();
    scene.add(boardModel);
    
    const y = initUI(scene, seedMeshTemplate); 

    console.log(y,"y from initUI");

    let sceneRef = scene;
    let seedMeshRef = seedMeshTemplate;

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);

    animate();

    return { sceneRef, seedMeshRef };
}

/**
 * Sets the camera's position to view the board from the correct player's perspective.
 * @param {boolean} isPlayer1 - True if the user is Player 1.
 */
export function orientCameraForPlayer(isPlayer1) {
    const yPos = isPlayer1 ? -280 : 280; // <-- Adjusted perspective distance
    camera.position.set(0, yPos, 220);   // <-- Adjusted perspective height
    controls.target.set(0, 0, 0); 
}

function onCanvasMouseDown(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactivePits);

    if (intersects.length > 0) {
        const clickedPit = intersects[0].object;
        const pitIndex = clickedPit.userData.pitIndex;
        console.log(`Clicked on pit with index: ${pitIndex}`);
        
        if (onPitClickCallback) {
            onPitClickCallback(pitIndex);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

export { renderGameState };