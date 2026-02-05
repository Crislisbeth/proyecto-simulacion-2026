import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística
const SPEED_LIMIT = 50;
const RADAR_SOUTH_Z = 150; // Antes del semáforo (60)
const RADAR_NORTH_Z = -30; // Antes del semáforo (60)
const SEMAPHORE_Z = 60;
const ROAD_WIDTH = 14;
const LAMBDA = 0.6; // Ajustado para una vía
const PROB_INFRACTOR = 0.3;
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';

// Detection Points
const MAIN_RADAR_Z = 0;
const CROSS_RADAR_X = 0;

// Traffic Light States
const LIGHT = { GREEN: 'green', YELLOW: 'yellow', RED: 'red' };
let currentLight = LIGHT.GREEN;
let lightTimer = 0;
const LIGHT_DURATIONS = { green: 15, yellow: 3, red: 10 };

// State
let vehicles = [];
let stats = { total: 0, infractions: 0, redLights: 0 };
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
    return { number: `${pLetter}${letter2}${letter3} -${numbers} `, city: provinceName };
}

async function loadCSV() {
    try {
        const response = await fetch(CSV_PATH);
        if (!response.ok) throw new Error("No se pudo cargar el CSV");
        const text = await response.text();
        const lines = text.split(/\r?\n/).slice(1); // Manejar \r\n
        csvData = lines.map(line => {
            const parts = line.split(';').map(p => p.trim());
            if (parts.length < 5) return null;
            const provName = parts[0].toUpperCase();
            let pLetter = 'P';
            for (const [letter, name] of Object.entries(PROVINCES)) {
                if (provName.includes(name.toUpperCase())) { pLetter = letter; break; }
            }
            // Intentar obtener la velocidad de la penúltima columna
            const speed = parseInt(parts[parts.length - 2]);
            if (isNaN(speed)) return null;

            return {
                provinceLetter: pLetter,
                city: parts[1] || PROVINCES[pLetter],
                speed: speed
            };
        }).filter(d => d !== null);
        console.log(`Dataset CSV cargado: ${csvData.length} registros`);
    } catch (e) {
        console.error("Error cargando el dataset del usuario:", e);
    }
}

function triggerCapture(vehicle) {
    try {
        const queue = document.getElementById('alert-queue');
        if (!queue) return;

        // 3D Radar Flash effect
        const radarId = vehicle.direction === -1 ? "south" : "north";
        if (window.radars && window.radars[radarId]) {
            const flash = window.radars[radarId].flash;
            if (flash) {
                flash.intensity = 150;
                setTimeout(() => { if (flash) flash.intensity = 0; }, 80);
                setTimeout(() => { if (flash) flash.intensity = 100; }, 150);
                setTimeout(() => { if (flash) flash.intensity = 0; }, 230);
            }
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
    } catch (e) {
        console.error('Error en triggerCapture:', e);
    }
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
controls.target.set(0, 0, 20); // Centrar vista entre radar y resalto

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

    // Main Road Double Yellow Line
    const lineGeo = new THREE.PlaneGeometry(0.3, 1000);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    const mLine1 = new THREE.Mesh(lineGeo, lineMat);
    mLine1.rotation.x = -Math.PI / 2;
    mLine1.position.set(0.2, 0.13, 0);
    scene.add(mLine1);
    const mLine2 = mLine1.clone();
    mLine2.position.x = -0.2;
    scene.add(mLine2);

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

        const sLight = new THREE.PointLight(0xffcc88, 5, 20); // Alcance optimizado
        sLight.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        sLight.castShadow = false;
        scene.add(sLight);
    }

    // Photo Radar 3D Models (Two: one for North, one for South)
    const createRadar = (id, x, z, rotation) => {
        const radarGroup = new THREE.Group();
        radarGroup.position.set(x, 0, z);
        if (rotation) radarGroup.rotation.y = rotation;

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
        const flash = new THREE.PointLight(0xffffff, 0, 30);
        flash.position.set(0, 10.5, 0.8);
        radarGroup.add(flash);

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

        if (!window.radars) window.radars = {};
        window.radars[id] = { group: radarGroup, flash };
        scene.add(radarGroup);
    };

    createRadar("south", ROAD_WIDTH / 2 + 3, RADAR_SOUTH_Z, 0);
    createRadar("north", -ROAD_WIDTH / 2 - 3, RADAR_NORTH_Z, Math.PI);

    // Semáforos 3D (Uno en el lado derecho de cada carril antes del cruce)
    createTrafficLight(ROAD_WIDTH / 2 + 3, 0, SEMAPHORE_Z + 10, "south", 0); // Para South (400->-400), mira al Norte
    createTrafficLight(-(ROAD_WIDTH / 2 + 3), 0, SEMAPHORE_Z - 10, "north", Math.PI); // Para North (-400->400), mira al Sur

    // Edificios y Decoración "Premium" - REMOVIDO POR SOLICITUD

    // Aceras (Sidewalks)
    const swMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 });
    // Acera principal
    const swLeft = new THREE.Mesh(new THREE.PlaneGeometry(10, 1000), swMat);
    swLeft.rotation.x = -Math.PI / 2;
    swLeft.position.set(-(ROAD_WIDTH / 2 + 5), 0.15, 0);
    scene.add(swLeft);
    const swRight = swLeft.clone();
    swRight.position.x = (ROAD_WIDTH / 2 + 5);
    scene.add(swRight);

    // Árboles en las aceras
    const treeGeo = new THREE.ConeGeometry(2, 6, 8);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d4c1e });
    for (let i = -400; i < 400; i += 50) {
        if (Math.abs(i - SEMAPHORE_Z) < 20) continue;
        const t1 = new THREE.Mesh(treeGeo, treeMat);
        t1.position.set(-(ROAD_WIDTH / 2 + 5), 3, i);
        scene.add(t1);
        const t2 = t1.clone();
        t2.position.x = (ROAD_WIDTH / 2 + 5);
        scene.add(t2);
    }

    // Pasos de Cebra (Crosswalks) - Solo en la vía principal
    for (let i = -ROAD_WIDTH / 2 + 1; i < ROAD_WIDTH / 2; i += 2) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(i, 0.16, SEMAPHORE_Z);
        scene.add(stripe);
    }
}

function createTrafficLight(x, y, z, id, rotation) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    if (rotation !== undefined) group.rotation.y = rotation;

    // Poste
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pole.position.y = 6;
    group.add(pole);

    // Caja de luces
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.5, 1.2), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    box.position.y = 11;
    group.add(box);

    // Luces
    const lightGeo = new THREE.SphereGeometry(0.4, 16, 16);
    const redLight = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff0000, emissiveIntensity: 0 }));
    redLight.position.set(0, 12.2, 0.5);
    group.add(redLight);

    const yellowLight = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0x333300, emissive: 0xffff00, emissiveIntensity: 0 }));
    yellowLight.position.set(0, 11, 0.5);
    group.add(yellowLight);

    const greenLight = new THREE.Mesh(lightGeo, new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x00ff00, emissiveIntensity: 0 }));
    greenLight.position.set(0, 9.8, 0.5);
    group.add(greenLight);

    if (!window.trafficLights) window.trafficLights = {};
    window.trafficLights[id] = { redLight, yellowLight, greenLight };
    scene.add(group);
}

function updateTrafficLight(delta) {
    if (!window.trafficLights) return;
    lightTimer += delta;

    if (currentLight === LIGHT.GREEN && lightTimer > LIGHT_DURATIONS.green) {
        currentLight = LIGHT.YELLOW;
        lightTimer = 0;
    } else if (currentLight === LIGHT.YELLOW && lightTimer > LIGHT_DURATIONS.yellow) {
        currentLight = LIGHT.RED;
        lightTimer = 0;
    } else if (currentLight === LIGHT.RED && lightTimer > LIGHT_DURATIONS.red) {
        currentLight = LIGHT.GREEN;
        lightTimer = 0;
    }

    // Actualizar estados visuales
    const lights = [window.trafficLights.south, window.trafficLights.north];
    lights.forEach(ref => {
        ref.greenLight.material.emissiveIntensity = currentLight === LIGHT.GREEN ? 2 : 0;
        ref.yellowLight.material.emissiveIntensity = currentLight === LIGHT.YELLOW ? 2 : 0;
        ref.redLight.material.emissiveIntensity = currentLight === LIGHT.RED ? 2 : 0;
    });
}

// Pedestrian Class
class Pedestrian {
    constructor() {
        this.side = Math.random() > 0.5 ? 1 : -1; // Comienza a la izquierda o derecha
        this.z = SEMAPHORE_Z + (Math.random() - 0.5) * 4; // Cruza por el paso cebra
        this.x = this.side * (ROAD_WIDTH / 2 + 5);
        this.targetX = -this.x;
        this.speed = 1.5 + Math.random() * 1.0;
        this.waiting = true;

        this.mesh = new THREE.Group();
        // Cuerpo simple (Cilindro)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.8), new THREE.MeshStandardMaterial({ color: Math.random() * 0xffffff }));
        body.position.y = 0.9;
        this.mesh.add(body);
        // Cabeza
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffdbac }));
        head.position.y = 2.0;
        this.mesh.add(head);

        this.mesh.position.set(this.x, 0, this.z);
        scene.add(this.mesh);
    }

    update(delta) {
        // Los peatones ya no son imprudentes, solo cruzan en rojo para los autos
        if (this.waiting) {
            if (currentLight === LIGHT.RED) {
                this.waiting = false;
            }
        }

        if (!this.waiting) {
            const dir = Math.sign(this.targetX - this.x);
            this.mesh.position.x += dir * this.speed * delta;

            // Animación simple de balanceo
            this.mesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.1;

            if (Math.abs(this.mesh.position.x - this.targetX) < 0.5) {
                this.destroy();
                return false; // Indicar para eliminar
            }
        }
        return true;
    }

    destroy() { scene.remove(this.mesh); }
}

let pedestrians = [];
function spawnPedestrian() {
    if (pedestrians.length < 10) pedestrians.push(new Pedestrian());
    setTimeout(spawnPedestrian, 2000 + Math.random() * 3000);
}

// Vehicle Class
class Vehicle {
    constructor(data, direction) {
        this.baseSpeedKmh = data ? data.speed : (Math.floor(Math.random() * 60) + 30);
        this.isInfractor = this.baseSpeedKmh > SPEED_LIMIT;
        this.yellowThreshold = 0.4 + Math.random() * 0.4;

        this.speedKmh = this.baseSpeedKmh;
        this.speedMs = this.speedKmh / 3.6;
        this.checked = false;
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        if (data && data.city) this.plate.city = data.city;
        this.direction = direction || -1;
        this.lastInfoCardSpeed = -1;
        this.redLightChecked = false;

        // Probabilidad de pasarse el semáforo en rojo (más alta si ya es infractor de velocidad)
        this.willIgnoreRedLight = this.isInfractor ? (Math.random() < 0.3) : (Math.random() < 0.05);

        this.mesh = new THREE.Group();
        const laneX = this.direction === -1 ? 3.5 : -3.5;
        this.mesh.position.set(laneX, 0.8, this.direction === -1 ? 400 : -400);
        if (this.direction === 1) this.mesh.rotation.y = Math.PI;

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
        pLight.target.position.set(this.mesh.position.x, 0.5, -50); // Adjusted target for cross traffic
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
        context.fillText(`${this.speedKmh} km / h`, 256, 100);
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
        // 1. Lógica de Semáforo Mejorada (Aproximación Gradual)
        const myLight = currentLight;
        const stopLineZ = SEMAPHORE_Z + (this.direction === -1 ? 15 : -15);
        const distToStop = (this.mesh.position.z - stopLineZ) * -this.direction;

        let targetSpeed = this.baseSpeedKmh;

        // Influencia del semáforo: 200 metros antes de la línea (Máximo gradualismo)
        if (distToStop > 0 && distToStop < 200) {
            // Punto de no retorno: si está a menos de 15m y va rápido, "se la juega" (buenazo)
            const canPass = (distToStop < 20 && this.speedKmh > 40);

            if (!canPass) {
                if (myLight === LIGHT.RED) {
                    // Curva smoothstep para frenado muy fluido
                    const ratio = THREE.MathUtils.smoothstep(distToStop, 0, 200);
                    targetSpeed = this.baseSpeedKmh * ratio;
                    if (distToStop < 3) targetSpeed = 0; // Detenerse en la línea
                } else if (myLight === LIGHT.YELLOW) {
                    // Si está lejos, baja velocidad. Si está cerca, intenta pasar.
                    if (distToStop > 40) {
                        const ratio = THREE.MathUtils.smoothstep(distToStop, 40, 200);
                        targetSpeed = (this.baseSpeedKmh * 0.4) + (this.baseSpeedKmh * 0.6) * ratio;
                    }
                }
            }
        }

        // Detección de infracción por pasarse el rojo
        if (!this.redLightChecked && distToStop < 0 && distToStop > -15 && myLight === LIGHT.RED) {
            this.redLightChecked = true;
            this.processDetection(true); // Registrar "Semáforo Ignorado"
        }

        // 2. Lógica Anti-Colisión
        let minDist = 1000;
        let vAheadSpeed = 0;

        for (const other of allVehicles) {
            if (other === this || other.direction !== this.direction) continue;
            const diff = (this.mesh.position.z - other.mesh.position.z) * -this.direction;

            if (diff > 0 && diff < minDist) {
                minDist = diff;
                vAheadSpeed = other.speedKmh;
            }
        }

        const safeDist = (this.speedKmh / 10) * 8 + 15;
        if (minDist < safeDist) {
            // Ajuste de velocidad proporcional a la distancia restante
            const collisionTarget = vAheadSpeed * Math.max(0, (minDist - 12) / (safeDist - 12));
            targetSpeed = Math.min(targetSpeed, collisionTarget);
            if (minDist < 12) targetSpeed = 0; // Evitar colisión total
        }


        // 3. Motor de Física: Respuesta rápida para frenado
        const responsiveness = targetSpeed < this.speedKmh ? 5.0 : 1.2;
        const alpha = 1 - Math.exp(-responsiveness * delta);
        this.speedKmh = THREE.MathUtils.lerp(this.speedKmh, targetSpeed, alpha);

        // Debug log opcional para semáforos
        if (distToStop > 0 && distToStop < 30 && Math.random() < 0.05) {
            console.log(`[LIGHT DEBUG] Vehículo ${this.plate.number}: Luz ${myLight}, Vel ${Math.round(this.speedKmh)} km/h, Target ${Math.round(targetSpeed)}`);
        }

        if (this.speedKmh < 0.1) this.speedKmh = 0;
        this.speedMs = this.speedKmh / 3.6;
        this.mesh.position.z += this.direction * this.speedMs * delta;

        // Info Card: Actualización continua durante cambios de velocidad
        this.updateInfoCard();

        // Detección de Radar
        if (!this.checked) {
            const radarPos = this.direction === -1 ? RADAR_SOUTH_Z : RADAR_NORTH_Z;
            const hasCrossed = this.direction === -1 ?
                (this.mesh.position.z <= radarPos) :
                (this.mesh.position.z >= radarPos);

            if (hasCrossed) {
                this.checked = true;
                this.processDetection();
            }
        }
    }

    updateInfoCard() {
        const roundedSpeed = Math.round(this.speedKmh);
        if (roundedSpeed === this.lastInfoCardSpeed) return;
        this.lastInfoCardSpeed = roundedSpeed;

        const canvas = this.infoCard.material.map.image;
        if (!canvas) return;
        const context = canvas.getContext('2d');

        // Limpieza y dibujo del fondo
        context.clearRect(0, 0, 512, 256);
        context.fillStyle = 'rgba(15, 23, 42, 0.95)';
        context.beginPath();
        context.roundRect(0, 0, 512, 256, 40);
        context.fill();

        context.lineWidth = 10;
        context.strokeStyle = roundedSpeed > SPEED_LIMIT ? '#ff3e3e' : '#22d3ee';
        context.stroke();

        context.font = 'Bold 100px Arial';
        context.fillStyle = context.strokeStyle;
        context.textAlign = 'center';
        context.fillText(`${roundedSpeed} km/h`, 256, 100);

        // Redibujar placa y ciudad (estáticos)
        context.fillStyle = '#f1c40f';
        context.fillRect(60, 120, 392, 80);
        context.font = 'Bold 65px Courier New';
        context.fillStyle = 'black';
        context.fillText(this.plate.number, 256, 175);
        context.font = '36px Arial';
        context.fillStyle = 'white';
        context.fillText(this.plate.city.toUpperCase(), 256, 235);

        this.infoCard.material.map.needsUpdate = true;
    }

    processDetection(isRedLightJump = false) {
        stats.total++;
        document.getElementById('total-vehicles').innerText = stats.total;

        if (isRedLightJump) {
            stats.redLights++;
            document.getElementById('red-light-infractions').innerText = stats.redLights;
        }

        if (this.speedKmh > SPEED_LIMIT || isRedLightJump) {
            stats.infractions++;
            document.getElementById('total-infractions').innerText = stats.infractions;

            // Color rojo si es infracción por velocidad o semáforo
            this.bodyMaterial.color.setHex(0xff3e3e);
            this.bodyMaterial.emissive.setHex(isRedLightJump ? 0xff0000 : 0x550000);

            triggerCapture(this);
        } else {
            this.bodyMaterial.color.setHex(0x00e676);
        }
    }

    destroy() { scene.remove(this.mesh); }
}

// Función de Spawning Estadístico
function spawnLoop() {
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;

    // Solo vehículos del dataset (infractores o registros reales)
    let data = null;
    if (csvData.length > 0) {
        data = csvData[dataIndex % csvData.length];
        dataIndex++;
    } else {
        // Fallback si no hay CSV, pero intentamos que sea infractor
        data = {
            speed: Math.floor(Math.random() * 40) + 55, // 55 a 95 km/h
            provinceLetter: null,
            city: null
        };
    }

    const direction = Math.random() > 0.5 ? 1 : -1;
    vehicles.push(new Vehicle(data, direction));
    setTimeout(spawnLoop, delay);
}

// Init
createEnvironment();
loadCSV().finally(() => {
    console.log("Iniciando spawnLoop...");
    spawnLoop();
});

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    // CLAMP DELTA: Evita el pantallazo azul al limitar el salto de tiempo máximo
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    updateTrafficLight(delta);

    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        v.update(delta, vehicles);
        if (v.mesh.position.z > 500 || v.mesh.position.z < -500) {
            scene.remove(v.mesh);
            vehicles.splice(i, 1);
        }
    }

    // Pedestrians removed per user request
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
