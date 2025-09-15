import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
// We no longer need to import interactivePits, as this class will now create them.
import { loadGameAssets } from './gameObjects.js';

export default class GameScene {
    // Class properties to hold our state
    scene;
    camera;
    renderer;
    controls;
    raycaster;
    mouse;
    onPitClickCallback;
    seedsGroup;
    seedMeshTemplate;
    cameraOriented = false;

    // --- NEW: Dynamic geometry and grid properties ---
    boardDimensions = { width: 0, height: 0, center: new THREE.Vector3() };
    pitPositions = [];      // Array of THREE.Vector3 for each pit's center
    interactivePits = [];   // Array of invisible meshes for raycasting

    // Board layout constants
    COLS = 8;
    ROWS = 4;

    constructor(canvas, onPitClickCallback) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.onPitClickCallback = onPitClickCallback;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.seedsGroup = new THREE.Group();
    }

   /**
     * Measures the board model and creates a virtual grid for pit positions
     * and raycasting targets based on the specified layout rules.
     * @param {THREE.Object3D} boardModel The loaded board model.
     */
    createPitGeometry(boardModel) {
        // 1. Get board size from its bounding box
        const boundingBox = new THREE.Box3().setFromObject(boardModel);
        const boardSize = new THREE.Vector3();
        boundingBox.getSize(boardSize);
        boundingBox.getCenter(this.boardDimensions.center);

        // 2. Determine longer and shorter side
        console.log(`Board dimensions - Width: ${boardSize.x}, Height: ${boardSize.y} , Depth: ${boardSize.z}`);    
        const isXLonger = boardSize.x >= boardSize.z;
        const longerSide = isXLonger ? boardSize.x : boardSize.z;
        const shorterSide = isXLonger ? boardSize.z : boardSize.x;

        // Store dimensions for later use
        this.boardDimensions.width = boardSize.x;
        this.boardDimensions.height = boardSize.z;
        
        // 3. Calculate grid dimensions
        const colWidth = longerSide / this.COLS;
        
        // Shorter side is divided in 4:1:4 ratio (total 9 parts)
        const totalRatioParts = 9;
        const outerRowHeight = (shorterSide / totalRatioParts) * 4;
        const innerRowHeight = outerRowHeight; // Same size
        const gapHeight = (shorterSide / totalRatioParts) * 1;

        // Calculate Y positions for the center of each row, relative to the board's center
        const y_p2_outer = (gapHeight / 2) + innerRowHeight + (outerRowHeight / 2); // Top-most row
        const y_p2_inner = (gapHeight / 2) + (innerRowHeight / 2);
        const y_p1_inner = -(gapHeight / 2) - (innerRowHeight / 2);
        const y_p1_outer = -(gapHeight / 2) - innerRowHeight - (outerRowHeight / 2); // Bottom-most row
        
        const rowCenterYs = [y_p1_outer, y_p1_inner, y_p2_inner, y_p2_outer];
        
        const startX = -longerSide / 2 + colWidth / 2;

        // 4. Generate and store the center position for each of the 32 pits
        this.pitPositions = new Array(32);
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const pitX = startX + col * colWidth;
                const pitY = rowCenterYs[row];

                let pitIndex;
                if (row === 0) pitIndex = col;        // P1 outer row: 0-7
                else if (row === 1) pitIndex = 15 - col;   // P1 inner row: 15-8
                else if (row === 2) pitIndex = 16 + col;   // P2 inner row: 16-23
                else if (row === 3) pitIndex = 31 - col;   // P2 outer row: 31-24
                
                let position;
                // Account for board orientation (whether it's wider or taller)
                if (isXLonger) {
                    position = new THREE.Vector3(pitX, pitY, this.boardDimensions.center.z);
                } else {
                    position = new THREE.Vector3(pitY, pitX, this.boardDimensions.center.z); // Swap x and y
                }
                
                this.pitPositions[pitIndex] = position;
            }
        }
    
        // 5. Create invisible meshes for raycasting
        const pitGeometry = new THREE.CircleGeometry(colWidth / 2.5, 16); // Circles are slightly smaller than the cell
        //const pitMaterial = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
           // --- MODIFICATION FOR DEBUGGING ---
        // Instead of making the material invisible, we give it a color and make it transparent.
        const pitMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000,      // A bright red color for debugging
            side: THREE.DoubleSide,
            transparent: true,    // Enable transparency
            opacity: 0.5          // Make it semi-transparent
        });


        const pitMeshesGroup = new THREE.Group();
        this.pitPositions.forEach((pos, index) => {
            const pitMesh = new THREE.Mesh(pitGeometry, pitMaterial);
            pitMesh.position.copy(pos);
            pitMesh.userData.pitIndex = index; // Store index for easy retrieval on click
            pitMeshesGroup.add(pitMesh);
            this.interactivePits.push(pitMesh); // Add to our array for the raycaster
        });

        this.scene.add(pitMeshesGroup);
        console.log("Virtual pit geometry created with " + this.pitPositions.length + " positions.");
    }


    async init() {
        // --- Basic Scene Setup ---
        this.scene = new THREE.Scene();

        // --- Camera ---
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 5000);
        this.camera.position.set(0, -250, 250);
        this.camera.lookAt(0, 0, 0);

        // --- Renderer ---
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // --- Controls ---
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.minDistance = 150;
        this.controls.maxDistance = 600;
        this.controls.minPolarAngle = Math.PI / 4;
        this.controls.maxPolarAngle = Math.PI / 2.2;

        // --- Environment & Lighting ---
        const rgbeLoader = new RGBELoader();
        const textureLoader = new THREE.TextureLoader();
        const GCS_ASSET_URL = './assets/';

        rgbeLoader.load(GCS_ASSET_URL + 'room_env.hdr', (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.background = texture;
            this.scene.environment = texture;
        });

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(-150, -200, 300);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096;
        directionalLight.shadow.mapSize.height = 4096;
        directionalLight.shadow.camera.near = 10;
        directionalLight.shadow.camera.far = 1000;
        directionalLight.shadow.camera.left = -250;
        directionalLight.shadow.camera.right = 250;
        directionalLight.shadow.camera.top = 250;
        directionalLight.shadow.camera.bottom = -250;
        this.scene.add(directionalLight);

        const floorGeometry = new THREE.PlaneGeometry(5000, 2500);
        const floorTexture = textureLoader.load(GCS_ASSET_URL + 'table_texture.jpg');
        floorTexture.wrapS = THREE.RepeatWrapping;
        floorTexture.wrapT = THREE.RepeatWrapping;
        floorTexture.repeat.set(1, 1);
        const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.position.y = -20;
        floorMesh.receiveShadow = true;
        this.scene.add(floorMesh);

        // --- Game Objects ---
        const { boardModel, seedMeshTemplate } = await loadGameAssets();
        this.seedMeshTemplate = seedMeshTemplate;
        this.scene.add(boardModel);
        this.scene.add(this.seedsGroup);

        // --- NEW: Calculate virtual geometry for pits AFTER board is loaded ---
        this.createPitGeometry(boardModel);

        // --- Event Listeners ---
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onCanvasMouseDown.bind(this));

        // --- Start Animation Loop ---
        this.animate();
    }

    // --- Class Methods ---
    
    // The 'pits' argument is no longer needed as we use this.pitPositions
    renderGameState(gameState, myProfileId) {
        if (!this.scene || !this.seedMeshTemplate || this.pitPositions.length === 0) {
            console.warn("RenderGameState called before scene/assets are fully initialized.");
            // Retry logic can be kept if necessary
            setTimeout(() => this.renderGameState(gameState, myProfileId), 500);
            return;
        }

        if (!this.cameraOriented && myProfileId && gameState.player1_id) {
            const isPlayer1 = myProfileId === gameState.player1_id;
            this.orientCameraForPlayer(isPlayer1);
            this.cameraOriented = true;
        }

        // Clear existing seeds efficiently
        while (this.seedsGroup.children.length > 0) {
            this.seedsGroup.remove(this.seedsGroup.children[0]);
        }

        gameState.board.forEach((seedCount, pitIndex) => {
            if (seedCount > 0) {
                // Get the pre-calculated world position for this pit
                const pitWorldPosition = this.pitPositions[pitIndex];
                
                if (!pitWorldPosition) {
                    console.warn(`No position found for pit index ${pitIndex}`);
                    return;
                }
                
                // Dynamically determine a radius for spreading seeds within the pit
                const pitRadius = this.boardDimensions.width / this.COLS / 2.5; 

                for (let i = 0; i < seedCount; i++) {
                    const seed = this.seedMeshTemplate.clone();

                    // Spread seeds randomly within the pit's radius
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.sqrt(Math.random()) * pitRadius; // sqrt for more even distribution
                    
                    const x = pitWorldPosition.x + Math.cos(angle) * radius;
                    const y = pitWorldPosition.z + Math.sin(angle) * radius;
                    // Place seeds slightly above the board's surface
                    const z = this.boardDimensions.center.z + 1.5;

                    seed.position.set(x, y, z);
                    seed.rotation.set(
                        Math.random() * Math.PI,
                        Math.random() * Math.PI,
                        Math.random() * Math.PI
                    );

                    seed.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.seedsGroup.add(seed);
                }
            }
        });

        this.seedsGroup.visible = true;

        const uiMessage = document.getElementById('ui-message');
        if (uiMessage) {
            uiMessage.textContent = gameState.message || `Player ${gameState.currentPlayer}'s turn.`;
        }
    }

    orientCameraForPlayer(isPlayer1) {
        const yPos = isPlayer1 ? -280 : 280;
        this.camera.position.set(0, yPos, 220);
        this.controls.target.set(0, 0, 0);
    }

    /**
     * UPDATED: Handles clicks by raycasting against our invisible pit meshes.
     * This is more accurate and simpler than coordinate mapping.
     */
    onCanvasMouseDown(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Intersect with the array of invisible pit meshes we created
        const intersects = this.raycaster.intersectObjects(this.interactivePits);

        if (intersects.length > 0) {
            // The first intersected object is the closest one
            const intersectedPit = intersects[0].object;
            const pitIndex = intersectedPit.userData.pitIndex;
            
            if (pitIndex !== undefined) {
                console.log(`Clicked on pit index: ${pitIndex}`);
                if (this.onPitClickCallback) {
                    this.onPitClickCallback(pitIndex);
                }
            }
        }
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
