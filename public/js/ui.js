import * as THREE from 'three';
import { orientCameraForPlayer } from './scene.js'; 

let sceneRef;
let seedMeshRef;
const seedsGroup = new THREE.Group();
let cameraOriented = false; 

export function initUI(scene, seedTemplate) {
    sceneRef = scene;
    seedMeshRef = seedTemplate;
    scene.add(seedsGroup);
    cameraOriented = false; 
    return {sceneRef, seedMeshRef};
}

/**
 * Clears existing seeds and re-draws them based on the game state.
 * Also orients the camera on the first update.
 * @param {object} gameState - The game state object from the backend.
 * @param {Array<THREE.Mesh>} pits - The array of pit meshes.
 * @param {string | number} myProfileId - The profile ID of the current user.
 */
export function renderGameState(gameState, pits, myProfileId, sceneRef2, seedMeshRef2) {
    console.log('Rendering game statet:', typeof gameState.board.forEach);
    console.log('sceneRef, seedMeshRef:', sceneRef2, seedMeshRef2);
    if (!sceneRef || !seedMeshRef) return;

    if (!cameraOriented && myProfileId && gameState.player1_id) {
        const isPlayer1 = myProfileId === gameState.player1_id;
        orientCameraForPlayer(isPlayer1);
        cameraOriented = true;
    }

    console.log('Clearing existing seeds. Current count:');

    while (seedsGroup.children.length) {
        seedsGroup.remove(seedsGroup.children[0]);
    }

    for(const pit of gameState.board){ 
        console.log(pit,"pit");
    }
    

    gameState.board.forEach((seedCount, pitIndex) => {
        console.log(`Pit ${pitIndex} has ${seedCount} seeds.`);
        if (seedCount > 0) {
            const pitMesh = pits.find(p => p.userData.pitIndex === pitIndex);
            if (!pitMesh) return;
            
            for (let i = 0; i < seedCount; i++) {
                const seed = seedMeshRef.clone(); 
                
                const pitWorldPosition = new THREE.Vector3();
                pitMesh.getWorldPosition(pitWorldPosition);

                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 100;
                const x = pitWorldPosition.x + Math.cos(angle) * radius;
                const y = pitWorldPosition.y + Math.sin(angle) * radius;
                // --- FIX: ADJUST Z-POSITION FOR LARGER SEEDS ---
                const z = pitWorldPosition.z + (Math.random() - 0.5) * 10 + 25; 
                
                seed.position.set(x, y, z);
                seed.rotation.set(
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2
                );

                seed.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                console.log(`Placing seed in pit ${pitIndex} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);

                seedsGroup.add(seed);
            }
        }
    });

    const uiMessage = document.getElementById('ui-message');
    if (uiMessage) {
        uiMessage.textContent = gameState.message || `Player ${gameState.currentPlayer}'s turn.`;
    }
}