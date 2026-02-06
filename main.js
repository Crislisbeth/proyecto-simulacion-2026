import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística
const SPEED_LIMIT = 50;
const RADAR_SOUTH_Z = 50;
const RADAR_NORTH_Z = -50;
const ROAD_WIDTH = 14;
const LAMBDA = 0.8; // Parámetro de intensidad para el Proceso de Poisson
const PROB_INFRACTOR = 0.35; // Probabilidad de éxito en un Ensayo de Bernoulli (Infracción)
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';

// State
let vehicles = [];
let stats = { total: 0, infractions: 0 };
let csvData = [];
let dataIndex = 0;
let radarFlashes = { south: null, north: null };

// Provinces of Ecuador
const PROVINCES = {
    'A': 'Azuay', 'B': 'Bolívar', 'U': 'Cañar', 'C': 'Carchi', 'X': 'Cotopaxi',
    'H': 'Chimborazo', 'O': 'El Oro', 'E': 'Esmeraldas', 'W': 'Galápagos',
    'G': 'Guayas', 'I': 'Imbabura', 'L': 'Loja', 'R': 'Los Ríos', 'M': 'Manabí',
    'V': 'Morona Santiago', 'N': 'Napo', 'S': 'Pastaza', 'P': 'Pichincha',
    'Y': 'Santa Elena', 'J': 'Santo Domingo', 'Q': 'Orellana', 'T': 'Tungurahua',
    'Z': 'Zamora Chinchipe'
};

function generateEcuadorianPlate(provinceLetter) {
    const letters = Object.keys(PROVINCES);
    const pLetter = provinceLetter || letters[Math.floor(Math.random() * letters.length)];
    const provinceName = PROVINCES[pLetter] || 'Ecuador';
    const letter2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const letter3 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return { number: `${pLetter}${letter2}${letter3}-${numbers}`, city: provinceName };
}

async function loadCSV() {
    try {
        const response = await fetch(CSV_PATH);
        if (!response.ok) throw new Error("Dataset not found");
        const text = await response.text();
        // Manejar \r\n y filtrar líneas vacías
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).slice(1);
        csvData = lines.map(line => {
            const parts = line.split(';').map(p => p.trim());
            if (parts.length < 6) return null;
            const provName = parts[0].toUpperCase();
            let pLetter = 'P';
            for (const [letter, name] of Object.entries(PROVINCES)) {
                if (provName.includes(name.toUpperCase())) { pLetter = letter; break; }
            }
            const speed = parseInt(parts[parts.length - 2]);
            if (isNaN(speed)) return null;
            return { provinceLetter: pLetter, city: parts[1] || PROVINCES[pLetter], speed: speed };
        }).filter(d => d !== null);
        console.log(`Dataset cargado: ${csvData.length} registros.`);
    } catch (e) {
        console.warn("CSV no disponible, usando generación aleatoria.", e);
        csvData = [];
    }
}

function triggerCapture(vehicle) {
    const queue = document.getElementById('alert-queue');

    // 3D Radar Flash effect (Flash físico en el radar correspondiente)
    const flash = vehicle.direction === -1 ? radarFlashes.south : radarFlashes.north;
    if (flash) {
        flash.intensity = 150;
        setTimeout(() => { if (flash) flash.intensity = 0; }, 80);
        setTimeout(() => { if (flash) flash.intensity = 100; }, 150);
        setTimeout(() => { if (flash) flash.intensity = 0; }, 230);
    }

    // Create alert element
    const alert = document.createElement('div');
    alert.className = 'infraction-alert';
    alert.innerHTML = `
        <div class="alert-title">🚨 FOTOMULTA GENERADA</div>
        <div class="alert-details">
            <div class="alert-plate">${vehicle.plate.number}</div>
            <div class="alert-speed">${Math.round(vehicle.speedKmh)} km/h</div>
        </div>
    `;

    // Add to queue
    queue.prepend(alert);

    // Remove after timeout
    setTimeout(() => {
        alert.classList.add('alert-exit');
        setTimeout(() => alert.remove(), 500);
    }, 4500);
}

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa5d6f7); // Bright Quito sky
scene.fog = new THREE.Fog(0xa5d6f7, 50, 400);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(50, 40, 80);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

// Lighting
const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
sunLight.position.set(50, 80, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.left = -100;
sunLight.shadow.camera.right = 100;
sunLight.shadow.camera.top = 100;
sunLight.shadow.camera.bottom = -100;
scene.add(sunLight);

// Environment
function createEnvironment() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(1000, 1000, 100, 100);
    const posAttr = groundGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        if (Math.abs(x) > 50) posAttr.setZ(i, Math.random() * 10 + Math.abs(x) * 0.2);
    }
    groundGeo.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3d5a27, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Road
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 1000), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.1;
    road.receiveShadow = true;
    scene.add(road);

    // Double Yellow Line
    const lineGeo = new THREE.PlaneGeometry(0.3, 1000);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    const line1 = new THREE.Mesh(lineGeo, lineMat);
    line1.rotation.x = -Math.PI / 2;
    line1.position.set(0.2, 0.12, 0);
    scene.add(line1);
    const line2 = line1.clone();
    line2.position.x = -0.2;
    scene.add(line2);

    // Barriers
    const barrierGeo = new THREE.BoxGeometry(0.5, 1, 1000);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.2 });
    const leftBarrier = new THREE.Mesh(barrierGeo, barrierMat);
    leftBarrier.position.set(-ROAD_WIDTH / 2 - 0.5, 0.6, 0);
    scene.add(leftBarrier);
    const rightBarrier = leftBarrier.clone();
    rightBarrier.position.x = ROAD_WIDTH / 2 + 0.5;
    scene.add(rightBarrier);

    // Streetlights
    for (let i = -500; i < 500; i += 40) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        pole.position.set(-ROAD_WIDTH / 2 - 2, 6, i);
        scene.add(pole);

        const lightHead = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        lightHead.position.set(-ROAD_WIDTH / 2 - 1, 12, i);
        scene.add(lightHead);

        const sLight = new THREE.PointLight(0xffcc88, 5, 40);
        sLight.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        scene.add(sLight);
    }

    // Photo Radar 3D Models
    const createRadar = (id, x, z, rotation) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        if (rotation) group.rotation.y = rotation;

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 }));
        post.position.y = 5;
        post.castShadow = true;
        group.add(post);

        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 }));
        body.position.y = 10;
        body.castShadow = true;
        group.add(body);

        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 10.5, 0.6);
        group.add(lens);

        const flash = new THREE.PointLight(0xffffff, 0, 30);
        flash.position.set(0, 10.5, 0.8);
        group.add(flash);

        const signGeo = new THREE.PlaneGeometry(2, 1);
        const signCanvas = document.createElement('canvas');
        const signCtx = signCanvas.getContext('2d');
        signCanvas.width = 256; signCanvas.height = 128;
        signCtx.fillStyle = '#f1c40f'; signCtx.fillRect(0, 0, 256, 128);
        signCtx.font = 'Bold 60px Arial'; signCtx.fillStyle = 'black'; signCtx.textAlign = 'center'; signCtx.fillText('RADAR', 128, 80);
        const signTex = new THREE.CanvasTexture(signCanvas);
        const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
        sign.position.set(0, 7.5, 0.8);
        group.add(sign);

        radarFlashes[id] = flash;
        scene.add(group);
    };

    createRadar("south", ROAD_WIDTH / 2 + 3, RADAR_SOUTH_Z, 0);
    createRadar("north", -ROAD_WIDTH / 2 - 3, RADAR_NORTH_Z, Math.PI);

    // Mountains
    for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(new THREE.ConeGeometry(80 + Math.random() * 40, 100 + Math.random() * 100, 4), new THREE.MeshStandardMaterial({ color: 0x4a4a4a }));
        m.position.set(-200 - Math.random() * 50, 50, -300 + i * 100);
        m.rotation.y = Math.random() * Math.PI;
        scene.add(m);
    }
}

// Vehicle Class
class Vehicle {
    constructor(data, direction) {
        this.baseSpeedKmh = data ? data.speed : (Math.floor(Math.random() * 60) + 30);
        this.speedKmh = this.baseSpeedKmh;
        this.lastRoundedSpeed = -1;
        this.speedMs = this.speedKmh / 3.6;
        this.checked = false;
        this.direction = direction || (Math.random() > 0.5 ? 1 : -1);
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        if (data && data.city) this.plate.city = data.city;

        // Carriles: 2 por dirección. Sur: 2.5 y 5.5. Norte: -2.5 y -5.5
        const lanes = this.direction === -1 ? [2.5, 5.5] : [-2.5, -5.5];
        const laneX = lanes[Math.floor(Math.random() * lanes.length)];

        const spawnZ = this.direction === -1 ? 450 : -450;
        this.mesh = new THREE.Group();
        this.mesh.position.set(laneX, 0.8, spawnZ);
        if (this.direction === 1) this.mesh.rotation.y = Math.PI;

        const type = Math.floor(Math.random() * 3);
        const color = new THREE.Color().setHSL(Math.random(), 0.7, 0.4);
        const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.2 });
        this.bodyMaterial = bodyMat;

        if (type === 0) { // Sedan
            const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 5), bodyMat);
            this.mesh.add(base);
            const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 2.5), bodyMat);
            top.position.set(0, 0.75, 0);
            this.mesh.add(top);
        } else if (type === 1) { // SUV
            const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.5, 4.8), bodyMat);
            this.mesh.add(base);
        } else { // Sport
            const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 5.2), bodyMat);
            this.mesh.add(base);
            const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.5), bodyMat);
            spoiler.position.set(0, 0.6, 2.3);
            this.mesh.add(spoiler);
        }

        // Lights
        const headLightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const headLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 });
        const hl1 = new THREE.Mesh(headLightGeo, headLightMat);
        hl1.position.set(0.8, 0.1, -2.5);
        this.mesh.add(hl1);
        const hl2 = hl1.clone();
        hl2.position.x = -0.8;
        this.mesh.add(hl2);

        const pLight = new THREE.SpotLight(0xffffff, 10);
        pLight.position.set(0, 0.5, -2.5);
        pLight.target.position.set(0, 0.5, -50);
        this.mesh.add(pLight);
        this.mesh.add(pLight.target);

        const tailLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 });
        const tl1 = new THREE.Mesh(headLightGeo, tailLightMat);
        tl1.position.set(0.8, 0.2, 2.5);
        this.mesh.add(tl1);
        const tl2 = tl1.clone();
        tl2.position.x = -0.8;
        this.mesh.add(tl2);

        this.infoCard = this.createInfoCard();
        this.infoCard.position.y = 4;
        this.mesh.add(this.infoCard);

        scene.add(this.mesh);
    }

    updateInfoCard() {
        if (!this.infoCard) return;
        const canvas = this.infoCard.material.map.image;
        const context = canvas.getContext('2d');
        const roundedSpeed = Math.round(this.speedKmh);

        // Limpiar área de velocidad
        context.clearRect(0, 0, 512, 110);
        context.fillStyle = 'rgba(15, 23, 42, 0.95)';
        context.beginPath();
        context.roundRect(0, 0, 512, 110, { tl: 40, tr: 40, bl: 0, br: 0 });
        context.fill();

        // Actualizar borde y texto de velocidad
        context.lineWidth = 10;
        context.strokeStyle = roundedSpeed > SPEED_LIMIT ? '#ff3e3e' : '#22d3ee';
        context.stroke();

        context.font = 'Bold 100px Arial';
        context.fillStyle = context.strokeStyle;
        context.textAlign = 'center';
        context.fillText(`${roundedSpeed} km/h`, 256, 100);

        this.infoCard.material.map.needsUpdate = true;
    }

    createInfoCard() {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512; canvas.height = 256;
        context.fillStyle = 'rgba(15, 23, 42, 0.95)';
        context.roundRect(0, 0, 512, 256, 40);
        context.fill();
        context.lineWidth = 10;
        context.strokeStyle = this.speedKmh > SPEED_LIMIT ? '#ff3e3e' : '#22d3ee';
        context.stroke();
        context.font = 'Bold 100px Arial';
        context.fillStyle = context.strokeStyle;
        context.textAlign = 'center';
        context.fillText(`${Math.round(this.speedKmh)} km/h`, 256, 100);
        context.fillStyle = '#f1c40f';
        context.fillRect(60, 120, 392, 80);
        context.font = 'Bold 65px Courier New';
        context.fillStyle = 'black';
        context.fillText(this.plate.number, 256, 175);
        context.font = '36px Arial';
        context.fillStyle = 'white';
        context.fillText(this.plate.city.toUpperCase(), 256, 235);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
        sprite.scale.set(10, 5, 1);
        return sprite;
    }

    update(delta, allVehicles) {
        // Velocidad ESTRICTAMENTE CONSTANTE
        this.speedMs = this.speedKmh / 3.6;
        this.mesh.position.z += this.direction * this.speedMs * delta;

        // Lógica de "Cambio de Carril" para no sobreponerse (Sin Frenar)
        const currentLane = this.mesh.position.x;
        const otherLane = this.direction === -1
            ? (currentLane === 2.5 ? 5.5 : 2.5)
            : (currentLane === -2.5 ? -5.5 : -2.5);

        for (const other of allVehicles) {
            if (other === this || other.direction !== this.direction) continue;

            // Si hay alguien adelante en mi carril a menos de 15 metros
            const distZ = (this.mesh.position.z - other.mesh.position.z) * -this.direction;
            if (Math.abs(other.mesh.position.x - currentLane) < 1 && distZ > 0 && distZ < 15) {
                // Si el otro carril está libre en esa zona, me cambio
                const laneOccupied = allVehicles.some(v =>
                    v !== this &&
                    v.direction === this.direction &&
                    Math.abs(v.mesh.position.x - otherLane) < 1 &&
                    Math.abs(v.mesh.position.z - this.mesh.position.z) < 20
                );
                if (!laneOccupied) {
                    this.mesh.position.x = THREE.MathUtils.lerp(this.mesh.position.x, otherLane, 0.1);
                }
            }
        }

        this.updateInfoCard();

        const radarPos = this.direction === -1 ? RADAR_SOUTH_Z : RADAR_NORTH_Z;
        // Gatillo de detección EXACTO al cruzar la línea del radar
        const hasPassed = this.direction === -1
            ? (this.mesh.position.z <= radarPos)
            : (this.mesh.position.z >= radarPos);

        if (!this.checked && hasPassed) {
            this.checked = true;
            this.processDetection();
        }
    }

    processDetection() {
        stats.total++;
        document.getElementById('total-vehicles').innerText = stats.total;
        console.log(`[Radar] Vehículo ${this.plate.number} detectado a ${Math.round(this.speedKmh)} km/h`);

        if (this.speedKmh > SPEED_LIMIT) {
            stats.infractions++;
            document.getElementById('total-infractions').innerText = stats.infractions;
            this.bodyMaterial.color.setHex(0xff3e3e);
            this.bodyMaterial.emissive.setHex(0x550000);
            triggerCapture(this);
        } else {
            this.bodyMaterial.color.setHex(0x00e676);
        }
    }

    destroy() { scene.remove(this.mesh); }
}

function spawnLoop() {
    /** 
     * DISTRIBUCIÓN EXPONENCIAL
     * Se usa para modelar el tiempo entre arribos (inter-arrival times).
     * Fórmula: -ln(1 - R) / λ
     * Donde R es una variable aleatoria uniforme [0,1).
     */
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;
    const direction = Math.random() > 0.5 ? 1 : -1;
    const spawnZ = direction === -1 ? 450 : -450;

    /**
     * ENSAYO DE BERNOULLI
     * Se usa para decidir si el vehículo que aparece será un infractor 
     * (basado en el dataset real) o un conductor normal.
     */
    const isDataset = Math.random() < PROB_INFRACTOR;
    let data = null;

    if (isDataset && csvData.length > 0) {
        // Tomar un registro real del CSV (Infracción)
        data = csvData[Math.floor(Math.random() * csvData.length)];
    } else {
        // Generar un vehículo normal que NO cometa infracción
        data = {
            speed: Math.floor(Math.random() * 15) + 35, // 35 a 50 km/h
            provinceLetter: null,
            city: null
        };
    }

    // Carriles disponibles
    const lanes = direction === -1 ? [2.5, 5.5] : [-2.5, -5.5];
    const freeLanes = lanes.filter(lx => !vehicles.some(v =>
        v.direction === direction &&
        Math.abs(v.mesh.position.x - lx) < 1 &&
        Math.abs(v.mesh.position.z - spawnZ) < 15
    ));

    if (freeLanes.length > 0) {
        const laneX = freeLanes[Math.floor(Math.random() * freeLanes.length)];
        const v = new Vehicle(data, direction);
        v.mesh.position.x = laneX;
        vehicles.push(v);
    } else {
        // Si no hay carriles, intentamos de nuevo pronto
        setTimeout(spawnLoop, 300);
        return;
    }

    setTimeout(spawnLoop, delay);
}

// Init
createEnvironment();
loadCSV().then(() => {
    spawnLoop();
});

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        v.update(delta, vehicles);
        if (Math.abs(v.mesh.position.z) > 500) {
            v.destroy();
            vehicles.splice(i, 1);
        }
    }
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});