import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import EnvironmentManager from './EnvironmentManager.js';
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
    isBoardXLonger = true;

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
    myProfileId = null;

    // --- Queued state for handling updates that arrive during animation ---
    pendingState = null;

    // --- Callback fired when a move animation fully completes (incl. turn delay) ---
    // Set by main.js: gameSceneInstance.onAnimationComplete = (finalState) => { ... }
    onAnimationComplete = null;

    // --- Persistent seed mesh tracking for animation ---
    seedMeshesByPit = [];

    constructor(canvas, onPitClickCallback) {
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.onPitClickCallback = onPitClickCallback;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.seedsGroup = new THREE.Group();
        for (let i = 0; i < 32; i++) {
            this.seedMeshesByPit.push([]);
        }
    }

    // --- Loading progress helper ---
    _setLoadingProgress(percent, status) {
        const bar = document.getElementById('loading-bar');
        const statusEl = document.getElementById('loading-status');
        if (bar) bar.style.width = `${percent}%`;
        if (statusEl) statusEl.textContent = status;
    }

    _hideLoadingOverlay() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }

    createPitGeometry(boardModel) {
        const boundingBox = new THREE.Box3().setFromObject(boardModel);
        const boardSize = new THREE.Vector3();
        boundingBox.getSize(boardSize);
        boundingBox.getCenter(this.boardDimensions.center);

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
        // ── Derive every measurement from actual pit positions ──────────────
        //
        // Pit layout (isBoardXLonger = true, the common case):
        //   X axis → board length  (cols 0-7)
        //   Z axis → board depth   (rows: P1 outer/inner … P2 inner/outer)
        //
        //   P1 outer row : pit  0 (col 0) … pit  7 (col 7)  → pitPositions[0]…[7]
        //   P1 inner row : pit 15 (col 0) … pit  8 (col 7)  → pitPositions[15]…[8]
        //   P2 inner row : pit 16 (col 0) … pit 23 (col 7)  → pitPositions[16]…[23]
        //   P2 outer row : pit 31 (col 0) … pit 24 (col 7)  → pitPositions[31]…[24]
        //
        // For each axis we want:
        //   size   = span between the two extreme pit *centres* + 1 row/col worth of margin
        //   centre = midpoint of those two extremes
        //   + any board-model origin offset (boardDimensions.center)

        const colorP1 = 0x61afef;   // blue  — matches P1 badge
        const colorP2 = 0xe06c75;   // red   — matches P2 badge

        function createRect(w, h, color) {
            const shape = new THREE.Shape();
            shape.moveTo(-w/2, -h/2);
            shape.lineTo( w/2, -h/2);
            shape.lineTo( w/2,  h/2);
            shape.lineTo(-w/2,  h/2);
            shape.lineTo(-w/2, -h/2);
            const geo = new THREE.BufferGeometry().setFromPoints(
                shape.getPoints().map(p => new THREE.Vector3(p.x, p.y, 0))
            );
            return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
        }

        const boardY = this.pitPositions[0].y + 0.2;

        // Board-model bounding-box centre (handles GLB models whose origin ≠ geometry centre)
        const bCx = this.boardDimensions.center.x;
        const bCz = this.boardDimensions.center.z;

        if (this.isBoardXLonger) {
            // ── Long axis: X ──────────────────────────────────────────────
            // Leftmost pit centre in X  → pit 0 (col 0, any row)
            // Rightmost pit centre in X → pit 7 (col 7, any row)
            const xLeft   = this.pitPositions[0].x;
            const xRight  = this.pitPositions[7].x;
            const colSpan = xRight - xLeft;                  // 7 × colWidth
            const colWidth = colSpan / (this.COLS - 1);      // recover colWidth
            const rectW   = colSpan + colWidth;              // add half-col margin each side
            const centreX = (xLeft + xRight) / 2;            // pit midpoint

            // ── Short axis: Z (one rectangle per player) ──────────────────
            // P1: outer row (most-negative Z) = pitPositions[0].z
            //     inner row (closer to gap)   = pitPositions[8].z
            const p1Outer = this.pitPositions[0].z;
            const p1Inner = this.pitPositions[8].z;   // less negative than outer
            const p1RowSpan  = p1Inner - p1Outer;     // positive distance between row centres
            const p1RectH    = p1RowSpan + p1RowSpan; // add half-row margin on each side
            const p1CentreZ  = (p1Outer + p1Inner) / 2;

            // P2: inner row = pitPositions[16].z, outer row = pitPositions[24].z
            const p2Inner = this.pitPositions[16].z;
            const p2Outer = this.pitPositions[24].z;  // more positive than inner
            const p2RowSpan  = p2Outer - p2Inner;
            const p2RectH    = p2RowSpan + p2RowSpan;
            const p2CentreZ  = (p2Inner + p2Outer) / 2;

            this.player1Indicator = createRect(rectW, p1RectH, colorP1);
            this.player1Indicator.rotation.x = -Math.PI / 2;
            this.player1Indicator.position.set(centreX, boardY, p1CentreZ);

            this.player2Indicator = createRect(rectW, p2RectH, colorP2);
            this.player2Indicator.rotation.x = -Math.PI / 2;
            this.player2Indicator.position.set(centreX, boardY, p2CentreZ);

        } else {
            // ── Board rotated: long axis is Z ─────────────────────────────
            // pit  0 → position.z = pitX_on_plane + offset (the long-axis value)
            // pit  7 → same row, col 7
            const zLeft   = this.pitPositions[0].z;
            const zRight  = this.pitPositions[7].z;
            const colSpan = Math.abs(zRight - zLeft);
            const colWidth = colSpan / (this.COLS - 1);
            const rectLen  = colSpan + colWidth;
            const centreZ  = (zLeft + zRight) / 2;

            // P1/P2 split is along X in this orientation
            const p1Outer = this.pitPositions[0].x;
            const p1Inner = this.pitPositions[8].x;
            const p1RowSpan = Math.abs(p1Inner - p1Outer);
            const p1RectD   = p1RowSpan + p1RowSpan;
            const p1CentreX = (p1Outer + p1Inner) / 2;

            const p2Inner = this.pitPositions[16].x;
            const p2Outer = this.pitPositions[24].x;
            const p2RowSpan = Math.abs(p2Outer - p2Inner);
            const p2RectD   = p2RowSpan + p2RowSpan;
            const p2CentreX = (p2Outer + p2Inner) / 2;

            // createRect(w, h) → after rotation.x=-π/2: w→X, h→Z
            this.player1Indicator = createRect(p1RectD, rectLen, colorP1);
            this.player1Indicator.rotation.x = -Math.PI / 2;
            this.player1Indicator.position.set(p1CentreX, boardY, centreZ);

            this.player2Indicator = createRect(p2RectD, rectLen, colorP2);
            this.player2Indicator.rotation.x = -Math.PI / 2;
            this.player2Indicator.position.set(p2CentreX, boardY, centreZ);
        }

        this.player1Indicator.visible = false;
        this.player2Indicator.visible = false;
        this.scene.add(this.player1Indicator);
        this.scene.add(this.player2Indicator);
    }

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

        this._setLoadingProgress(20, 'Building environment…');

        this.envManager = new EnvironmentManager(this.scene, this.renderer);
        this.envManager.setEnvironment('zanzibar'); // Default environment

        this._setLoadingProgress(55, 'Loading board model…');

        const { boardModel, seedMeshTemplate } = await loadGameAssets();
        this.seedMeshTemplate = seedMeshTemplate;
        new THREE.Box3().setFromObject(this.seedMeshTemplate).getSize(this.seedDimensions);
        this.scene.add(boardModel);
        this.scene.add(this.seedsGroup);

        this._setLoadingProgress(80, 'Building board geometry…');

        this.createPitGeometry(boardModel);
        this.createHoverIndicators();

        this._setLoadingProgress(95, 'Starting renderer…');

        window.addEventListener('resize', this.onWindowResize.bind(this));
        this.renderer.domElement.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
        this.renderer.domElement.addEventListener('mouseleave', this.onCanvasMouseLeave.bind(this));
        this.renderer.domElement.addEventListener('mousedown', this.onCanvasMouseDown.bind(this));
        this.animate();

        // Small delay so the 100% state is visible briefly
        await new Promise(r => setTimeout(r, 300));
        this._setLoadingProgress(100, 'Ready!');
        await new Promise(r => setTimeout(r, 400));
        this._hideLoadingOverlay();
    }

    cycleEnvironment() {
        if (this.envManager) {
            return this.envManager.cycleEnvironment();
        }
    }

    // --- Update the player panel with P1/P2 labels, YOU badge, and turn indicator ---
    _updatePlayerPanel(gameState, myProfileId) {
        const isPlayer1 = myProfileId === gameState.player1_id;
        const player1Name = gameState.player1_name || 'Player 1';
        const player2Name = gameState.player2_name || (gameState.vsAi ? '🤖 Computer' : 'Player 2');
        const currentPlayer = gameState.currentPlayer; // 1 or 2

        const p1Card = document.getElementById('player1-card');
        const p2Card = document.getElementById('player2-card');
        const p1Name = document.getElementById('player1-card-name');
        const p2Name = document.getElementById('player2-card-name');
        const p1Status = document.getElementById('player1-card-status');
        const p2Status = document.getElementById('player2-card-status');

        if (!p1Card || !p2Card) return;

        // Set names with YOU indicator
        if (p1Name) {
            p1Name.textContent = player1Name;
            if (isPlayer1) p1Name.textContent += ' (You)';
        }
        if (p2Name) {
            p2Name.textContent = player2Name;
            if (!isPlayer1) p2Name.textContent += ' (You)';
        }

        // Turn highlighting
        if (currentPlayer === 1) {
            p1Card.classList.add('active-turn');
            p2Card.classList.remove('active-turn');
            if (p1Status) p1Status.textContent = isPlayer1 ? '▶ Your turn' : '▶ Their turn';
            if (p2Status) p2Status.textContent = '';
        } else {
            p2Card.classList.add('active-turn');
            p1Card.classList.remove('active-turn');
            if (p2Status) p2Status.textContent = !isPlayer1 ? '▶ Your turn' : '▶ Their turn';
            if (p1Status) p1Status.textContent = '';
        }
    }

    renderGameState(gameState, myProfileId) {
        this.currentGameState = gameState;
        if (myProfileId) this.myProfileId = myProfileId;

        if (!this.scene || !this.seedMeshTemplate || this.pitPositions.length === 0) {
            setTimeout(() => this.renderGameState(gameState, myProfileId || this.myProfileId), 150);
            return;
        }

        if (!this.cameraOriented && myProfileId && gameState.player1_id) {
            const isPlayer1 = myProfileId === gameState.player1_id;
            this.orientCameraForPlayer(isPlayer1);
            this.cameraOriented = true;
        }

        this._updatePlayerPanel(gameState, myProfileId || this.myProfileId);

        // Clear and rebuild seeds
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
        if (myProfileId) this.myProfileId = myProfileId;

        // If scene isn't ready yet, defer
        if (!this.scene || !this.seedMeshTemplate || this.pitPositions.length === 0) {
            setTimeout(() => this.playMoveAnimation(sequence, finalState, myProfileId || this.myProfileId), 150);
            return;
        }

        // If already animating, queue and bail
        if (this.isAnimating) {
            this.pendingState = { sequence, finalState };
            return;
        }

        // CRITICAL FIX: If the board hasn't been initialized with seeds yet
        // (i.e. on first move when no renderGameState was called yet),
        // we need to figure out the pre-move board state.
        // We reconstruct it by running the sequence backwards on finalState.
        // The simplest reliable approach: if seedMeshesByPit is all empty,
        // prime the board from finalState so seeds exist to animate.
        const totalSeedsOnBoard = this.seedMeshesByPit.reduce((s, p) => s + p.length, 0);
        if (totalSeedsOnBoard === 0) {
            // Prime from final state so we have meshes, then animate
            this._primeBoardFromState(finalState);
        }

        this.isAnimating = true;
        this._updatePlayerPanel(finalState, myProfileId || this.myProfileId);

        const movingPlayerNum = sequence[0]?.fromPit < 16 ? 1 : 2;
        const uiMessage = document.getElementById('ui-message');
        if (uiMessage) uiMessage.textContent = `Player ${movingPlayerNum} is moving…`;

        let seedsInHand = [];
        const tl = gsap.timeline({
            onComplete: () => {
                this.syncBoardWithState(finalState);
                if (uiMessage) uiMessage.textContent = finalState.message || '';
                console.log('Animation complete.');

                if (finalState.gameOver) {
                    // No turn transition — fire the game-over callback immediately
                    this.isAnimating = false;
                    if (this.onAnimationComplete) this.onAnimationComplete(finalState);
                } else {
                    // Show the between-turn overlay then re-enable input
                    this._showTurnTransition(finalState, () => {
                        this.isAnimating = false;
                        if (this.onAnimationComplete) this.onAnimationComplete(finalState);
                        // Process any queued state
                        if (this.pendingState) {
                            const { sequence: seq, finalState: fs } = this.pendingState;
                            this.pendingState = null;
                            this.playMoveAnimation(seq, fs, this.myProfileId);
                        }
                    });
                }
            }
        });

        sequence.forEach((step, index) => {
            const actionLabel = `step_${index}`;
            tl.addLabel(actionLabel);

            switch (step.action) {
                case 'lift':
                case 'relay': {
                    const fromPit = step.fromPit;
                    const available = this.seedMeshesByPit[fromPit];
                    const countToLift = Math.min(step.count, available.length);
                    const seedsToLift = available.splice(0, countToLift);
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
                    const available = this.seedMeshesByPit[fromPit];
                    const countToCapture = Math.min(step.count, available.length);
                    const seedsToCapture = available.splice(0, countToCapture);
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

    // --- Turn transition overlay ---
    _showTurnTransition(finalState, onDone) {
        const overlay  = document.getElementById('turn-transition');
        const inner    = overlay?.querySelector('.turn-transition-inner');
        const labelEl  = document.getElementById('turn-transition-label');
        const nameEl   = document.getElementById('turn-transition-name');
        const subEl    = document.getElementById('turn-transition-sub');
        if (!overlay) { if (onDone) onDone(); return; }

        const nextPlayer = finalState.currentPlayer; // already updated in finalState
        const isMe = (nextPlayer === 1)
            ? (this.myProfileId === finalState.player1_id)
            : (this.myProfileId === finalState.player2_id);
        const nextName = (nextPlayer === 1)
            ? (finalState.player1_name || 'Player 1')
            : (finalState.player2_name || 'Player 2');

        // Label text
        if (labelEl) labelEl.textContent = 'Turn complete';
        if (nameEl)  nameEl.textContent  = nextName;
        if (subEl)   subEl.textContent   = isMe ? 'Your turn — get ready!' : `${nextName}'s turn`;

        // Colour variant
        if (inner) {
            inner.classList.remove('p1-turn', 'p2-turn');
            inner.classList.add(nextPlayer === 1 ? 'p1-turn' : 'p2-turn');
            // Re-trigger the scale-in animation by cloning the node
            const clone = inner.cloneNode(true);
            inner.parentNode.replaceChild(clone, inner);
        }

        // Show
        overlay.classList.remove('hidden');

        // Hold for 1.8 s then hide
        const DISPLAY_MS = 1800;
        setTimeout(() => {
            overlay.classList.add('hidden');
            // Wait for the CSS fade-out (300 ms) before calling onDone
            setTimeout(() => { if (onDone) onDone(); }, 320);
        }, DISPLAY_MS);
    }

    // Prime the board with seed meshes based on a game state
    // Used when animation arrives before the first renderGameState
    _primeBoardFromState(state) {
        this.seedsGroup.clear();
        this.seedMeshesByPit.forEach(pit => pit.length = 0);
        state.board.forEach((seedCount, pitIndex) => {
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
    }

    getSeedRestingPosition(pitIndex) {
        const pitWorldPosition = this.pitPositions[pitIndex];
        const tightRadius = this.seedDimensions.x * 1.5;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * tightRadius;
        const seedX = pitWorldPosition.x + Math.cos(angle) * radius;
        const seedZ = pitWorldPosition.z + Math.sin(angle) * radius;
        const seedY = pitWorldPosition.y - 18;
        return new THREE.Vector3(seedX, seedY, seedZ);
    }

    syncBoardWithState(finalState) {
        console.log('Syncing board with final state…');
        this.currentGameState = finalState;

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
        // Update UI message and player panel after sync
        const uiMessage = document.getElementById('ui-message');
        if (uiMessage) uiMessage.textContent = finalState.message || `Player ${finalState.currentPlayer}'s turn.`;
        this._updatePlayerPanel(finalState, this.myProfileId);

        // Force a hover refresh if the mouse is currently resting on a pit
        if (this.lastHoveredPitIndex !== null && this.hoverInfoElement) {
            const seedCount = finalState.board[this.lastHoveredPitIndex];
            this.hoverInfoElement.textContent = `Pit ${this.lastHoveredPitIndex} · ${seedCount} seed${seedCount !== 1 ? 's' : ''}`;
        }
    }

    orientCameraForPlayer(isPlayer1) {
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
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.interactivePits);
        const boardHover = intersects.length > 0;
        if (this.player1Indicator) this.player1Indicator.visible = boardHover;
        if (this.player2Indicator) this.player2Indicator.visible = boardHover;

        if (boardHover) {
            // All pit circles are coplanar and can overlap, so instead of
            // trusting intersects[0] directly, find the pit whose 3D centre
            // is closest to the ray hit point. This gives the correct pit
            // even when adjacent circles overlap at the intersection.
            const hitPoint = intersects[0].point;
            let closestPitIndex = intersects[0].object.userData.pitIndex;
            let closestDist = Infinity;
            for (const hit of intersects) {
                const idx = hit.object.userData.pitIndex;
                const pitCenter = this.pitPositions[idx];
                const dx = hitPoint.x - pitCenter.x;
                const dz = hitPoint.z - pitCenter.z;
                const dist = dx * dx + dz * dz;
                if (dist < closestDist) {
                    closestDist = dist;
                    closestPitIndex = idx;
                }
            }
            const pitIndex = closestPitIndex;

            if (pitIndex !== this.lastHoveredPitIndex) {
                if (this.lastHoveredPitIndex !== null && this.pitMapSpans[this.lastHoveredPitIndex]) {
                    this.pitMapSpans[this.lastHoveredPitIndex].classList.remove('highlighted-pit');
                }
                if (this.pitMapSpans[pitIndex]) {
                    this.pitMapSpans[pitIndex].classList.add('highlighted-pit');
                }
                const seedCount = this.currentGameState ? this.currentGameState.board[pitIndex] : 'N/A';
                this.hoverInfoElement.textContent = `Pit ${pitIndex} · ${seedCount} seed${seedCount !== 1 ? 's' : ''}`;
                this.lastHoveredPitIndex = pitIndex;
            }
        } else {
            if (this.lastHoveredPitIndex !== null) {
                this.hoverInfoElement.textContent = 'Hover over a pit…';
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
        this.hoverInfoElement.textContent = 'Hover over a pit…';
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
