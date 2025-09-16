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
    seedDimensions = new THREE.Vector3();
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

    
    // --- FIX 1: Determine dimensions based on the X-Z plane ---
    const isXLonger = boardSize.x >= boardSize.z;
    const longerSide = isXLonger ? boardSize.x : boardSize.z;
    const shorterSide = isXLonger ? boardSize.z : boardSize.x;

   

    // Store dimensions for later use (using more descriptive names)
    this.boardDimensions.width = longerSide;  // The dimension with 8 pits
    this.boardDimensions.depth = shorterSide; // The dimension with 4 pits

    // 3. Calculate grid dimensions
    const colWidth = longerSide / this.COLS;
    //const colWidth = 10;


    // Shorter side is divided in 2:1:2 ratio (total 5 parts)
    const totalRatioParts = 5;
    const outerRowHeight = (shorterSide / totalRatioParts) * 1;
    const innerRowHeight = outerRowHeight; // Same size
   // const gapHeight = (shorterSide / totalRatioParts) * .0025; // The gap between inner rows
   const gapHeight = 15;
 

    // Calculate positions along the shorter axis (which will be the Z-axis for the pits)
    const z_p2_outer = (gapHeight / 2) + innerRowHeight + (outerRowHeight / 2); // Top-most row
    const z_p2_inner = (gapHeight / 2) + (innerRowHeight / 2);
    const z_p1_inner = -(gapHeight / 2) - (innerRowHeight / 2);
    const z_p1_outer = -(gapHeight / 2) - innerRowHeight - (outerRowHeight / 2); // Bottom-most row

    const rowCenterZs = [z_p1_outer, z_p1_inner, z_p2_inner, z_p2_outer];
    
    //const startX = -longerSide / 2 + colWidth / 2;

    const startX = -5; // Center the grid around X=0

       
    // --- FIX 2: Calculate the Y coordinate for the TOP surface of the board ---
    // We add a small epsilon (0.1) to prevent flickering (Z-fighting) with the board surface.
    const topOfBoardY = this.boardDimensions.center.y + (boardSize.y / 2) + 0.1;

    // 4. Generate and store the center position for each of the 32 pits
    this.pitPositions = new Array(32);
    for (let row = 0; row < this.ROWS; row++) {
        for (let col = 0; col < this.COLS; col++) {
            // These are positions on a 2D plane
            const pitX_on_plane = startX + col * colWidth;
            const pitZ_on_plane = rowCenterZs[row];

            let pitIndex;
            if (row === 0) pitIndex = col;        // P1 outer row: 0-7
            else if (row === 1) pitIndex = 15 - col;   // P1 inner row: 15-8
            else if (row === 2) pitIndex = 16 + col;   // P2 inner row: 16-23
            else if (row === 3) pitIndex = 31 - col;   // P2 outer row: 31-24
            
            // --- FIX 3: Construct the 3D position vector correctly ---
            // Place calculated coordinates into X and Z, and use our fixed Y for height.
            let position;
            if (isXLonger) {
                // Board is wider than it is deep. X is the long side, Z is the short side.
                position = new THREE.Vector3(pitX_on_plane, topOfBoardY, pitZ_on_plane);
            } else {
                // Board is deeper than it is wide. Z is the long side, X is the short side.
                position = new THREE.Vector3(pitZ_on_plane, topOfBoardY, pitX_on_plane); // Swap X and Z
            }
            
            this.pitPositions[pitIndex] = position;
        }
    }

    // 5. Create visible meshes for raycasting and debugging
    const pitGeometry = new THREE.CircleGeometry(colWidth / 2.5, 16);
    const pitMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,      // A bright red color for debugging
        side: THREE.DoubleSide,
        transparent: true,    // Enable transparency
        opacity: 0         // Make it semi-transparent
    });

    const pitMeshesGroup = new THREE.Group();
    this.pitPositions.forEach((pos, index) => {
        const pitMesh = new THREE.Mesh(pitGeometry, pitMaterial);
        pitMesh.position.copy(pos);

        // --- FIX 4: Rotate the circle to make it lie flat on the X-Z plane ---
        pitMesh.rotation.x = -Math.PI / 2; // Rotates -90 degrees around the X-axis

        pitMesh.userData.pitIndex = index;
        pitMeshesGroup.add(pitMesh);
        this.interactivePits.push(pitMesh);
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
        this.controls.maxDistance = 1000;
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

        const floorGeometry = new THREE.PlaneGeometry(5000, 1500);
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

         // --- NEW: Measure the seed for realistic piling ---
        new THREE.Box3().setFromObject(this.seedMeshTemplate).getSize(this.seedDimensions);
        console.log(`Measured seed dimensions: Y (height) = ${this.seedDimensions.y.toFixed(2)}`);


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
            setTimeout(() => this.renderGameState(gameState, myProfileId), 1500);
            return;
        }

        if (!this.cameraOriented && myProfileId && gameState.player1_id) {
            const isPlayer1 = myProfileId === gameState.player1_id;
            this.orientCameraForPlayer(isPlayer1);
            this.cameraOriented = true;
        }

        while (this.seedsGroup.children.length > 0) {
            this.seedsGroup.remove(this.seedsGroup.children[0]);
        }

        // Create reusable objects to avoid creating them in the loop
        const scaleMatrix = new THREE.Matrix4();
        const rotationMatrix = new THREE.Matrix4();
        const translationMatrix = new THREE.Matrix4();
        const finalMatrix = new THREE.Matrix4();
        const randomEuler = new THREE.Euler();
        
        // --- FIX 1: Capture the original scale from the template ---
        // This ensures the seeds are the correct size.
        const originalScale = this.seedMeshTemplate.scale;
        scaleMatrix.makeScale(originalScale.x, originalScale.y, originalScale.z);

        gameState.board.forEach((seedCount, pitIndex) => {
            if (seedCount > 0) {
                const pitWorldPosition = this.pitPositions[pitIndex];
                
                if (!pitWorldPosition) {
                    console.error(`CRITICAL: No position found for pit index ${pitIndex}. Cannot place seeds.`);
                    return;
                }
                
                // --- FIX 2: Calculate a much tighter radius based on the seed's own size ---
                // We use about 75% of a seed's width as the max spread.
                // This makes the seeds cluster tightly as if in a small pile.
                const tightRadius = this.seedDimensions.x * 1.5;

                
                for (let i = 0; i < seedCount; i++) {
                    // 1. Calculate the FINAL POSITION
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.sqrt(Math.random()) * tightRadius;
                    
                    const seedX = pitWorldPosition.x + Math.cos(angle) * radius;
                    const seedZ = pitWorldPosition.z + Math.sin(angle) * radius;
                    // --- FIX 3: Make piling denser ---
                    // Using a smaller multiplier makes the pile more compact.
                    const seedY = pitWorldPosition.y + (i * this.seedDimensions.y * .1) - (this.boardDimensions.depth * 0.14);

                    //console.log(`Placing seed ${i+1}/${seedCount} in pit ${pitIndex} at (${seedX.toFixed(2)}, ${seedY.toFixed(2)}, ${seedZ.toFixed(2)})`);

                    translationMatrix.makeTranslation(seedX, seedY, seedZ);

                    // 2. Calculate the FINAL ROTATION

                    const rotRand = Math.random() * Math.PI * 2;
                    //console.log(rotRand,"rotRand");
                    rotationMatrix.makeRotationY(rotRand);
                    //rotationMatrix.makeRotationX(rotRand);
                    //rotationMatrix.makeRotationZ(rotRand);
                    /*randomEuler.set(
                        Math.random() * Math.PI * 1,
                        Math.random() * Math.PI * 1,
                        Math.random() * Math.PI * 1
                    );
                    rotationMatrix.makeRotationFromEuler(randomEuler);
                        */
                    // 3. Combine matrices in the CORRECT ORDER: Translation * Rotation * Scale
                    // This means "first scale it, then rotate it, then move it".
                    // We achieve this by multiplying from right to left.
                    finalMatrix.multiplyMatrices(rotationMatrix, scaleMatrix); // Result = Rotation * Scale
                    finalMatrix.premultiply(translationMatrix); // Result = Translation * (Rotation * Scale)

                    // 4. Apply the final combined matrix to a new seed clone.
                    const seed = this.seedMeshTemplate.clone();
                    seed.matrix.copy(finalMatrix);
                    seed.matrixAutoUpdate = false;

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
        this.camera.position.set(0, yPos, 320);
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
