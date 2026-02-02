import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística
const SPEED_LIMIT = 50;
const RADAR_Z = 0;
const ROAD_WIDTH = 14;
const LAMBDA = 0.6; // Tasa de llegada (vehículos por segundo)
const PROB_INFRACTOR = 0.3; // Probabilidad de éxito (Binomial): Proporción de infractores del CSV
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';

// State
let vehicles = [];
let stats = { total: 0, infractions: 0 };
let csvData = [];
let dataIndex = 0;
let radarFlashLight;

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
        const text = await response.text();
        const lines = text.split('\n').slice(1);
        csvData = lines.map(line => {
            const parts = line.split(';');
            if (parts.length < 6) return null;
            const provName = parts[0].toUpperCase();
            let pLetter = 'P';
            for (const [letter, name] of Object.entries(PROVINCES)) {
                if (provName.includes(name.toUpperCase())) { pLetter = letter; break; }
            }
            return { provinceLetter: pLetter, city: parts[1] || PROVINCES[pLetter], speed: parseInt(parts[parts.length - 2]) || 60 };
        }).filter(d => d !== null);
    } catch (e) { console.error("Error loading CSV:", e); }
}

function triggerCapture(vehicle) {
    const queue = document.getElementById('alert-queue');

    // 3D Radar Flash effect (Flash físico en el radar)
    if (radarFlashLight) {
        radarFlashLight.intensity = 150;
        setTimeout(() => { radarFlashLight.intensity = 0; }, 80);
        setTimeout(() => { radarFlashLight.intensity = 100; }, 150);
        setTimeout(() => { radarFlashLight.intensity = 0; }, 230);
    }

    // Create alert element
    const alert = document.createElement('div');
    alert.className = 'infraction-alert';
    alert.innerHTML = `
        <div class="alert-title">🚨 FOTOMULTA GENERADA</div>
        <div class="alert-details">
            <div class="alert-plate">${vehicle.plate.number}</div>
            <div class="alert-speed">${vehicle.speedKmh} km/h</div>
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
camera.position.set(25, 20, 45);

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

        const sLight = new THREE.PointLight(0xffcc88, 5, 40); // Dimmer for daytime
        sLight.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        scene.add(sLight);
    }

    // Photo Radar 3D Model
    const radarGroup = new THREE.Group();
    radarGroup.position.set(-ROAD_WIDTH / 2 - 3, 0, RADAR_Z);

    // Post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 }));
    post.position.y = 5;
    post.castShadow = true;
    radarGroup.add(post);

    // Main Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 }));
    body.position.y = 10;
    body.castShadow = true;
    radarGroup.add(body);

    // Camera Lens
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 10.5, 0.6);
    radarGroup.add(lens);

    // Flash Light (PointLight)
    radarFlashLight = new THREE.PointLight(0xffffff, 0, 30);
    radarFlashLight.position.set(0, 10.5, 0.8);
    radarGroup.add(radarFlashLight);

    // Sign "RADAR"
    const signGeo = new THREE.PlaneGeometry(2, 1);
    const signCanvas = document.createElement('canvas');
    const signCtx = signCanvas.getContext('2d');
    signCanvas.width = 256; signCanvas.height = 128;
    signCtx.fillStyle = '#f1c40f'; signCtx.fillRect(0, 0, 256, 128);
    signCtx.font = 'Bold 60px Arial'; signCtx.fillStyle = 'black'; signCtx.textAlign = 'center'; signCtx.fillText('RADAR', 128, 80);
    const signTex = new THREE.CanvasTexture(signCanvas);
    const sign = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
    sign.position.set(0, 7.5, 0.8);
    radarGroup.add(sign);

    scene.add(radarGroup);

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
    constructor(data) {
        this.speedKmh = data ? data.speed : (Math.floor(Math.random() * 60) + 30);
        this.speedMs = this.speedKmh / 3.6;
        this.checked = false;
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        if (data && data.city) this.plate.city = data.city;

        const lane = Math.random() > 0.5 ? 4 : -4;
        this.mesh = new THREE.Group();
        this.mesh.position.set(lane, 0.8, 400);

        // Body with variant
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

        // Headlights
        const headLightGeo = new THREE.BoxGeometry(0.5, 0.3, 0.1);
        const headLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2 });
        const hl1 = new THREE.Mesh(headLightGeo, headLightMat);
        hl1.position.set(0.8, 0.1, -2.5);
        this.mesh.add(hl1);
        const hl2 = hl1.clone();
        hl2.position.x = -0.8;
        this.mesh.add(hl2);

        // Actual Lights
        const pLight = new THREE.SpotLight(0xffffff, 10);
        pLight.position.set(0, 0.5, -2.5);
        pLight.target.position.set(lane, 0.5, -50);
        this.mesh.add(pLight);
        this.mesh.add(pLight.target);

        // Taillights
        const tailLightMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1 });
        const tl1 = new THREE.Mesh(headLightGeo, tailLightMat);
        tl1.position.set(0.8, 0.2, 2.5);
        this.mesh.add(tl1);
        const tl2 = tl1.clone();
        tl2.position.x = -0.8;
        this.mesh.add(tl2);

        // Info Card
        this.infoCard = this.createInfoCard();
        this.infoCard.position.y = 4;
        this.mesh.add(this.infoCard);

        scene.add(this.mesh);
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
        context.fillText(`${this.speedKmh} km/h`, 256, 100);
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

    update(delta) {
        this.mesh.position.z -= this.speedMs * delta;
        if (!this.checked && this.mesh.position.z <= RADAR_Z) {
            this.checked = true;
            this.processDetection();
        }
    }

    processDetection() {
        stats.total++;
        document.getElementById('total-vehicles').innerText = stats.total;
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

// Función de Spawning Estadístico
function spawnLoop() {
    // 1. Distribución Exponencial (Tiempo entre llegadas)
    // t = -ln(1-u) / lambda
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;

    // 2. Distribución Binomial (Categorización del vehículo)
    // u < p -> Éxito (Infractor de CSV)
    const isInfractor = Math.random() < PROB_INFRACTOR;

    let data = null;
    if (isInfractor && csvData.length > 0) {
        data = csvData[dataIndex % csvData.length];
        dataIndex++;
    } else {
        // Generar vehículo normal (Velocidad segura)
        data = {
            speed: Math.floor(Math.random() * 15) + 35, // 35-50 km/h
            provinceLetter: null, // Aleatorio
            city: null
        };
    }

    vehicles.push(new Vehicle(data));

    // Recursión para mantener el flujo
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
    const delta = (time - lastTime) / 1000;
    lastTime = time;
    for (let i = vehicles.length - 1; i >= 0; i--) {
        vehicles[i].update(delta);
        if (vehicles[i].mesh.position.z < -400) { vehicles[i].destroy(); vehicles.splice(i, 1); }
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
