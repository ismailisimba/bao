import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
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

    // --- Dynamic geometry and grid properties ---
    boardDimensions = { width: 0, height: 0, center: new THREE.Vector3() };
    pitPositions = [];
    interactivePits = [];
    isBoardXLonger = true; // NEW: To track board orientation, default to true

    // Board layout constants
    COLS = 8;
    ROWS = 4;

    // --- Animation and UI state ---
    isAnimating = false;
    currentGameState = null;
    hoverInfoElement;
    pitMapSpans = [];
    player1Indicator;
    player2Indicator;
    lastHoveredPitIndex = null;
    
    // --- Persistent seed mesh tracking for animation ---
    seedMeshesByPit = [];


    constructor(canvas, onPitClickCallback) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.onPitClickCallback = onPitClickCallback;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.seedsGroup = new THREE.Group();
        // Initialize the tracking array
        for (let i = 0; i < 32; i++) {
            this.seedMeshesByPit.push([]);
        }
    }

    createPitGeometry(boardModel) {
        const boundingBox = new THREE.Box3().setFromObject(boardModel);
        const boardSize = new THREE.Vector3();
        boundingBox.getSize(boardSize);
        boundingBox.getCenter(this.boardDimensions.center);

        // --- CHANGE: Store the board's orientation ---
        this.isBoardXLonger = boardSize.x >= boardSize.z;
        
        const longerSide = this.isBoardXLonger ? boardSize.x : boardSize.z;
        const shorterSide = this.isBoardXLonger ? boardSize.z : boardSize.x;

        this.boardDimensions.width = longerSide;
        this.boardDimensions.depth = shorterSide;

        const colWidth = longerSide / this.COLS;
        const totalRatioParts = 5;
        const outerRowHeight = (shorterSide / totalRatioParts) * 1;
        const innerRowHeight = outerRowHeight;
        const gapHeight = 15;

        const z_p2_outer = (gapHeight / 2) + innerRowHeight + (outerRowHeight / 2);
        const z_p2_inner = (gapHeight / 2) + (innerRowHeight / 2);
        const z_p1_inner = -(gapHeight / 2) - (innerRowHeight / 2);
        const z_p1_outer = -(gapHeight / 2) - innerRowHeight - (outerRowHeight / 2);

        const rowCenterZs = [z_p1_outer, z_p1_inner, z_p2_inner, z_p2_outer];
        const startX = -longerSide / 2 + colWidth / 2;
        const topOfBoardY = this.boardDimensions.center.y + (boardSize.y / 2) + 0.1;

        this.pitPositions = new Array(32);
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const pitX_on_plane = startX + col * colWidth;
                const pitZ_on_plane = rowCenterZs[row];

                let pitIndex;
                if (row === 0) pitIndex = col;
                else if (row === 1) pitIndex = 15 - col;
                else if (row === 2) pitIndex = 16 + col;
                else if (row === 3) pitIndex = 31 - col;

                let position;
                if (this.isBoardXLonger) {
                    position = new THREE.Vector3(pitX_on_plane, topOfBoardY, pitZ_on_plane);
                } else {
                    // Swap X and Z if the board is deeper than it is wide
                    position = new THREE.Vector3(pitZ_on_plane, topOfBoardY, pitX_on_plane + this.boardDimensions.depth - 32);
                }
                this.pitPositions[pitIndex] = position;
            }
        }

        const pitGeometry = new THREE.CircleGeometry(colWidth / 2.5, 16);
        const pitMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0
        });

        const pitMeshesGroup = new THREE.Group();
        this.pitPositions.forEach((pos, index) => {
            const pitMesh = new THREE.Mesh(pitGeometry, pitMaterial);
            pitMesh.position.copy(pos);
            pitMesh.rotation.x = -Math.PI / 2;
            pitMesh.userData.pitIndex = index;
            pitMeshesGroup.add(pitMesh);
            this.interactivePits.push(pitMesh);
        });

        this.scene.add(pitMeshesGroup);
    }

    createHoverIndicators() {
        // Hollow rectangle geometry for each player's side
        const width = this.boardDimensions.width;
        const height = this.boardDimensions.depth / 2 * 1.1;
        const borderColor1 = 0x61afef;
        const borderColor2 = 0xe06c75;
        const borderThickness = 0.8;
        // Helper to create hollow rectangle (as LineSegments)
        function createRect(w, h, color) {
            const shape = new THREE.Shape();
            shape.moveTo(-w/2, -h/2);
            shape.lineTo(w/2, -h/2);
            shape.lineTo(w/2, h/2);
            shape.lineTo(-w/2, h/2);
            shape.lineTo(-w/2, -h/2);
            const points = shape.getPoints();
            const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, p.y, 0)));
            const material = new THREE.LineBasicMaterial({ color, linewidth: borderThickness });
            return new THREE.Line(geometry, material);
        }
        this.player1Indicator = createRect(width, height, borderColor1);
        this.player1Indicator.rotation.x = -Math.PI / 2;
        this.player1Indicator.position.set(-width/4, this.pitPositions[0].y+0.2, 0);
        this.player1Indicator.visible = false;
        this.scene.add(this.player1Indicator);

        this.player2Indicator = createRect(width, height, borderColor2);
        this.player2Indicator.rotation.x = -Math.PI / 2;
        this.player2Indicator.position.set(width/4, this.pitPositions[0].y+0.2, 0);
        this.player2Indicator.visible = false;
        this.scene.add(this.player2Indicator);

        if (!this.isBoardXLonger) {
            this.player1Indicator.rotation.z = Math.PI / 2;
            this.player2Indicator.rotation.z = Math.PI / 2;
            this.player1Indicator.position.set(-height/2 -3, this.pitPositions[0].y+0.2, height+27);
            this.player2Indicator.position.set(height/2 +3, this.pitPositions[0].y+0.2, height+27);
        }
    }
    
    // Unchanged from here...
    createPitMapUI() {
        const pitMapContainer = document.getElementById('pit-map');
        pitMapContainer.innerHTML = '';
        this.pitMapSpans = [];
        for (let i = 31; i >= 24; i--) this.pitMapSpans[i] = document.createElement('span');
        for (let i = 16; i <= 23; i++) this.pitMapSpans[i] = document.createElement('span');
        for (let i = 15; i >= 8; i--) this.pitMapSpans[i] = document.createElement('span');
        for (let i = 0; i <= 7; i++) this.pitMapSpans[i] = document.createElement('span');
        const displayOrder = [
            ...this.pitMapSpans.slice(24, 32).reverse(), ...this.pitMapSpans.slice(16, 24),
            ...this.pitMapSpans.slice(8, 16).reverse(), ...this.pitMapSpans.slice(0, 8),
        ];
        displayOrder.forEach((span) => {
            const originalIndex = this.pitMapSpans.indexOf(span);
            span.textContent = originalIndex;
            pitMapContainer.appendChild(span);
        });
    }

    async init() {
        this.hoverInfoElement = document.getElementById('hover-info');
        this.createPitMapUI();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 10, 5000);
        this.camera.position.set(0, 0, 0);
        this.camera.lookAt(0, 0, 0);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true; this.controls.dampingFactor = 0.05; this.controls.enablePan = false;
        this.controls.minDistance = 150; this.controls.maxDistance = 1000;
        this.controls.minPolarAngle = Math.PI / 4; this.controls.maxPolarAngle = Math.PI / 2.2;
        const rgbeLoader = new RGBELoader();
        const textureLoader = new THREE.TextureLoader();
        const GCS_ASSET_URL = './assets/';
        rgbeLoader.load(GCS_ASSET_URL + 'room_env.hdr', (t) => { t.mapping = THREE.EquirectangularReflectionMapping; this.scene.background = t; this.scene.environment = t; });
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
        directionalLight.position.set(-150, 200, 300); directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 4096; directionalLight.shadow.mapSize.height = 4096;
        this.scene.add(directionalLight);
        const floorGeometry = new THREE.PlaneGeometry(5000, 5000);
        const floorTexture = textureLoader.load(GCS_ASSET_URL + 'table_texture.jpg');
        floorTexture.wrapS = THREE.RepeatWrapping; floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(5, 5);
        const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.7 });
        const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.y = -50; floorMesh.receiveShadow = true; this.scene.add(floorMesh);
        const { boardModel, seedMeshTemplate } = await loadGameAssets();
        this.seedMeshTemplate = seedMeshTemplate;
        new THREE.Box3().setFromObject(this.seedMeshTemplate).getSize(this.seedDimensions);
        this.scene.add(boardModel);
        this.scene.add(this.seedsGroup);
        this.createPitGeometry(boardModel);
        this.createHoverIndicators();
        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.domElement.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
        this.renderer.domElement.addEventListener('mouseleave', this.onCanvasMouseLeave.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onCanvasMouseDown.bind(this));
        this.animate();
    }

    renderGameState(gameState, myProfileId) {
        this.currentGameState = gameState;

        if (!this.scene || !this.seedMeshTemplate || this.pitPositions.length === 0) {
            setTimeout(() => this.renderGameState(gameState, myProfileId), 150);
            return;
        }

        if (!this.cameraOriented && myProfileId && gameState.player1_id) {
            const isPlayer1 = myProfileId === gameState.player1_id;
            this.orientCameraForPlayer(isPlayer1);
            this.cameraOriented = true;
        }

        // --- Overlay: Set player info ---
        const currentPlayerNum = gameState.currentPlayer;
        const isPlayer1 = myProfileId === gameState.player1_id;
        const player1Name = gameState.player1_name|| 'Player 1';
        const player2Name = gameState.player2_name || 'Player 2';
        const currentPlayerName = isPlayer1 ? player1Name : player2Name;
        const opponentName = isPlayer1 ? player2Name : player1Name;
        const currentPlayerColor = currentPlayerNum === 1 ? '#e06c75' : '#61afef';
        const opponentColor = currentPlayerNum === 1 ? '#61afef' : '#e06c75';
        const currentPlayerNameEl = document.getElementById('current-player-name');
        const currentPlayerColorEl = document.getElementById('current-player-color');
        const opponentNameEl = document.getElementById('opponent-name');
        const opponentColorEl = document.getElementById('opponent-color');
        if (currentPlayerNameEl) currentPlayerNameEl.textContent = currentPlayerName;
        if (currentPlayerColorEl) currentPlayerColorEl.style.background = currentPlayerColor;
        if (opponentNameEl) opponentNameEl.textContent = opponentName;
        if (opponentColorEl) opponentColorEl.style.background = opponentColor;

        this.seedsGroup.clear();
        this.seedMeshesByPit.forEach(pit => pit.length = 0);

        gameState.board.forEach((seedCount, pitIndex) => {
            for (let i = 0; i < seedCount; i++) {
                const seed = this.seedMeshTemplate.clone();
                const pos = this.getSeedRestingPosition(pitIndex);
                seed.position.copy(pos);
                seed.rotation.y = Math.random() * Math.PI * 2;
                seed.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
                this.seedsGroup.add(seed);
                this.seedMeshesByPit[pitIndex].push(seed);
            }
        });

        const uiMessage = document.getElementById('ui-message');
        if (uiMessage) {
            uiMessage.textContent = gameState.message || `Player ${gameState.currentPlayer}'s turn.`;
        }
    }

    playMoveAnimation(sequence, finalState, myProfileId) {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.currentGameState = finalState;

        document.getElementById('ui-message').textContent = `Animating player ${sequence[0].action === 'lift' ? (sequence[0].fromPit < 16 ? 1 : 2) : ''}'s move...`;

        let seedsInHand = [];
        const tl = gsap.timeline({
            onComplete: () => {
                this.syncBoardWithState(finalState);
                this.isAnimating = false;
                document.getElementById('ui-message').textContent = finalState.message;
                console.log("Animation complete.");
            }
        });

        sequence.forEach((step, index) => {
            const actionLabel = `step_${index}`;
            tl.addLabel(actionLabel);

            switch (step.action) {
                case 'lift':
                case 'relay': {
                    const fromPit = step.fromPit;
                    const seedsToLift = this.seedMeshesByPit[fromPit].splice(0, step.count);
                    seedsInHand.push(...seedsToLift);
                    const pitCenter = this.pitPositions[fromPit];
                    seedsToLift.forEach((seed, i) => {
                        tl.to(seed.position, {
                            x: pitCenter.x, y: pitCenter.y + 40 + i * 0.5, z: pitCenter.z,
                            duration: 0.4, ease: 'power2.out'
                        }, actionLabel);
                    });
                    break;
                }
                case 'capture': {
                    const fromPit = step.fromPit;
                    const seedsToCapture = this.seedMeshesByPit[fromPit].splice(0, step.count);
                    seedsInHand.push(...seedsToCapture);
                    const targetPitCenter = this.pitPositions[step.toPit];
                     seedsToCapture.forEach((seed, i) => {
                        tl.to(seed.position, {
                            x: targetPitCenter.x, y: targetPitCenter.y + 40 + i * 0.5, z: targetPitCenter.z,
                            duration: 0.6, ease: 'power2.inOut'
                        }, actionLabel);
                    });
                    break;
                }
                case 'sow': {
                    if (seedsInHand.length > 0) {
                        const seedToSow = seedsInHand.shift();
                        const toPit = step.toPit;
                        const targetPos = this.getSeedRestingPosition(toPit);
                        this.seedMeshesByPit[toPit].push(seedToSow);
                        tl.to(seedToSow.position, {
                            x: targetPos.x, y: targetPos.y + 20, z: targetPos.z,
                            duration: 0.2, ease: 'power1.out'
                        }, actionLabel)
                        .to(seedToSow.position, {
                            y: targetPos.y, duration: 0.15, ease: 'bounce.out'
                        });
                    }
                    break;
                }
            }
        });
    }

    getSeedRestingPosition(pitIndex) {
        const pitWorldPosition = this.pitPositions[pitIndex];
        const seedCountInPit = this.seedMeshesByPit[pitIndex].length;
        const tightRadius = this.seedDimensions.x * 1.5;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * tightRadius;
        const seedX = pitWorldPosition.x + Math.cos(angle) * radius;
        const seedZ = pitWorldPosition.z + Math.sin(angle) * radius;
        const seedY = pitWorldPosition.y - 18;
        return new THREE.Vector3(seedX, seedY, seedZ);
    }
    
    syncBoardWithState(finalState) {
        console.log("Syncing board with final state...");
        finalState.board.forEach((expectedCount, pitIndex) => {
            const actualCount = this.seedMeshesByPit[pitIndex].length;
            if (actualCount !== expectedCount) {
                console.warn(`Discrepancy in pit ${pitIndex}: Server says ${expectedCount}, client has ${actualCount}. Correcting.`);
                while (this.seedMeshesByPit[pitIndex].length > expectedCount) {
                    const seedToRemove = this.seedMeshesByPit[pitIndex].pop();
                    this.seedsGroup.remove(seedToRemove);
                }
                while (this.seedMeshesByPit[pitIndex].length < expectedCount) {
                    const seed = this.seedMeshTemplate.clone();
                    const pos = this.getSeedRestingPosition(pitIndex);
                    seed.position.copy(pos);
                    this.seedsGroup.add(seed);
                    this.seedMeshesByPit[pitIndex].push(seed);
                }
            }
        });
    }

    orientCameraForPlayer(isPlayer1) {
        // Camera higher, looking down, and offset left by half the board's long side
        // Zoom in 2.5x closer than before
        const dist = 400 / 2.5;
        let camX = 0, camY = 900 / 2.5, camZ = 0;
        let lookAt = new THREE.Vector3(0, 0, 120);
        const offset = (this.isBoardXLonger ? this.boardDimensions.width : this.boardDimensions.depth) / 4;
        if (this.isBoardXLonger) {
            camZ = isPlayer1 ? dist : -dist;
            camX = isPlayer1 ? -offset/2 : offset/2;
        } else {
            camX = isPlayer1 ? -dist : dist;
            camZ = isPlayer1 ? -offset/2 : offset/2;
        }
        // Look at the center of the board
        gsap.to(this.camera.position, { x: camX, y: camY, z: camZ, duration: 1.5, ease: 'power2.inOut', onUpdate: () => this.camera.lookAt(lookAt) });
        gsap.to(this.controls.target, { x: lookAt.x, y: lookAt.y, z: lookAt.z, duration: 1.5, ease: 'power2.inOut' });
    }

    onCanvasMouseDown(event) {
        if (this.isAnimating) return;
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactivePits);
        if (intersects.length > 0) {
            const pitIndex = intersects[0].object.userData.pitIndex;
            if (pitIndex !== undefined && this.onPitClickCallback) {
                this.onPitClickCallback(pitIndex);
            }
        }
    }

    onCanvasMouseMove(event) {
        // Only show indicators if mouse is over/near the board
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactivePits);
        const boardHover = intersects.length > 0;
        if (this.player1Indicator) this.player1Indicator.visible = boardHover;
        if (this.player2Indicator) this.player2Indicator.visible = boardHover;
        if (boardHover) {
            const pitIndex = intersects[0].object.userData.pitIndex;
            if (pitIndex !== this.lastHoveredPitIndex) {
                if (this.lastHoveredPitIndex !== null && this.pitMapSpans[this.lastHoveredPitIndex]) {
                    this.pitMapSpans[this.lastHoveredPitIndex].classList.remove('highlighted-pit');
                }
                if (this.pitMapSpans[pitIndex]) {
                    this.pitMapSpans[pitIndex].classList.add('highlighted-pit');
                }
                const seedCount = this.currentGameState ? this.currentGameState.board[pitIndex] : 'N/A';
                this.hoverInfoElement.textContent = `Pit ${pitIndex} (${seedCount} seeds)`;
                this.lastHoveredPitIndex = pitIndex;
            }
        } else {
            if (this.lastHoveredPitIndex !== null) {
                this.hoverInfoElement.textContent = 'Hover over a pit...';
                if (this.pitMapSpans[this.lastHoveredPitIndex]) {
                    this.pitMapSpans[this.lastHoveredPitIndex].classList.remove('highlighted-pit');
                }
                this.lastHoveredPitIndex = null;
            }
        }
    }

    onCanvasMouseLeave() {
        if (this.player1Indicator) this.player1Indicator.visible = false;
        if (this.player2Indicator) this.player2Indicator.visible = false;
        this.hoverInfoElement.textContent = 'Hover over a pit...';
        if (this.lastHoveredPitIndex !== null && this.pitMapSpans[this.lastHoveredPitIndex]) {
            this.pitMapSpans[this.lastHoveredPitIndex].classList.remove('highlighted-pit');
        }
        this.lastHoveredPitIndex = null;
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
