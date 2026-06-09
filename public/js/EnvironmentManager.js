import * as THREE from 'three';

export default class EnvironmentManager {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        
        // Ensure color management is correct
        this.pmremGenerator = new THREE.PMREMGenerator(renderer);
        this.pmremGenerator.compileEquirectangularShader();

        this.environments = ['zanzibar', 'serengeti', 'kilwa'];
        this.currentEnvIndex = 0;

        // Shared lighting and floor objects
        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        // The shadow camera size should be large enough to cover the board
        this.dirLight.shadow.camera.near = 0.5;
        this.dirLight.shadow.camera.far = 1500;
        this.dirLight.shadow.camera.left = -500;
        this.dirLight.shadow.camera.right = 500;
        this.dirLight.shadow.camera.top = 500;
        this.dirLight.shadow.camera.bottom = -500;
        this.scene.add(this.dirLight);

        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        this.scene.add(this.hemiLight);

        const floorGeo = new THREE.PlaneGeometry(5000, 5000);
        this.floorMat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1 });
        this.floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.y = -50; // Just below the board
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        // For Kilwa night torches
        this.pointLights = [];

        // For environment specific decorations (grass, fish)
        this.decorations = new THREE.Group();
        this.scene.add(this.decorations);
    }

    // Call this to set a specific environment
    setEnvironment(name) {
        // Cleanup old torch lights
        this.pointLights.forEach(l => this.scene.remove(l));
        this.pointLights = [];

        // Cleanup decorations
        this.decorations.clear();

        if (name === 'zanzibar') {
            this.setupZanzibar();
        } else if (name === 'serengeti') {
            this.setupSerengeti();
        } else if (name === 'kilwa') {
            this.setupKilwa();
        }

        this.updateEnvironmentMap();
    }

    cycleEnvironment() {
        this.currentEnvIndex = (this.currentEnvIndex + 1) % this.environments.length;
        const nextEnv = this.environments[this.currentEnvIndex];
        this.setEnvironment(nextEnv);
        return nextEnv;
    }

    updateEnvironmentMap() {
        // We create a temporary scene to capture the sky and lights for PBR reflections
        // This is much faster than loading a large HDR file
        const pmremScene = new THREE.Scene();
        pmremScene.background = this.scene.background;
        const envMap = this.pmremGenerator.fromScene(pmremScene).texture;
        this.scene.environment = envMap;
    }

    generateNoiseTexture(baseColorHex, noiseColorHex, density, scale = 1.0) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0, 0, 512, 512);

        // Add simple noise
        for (let i = 0; i < 512 * 512 * density; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            ctx.fillStyle = noiseColorHex;
            ctx.fillRect(x, y, scale, scale);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    generateStoneTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2c2e2c'; // Dark mortar
        ctx.fillRect(0, 0, 512, 512);

        // Draw rough stones
        const cols = 8;
        const rows = 8;
        const cellW = 512 / cols;
        const cellH = 512 / rows;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // Random offset for organic look
                const ox = (Math.random() - 0.5) * 10;
                const oy = (Math.random() - 0.5) * 10;
                
                const stoneBaseColor = 100 + Math.random() * 40; // grey variations
                ctx.fillStyle = `rgb(${stoneBaseColor}, ${stoneBaseColor + 5}, ${stoneBaseColor + 10})`;
                
                ctx.beginPath();
                // Draw irregular polygon in cell
                const margin = 6;
                const x = c * cellW + margin + ox;
                const y = r * cellH + margin + oy;
                const w = cellW - margin * 2;
                const h = cellH - margin * 2;

                ctx.moveTo(x + Math.random()*10, y + Math.random()*10);
                ctx.lineTo(x + w - Math.random()*10, y + Math.random()*10);
                ctx.lineTo(x + w - Math.random()*10, y + h - Math.random()*10);
                ctx.lineTo(x + Math.random()*10, y + h - Math.random()*10);
                ctx.closePath();
                ctx.fill();
            }
        }

        // Add some noise over everything
        for (let i = 0; i < 10000; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.3})`;
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(15, 15);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    setupZanzibar() {
        // Sunset atmosphere
        this.scene.background = new THREE.Color(0xffaa66); // Warm sunset orange/pink
        this.scene.fog = new THREE.FogExp2(0xffaa66, 0.0005);
        
        this.dirLight.color.setHex(0xffddaa);
        this.dirLight.intensity = 2.0;
        this.dirLight.position.set(-150, 100, 300);

        this.hemiLight.color.setHex(0xffaa66);
        this.hemiLight.groundColor.setHex(0x4444cc); // Blueish water/sky reflection
        this.hemiLight.intensity = 1.0;

        // Sand texture
        const sandTex = this.generateNoiseTexture('#e6d0ab', '#cbb083', 0.15, 2);
        this.floorMat.map = sandTex;
        this.floorMat.roughness = 0.9;
        this.floorMat.needsUpdate = true;

        this.addZanzibarFishes();
    }

    setupSerengeti() {
        // Midday savanna
        this.scene.background = new THREE.Color(0x88ccff); // Clear sky blue
        this.scene.fog = new THREE.FogExp2(0x88ccff, 0.0003);

        this.dirLight.color.setHex(0xffffff);
        this.dirLight.intensity = 2.5;
        this.dirLight.position.set(100, 400, 100);

        this.hemiLight.color.setHex(0xffffff);
        this.hemiLight.groundColor.setHex(0x8b7765); // Dirt
        this.hemiLight.intensity = 0.8;

        // Dry grass / dirt texture
        const dirtTex = this.generateNoiseTexture('#8b7765', '#a2907c', 0.2, 1.5);
        this.floorMat.map = dirtTex;
        this.floorMat.roughness = 1.0;
        this.floorMat.needsUpdate = true;

        this.addSerengetiGrass();
    }

    setupKilwa() {
        // Dusk/Night ruins
        this.scene.background = new THREE.Color(0x1a2b4c); // Deep night blue
        this.scene.fog = new THREE.FogExp2(0x1a2b4c, 0.001);

        // Moonlight
        this.dirLight.color.setHex(0xaaccff);
        this.dirLight.intensity = 2.5; // Increased significantly to make board visible
        this.dirLight.position.set(-200, 300, -200);

        this.hemiLight.color.setHex(0x2a3b5c);
        this.hemiLight.groundColor.setHex(0x222222);
        this.hemiLight.intensity = 1.2; // Increased ambient light

        // Stone texture
        const stoneTex = this.generateStoneTexture();
        this.floorMat.map = stoneTex;
        this.floorMat.roughness = 0.8;
        this.floorMat.needsUpdate = true;

        // Add warm torches (point lights)
        const torchColors = [0xffaa00, 0xff8800];
        const torchPositions = [
            [-300, 50, -300],
            [300, 50, 300],
            [-200, 50, 300],
            [300, 50, -200]
        ];

        torchPositions.forEach(pos => {
            const light = new THREE.PointLight(torchColors[Math.floor(Math.random()*torchColors.length)], 50000, 600);
            light.position.set(pos[0], pos[1], pos[2]);
            this.scene.add(light);
            this.pointLights.push(light);
        });
    }

    addSerengetiGrass() {
        const grassGeo = new THREE.ConeGeometry(4, 20, 3);
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 1.0 });
        const dummy = new THREE.Object3D();
        
        const count = 300;
        const instancedMesh = new THREE.InstancedMesh(grassGeo, grassMat, count);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;

        for (let i = 0; i < count; i++) {
            // Randomly scatter, avoiding the center board
            let x, z;
            do {
                x = (Math.random() - 0.5) * 2000;
                z = (Math.random() - 0.5) * 2000;
            } while (Math.abs(x) < 250 && Math.abs(z) < 200);

            dummy.position.set(x, -40, z);
            // Random slight tilt
            dummy.rotation.x = (Math.random() - 0.5) * 0.2;
            dummy.rotation.z = (Math.random() - 0.5) * 0.2;
            dummy.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale
            const scale = 0.5 + Math.random() * 1.5;
            dummy.scale.set(scale, scale, scale);
            
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        this.decorations.add(instancedMesh);
    }

    addZanzibarFishes() {
        // Create a simple cartoonish fish
        const bodyGeo = new THREE.SphereGeometry(10, 16, 16);
        bodyGeo.scale(1.5, 0.8, 0.5); // Stretch into fish shape
        const tailGeo = new THREE.ConeGeometry(5, 10, 3);
        tailGeo.rotateZ(-Math.PI / 2);
        tailGeo.translate(-15, 0, 0);

        // Merge into one fish geometry by using group
        const colors = [0xff5555, 0x55ff55, 0x5555ff, 0xffff55, 0xffaa00];

        for (let i = 0; i < 40; i++) {
            const fishGroup = new THREE.Group();
            
            const mat = new THREE.MeshStandardMaterial({ 
                color: colors[Math.floor(Math.random() * colors.length)], 
                roughness: 0.3 
            });
            const body = new THREE.Mesh(bodyGeo, mat);
            const tail = new THREE.Mesh(tailGeo, mat);
            
            body.castShadow = true;
            tail.castShadow = true;
            fishGroup.add(body);
            fishGroup.add(tail);

            // Randomly scatter
            let x, z;
            do {
                x = (Math.random() - 0.5) * 1500;
                z = (Math.random() - 0.5) * 1500;
            } while (Math.abs(x) < 250 && Math.abs(z) < 200);

            fishGroup.position.set(x, -45 + Math.random() * 10, z); // Floating just above/on sand
            fishGroup.rotation.y = Math.random() * Math.PI * 2;
            
            // Random scale
            const scale = 0.4 + Math.random() * 0.8;
            fishGroup.scale.set(scale, scale, scale);

            this.decorations.add(fishGroup);
        }
    }
}
