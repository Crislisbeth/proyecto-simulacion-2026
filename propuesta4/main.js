import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística (Híbrido Maestro)
const SPEED_LIMIT = 50;
const RADAR_SOUTH_Z = 50;
const RADAR_NORTH_Z = -50;
const SPEED_BUMP_SOUTH_Z = 65; // Justo antes del radar
const SPEED_BUMP_NORTH_Z = -65;
const AGENT_SOUTH_Z = 80; // Custodiando el resalto
const AGENT_NORTH_Z = -80;

const ROAD_WIDTH = 14;
const LAMBDA = 0.6; // Intensidad del Proceso de Poisson (vehículos por segundo)
const PROB_INFRACTOR = 1.0; // Ensayo de Bernoulli: 100% probabilidad para pruebas de estrés
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';

// State
let vehicles = [];
let agents = [];
let stats = { total: 0, infractions: 0 };
let csvData = [];
let dataIndex = 0;

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
    const l2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const l3 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const nums = Math.floor(1000 + Math.random() * 9000);
    return { number: `${pLetter}${l2}${l3}-${nums}`, city: provinceName };
}

async function loadCSV() {
    try {
        const response = await fetch(CSV_PATH);
        if (!response.ok) throw new Error("CSV not found");
        const text = await response.text();
        const lines = text.split(/\r?\n/).slice(1);
        csvData = lines.map(line => {
            const parts = line.split(';').map(p => p.trim());
            if (parts.length < 5) return null;
            const provName = parts[0].toUpperCase();
            let pLetter = 'P';
            for (const [letter, name] of Object.entries(PROVINCES)) {
                if (provName.includes(name.toUpperCase())) { pLetter = letter; break; }
            }
            const speed = parseInt(parts[parts.length - 2]);
            if (isNaN(speed)) return null;
            return { provinceLetter: pLetter, city: parts[1] || PROVINCES[pLetter], speed: speed };
        }).filter(d => d !== null);
    } catch (e) {
        console.error("Error loading CSV:", e);
    }
}

function triggerCapture(vehicle) {
    const queue = document.getElementById('alert-queue');
    if (!queue) return;

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

    const alert = document.createElement('div');
    alert.className = 'infraction-alert';
    alert.innerHTML = `
    <div class="alert-title">🚨 CAPTURA MAESTRA</div>
    <div class="alert-details">
        <div class="alert-plate">${vehicle.plate.number}</div>
        <div class="alert-speed">${Math.round(vehicle.speedKmh)} km/h</div>
    </div>
    `;
    queue.prepend(alert);
    setTimeout(() => {
        alert.classList.add('alert-exit');
        setTimeout(() => alert.remove(), 500);
    }, 4500);
}

// Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa5d6f7);
scene.fog = new THREE.Fog(0xa5d6f7, 50, 400);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(30, 25, 100);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 40);

const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
sunLight.position.set(50, 80, 50);
sunLight.castShadow = true;
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

    // Lines
    const lineGeo = new THREE.PlaneGeometry(0.3, 1000);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    const mLine1 = new THREE.Mesh(lineGeo, lineMat);
    mLine1.rotation.x = -Math.PI / 2;
    mLine1.position.set(0.2, 0.13, 0);
    scene.add(mLine1);
    const mLine2 = mLine1.clone();
    mLine2.position.x = -0.2;
    scene.add(mLine2);

    // Barriers & Streetlights
    for (let i = -500; i < 500; i += 50) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        pole.position.set(-ROAD_WIDTH / 2 - 2, 6, i);
        scene.add(pole);
        const sl = new THREE.PointLight(0xffcc88, 5, 20);
        sl.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        scene.add(sl);
    }

    // Sidewalks
    const swMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1 });
    const swLeft = new THREE.Mesh(new THREE.PlaneGeometry(10, 1000), swMat);
    swLeft.rotation.x = -Math.PI / 2;
    swLeft.position.set(-(ROAD_WIDTH / 2 + 5), 0.15, 0);
    scene.add(swLeft);
    const swRight = swLeft.clone();
    swRight.position.x = (ROAD_WIDTH / 2 + 5);
    scene.add(swRight);

    // Trees
    const treeGeo = new THREE.ConeGeometry(2, 6, 8);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d4c1e });
    for (let i = -450; i < 450; i += 70) {
        const t1 = new THREE.Mesh(treeGeo, treeMat);
        t1.position.set(-(ROAD_WIDTH / 2 + 5), 3, i);
        scene.add(t1);
        const t2 = t1.clone();
        t2.position.x = (ROAD_WIDTH / 2 + 5);
        scene.add(t2);
    }

    // 3D Speed Bumps (Resaltos)
    const createBump = (z) => {
        const bumpGroup = new THREE.Group();
        bumpGroup.position.set(0, 0.16, z);
        const texture = new THREE.CanvasTexture(createBumpTexture());
        texture.wrapS = THREE.RepeatWrapping;
        texture.repeat.set(ROAD_WIDTH / 2, 1);
        const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 });
        const geom = new THREE.CylinderGeometry(1.5, 1.5, ROAD_WIDTH, 32, 1, false, 0, Math.PI);
        const mesh = new THREE.Mesh(geom, mat);
        mesh.rotation.z = Math.PI / 2;
        mesh.scale.set(0.15, 1, 1);
        bumpGroup.add(mesh);
        scene.add(bumpGroup);
    };
    createBump(SPEED_BUMP_SOUTH_Z);
    createBump(SPEED_BUMP_NORTH_Z);

    // Radar Models
    const createRadar = (id, x, z, rotation) => {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        if (rotation) group.rotation.y = rotation;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 10), new THREE.MeshStandardMaterial({ color: 0x334155 }));
        post.position.y = 5;
        group.add(post);
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
        body.position.y = 10;
        group.add(body);
        const flash = mclarkeFlash();
        group.add(flash);
        if (!window.radars) window.radars = {};
        window.radars[id] = { flash };
        scene.add(group);
    };
    function mclarkeFlash() {
        const f = new THREE.PointLight(0xffffff, 0, 30);
        f.position.set(0, 10.5, 0.8);
        return f;
    }
    createRadar("south", ROAD_WIDTH / 2 + 3, RADAR_SOUTH_Z, 0);
    createRadar("north", -ROAD_WIDTH / 2 - 3, RADAR_NORTH_Z, Math.PI);

    // Traffic Agents (Hybrid Guardians)
    agents.push(new TrafficAgent(0, AGENT_SOUTH_Z, 0));
    agents.push(new TrafficAgent(0, AGENT_NORTH_Z, Math.PI));
}

function createBumpTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 64, 128);
    return canvas;
}

class TrafficAgent {
    constructor(x, z, rotation) {
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);
        this.group.rotation.y = rotation;
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), new THREE.MeshStandardMaterial({ color: 0xccff00 }));
        body.position.y = 1.7;
        this.group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xffdbac }));
        head.position.y = 2.4;
        this.group.add(head);
        this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: 0xccff00 }));
        this.arm.position.set(0.4, 2.0, 0);
        this.arm.rotation.z = -Math.PI / 4;
        this.group.add(this.arm);
        scene.add(this.group);
    }
    update() { this.arm.rotation.x = Math.sin(Date.now() * 0.005) * 0.5; }
}

class Vehicle {
    constructor(data, direction) {
        this.baseSpeedKmh = data ? data.speed : 60;
        this.speedKmh = this.baseSpeedKmh;
        this.direction = direction;
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        this.checked = false;
        this.lastInfoCardSpeed = -1;
        this.safeBumpSpeedKmh = 25 + Math.random() * 5;

        this.mesh = new THREE.Group();
        const laneX = this.direction === -1 ? 3.5 : -3.5;
        this.mesh.position.set(laneX, 0.8, this.direction === -1 ? 400 : -400);
        if (this.direction === 1) this.mesh.rotation.y = Math.PI;

        const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.4) });
        this.bodyMaterial = bodyMat;
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 5), bodyMat);
        this.mesh.add(body);

        this.infoCard = this.createInfoCard();
        this.infoCard.position.y = 4;
        this.mesh.add(this.infoCard);
        scene.add(this.mesh);
    }

    createInfoCard() {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 256;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
        sprite.scale.set(10, 5, 1);
        return sprite;
    }

    update(delta, allVehicles) {
        // LÓGICA HÍBRIDA MAESTRA - INFLUENCIA GLOBAL (Ambos sentidos)
        const allAgents = [AGENT_SOUTH_Z, AGENT_NORTH_Z];
        const allBumps = [SPEED_BUMP_SOUTH_Z, SPEED_BUMP_NORTH_Z];

        let targetSpeed = this.baseSpeedKmh;

        // 1. Efecto Disuasorio de TODOS los Agentes
        for (const aZ of allAgents) {
            const dist = (this.mesh.position.z - aZ) * -this.direction;
            if (dist > 100 && dist < 250) {
                const ratio = THREE.MathUtils.smoothstep(dist, 100, 250);
                const agentTarget = 45 + (this.baseSpeedKmh - 45) * ratio;
                if (agentTarget < targetSpeed) targetSpeed = agentTarget;
            }
        }

        // 2. Efecto Físico de TODOS los Rompevelocidades
        for (const bZ of allBumps) {
            const dist = (this.mesh.position.z - bZ) * -this.direction;
            if (dist > 0 && dist < 100) {
                const ratio = THREE.MathUtils.smoothstep(dist, 0, 100);
                const bumpTarget = this.safeBumpSpeedKmh + (Math.min(targetSpeed, 45) - this.safeBumpSpeedKmh) * ratio;
                if (bumpTarget < targetSpeed) targetSpeed = bumpTarget;
            } else if (dist <= 0 && dist > -180) {
                const ratio = THREE.MathUtils.smoothstep(Math.abs(dist), 0, 180);
                const recoveryTarget = this.safeBumpSpeedKmh + (this.baseSpeedKmh - this.safeBumpSpeedKmh) * ratio;
                if (recoveryTarget < targetSpeed) targetSpeed = recoveryTarget;
            }
        }

        // 3. Lógica Anti-Colisión (Evitar choques por alcance)
        const safetyDistance = 15;
        for (const other of allVehicles) {
            if (other === this) continue;
            // Misma dirección y carril similar
            if (other.direction === this.direction && Math.abs(other.mesh.position.x - this.mesh.position.x) < 1.5) {
                const distZ = (other.mesh.position.z - this.mesh.position.z) * this.direction;
                if (distZ > 0 && distZ < safetyDistance) {
                    // Frenado reactivo para no chocar
                    const collisionRatio = THREE.MathUtils.smoothstep(distZ, 5, safetyDistance);
                    targetSpeed = Math.min(targetSpeed, other.speedKmh * collisionRatio);
                    if (distZ < 7) targetSpeed = 0; // Frenazo preventivo
                }
            }
        }

        // Respuesta física: frenado rápido, pero aceleración muy pesada y lenta
        const isBraking = targetSpeed < this.speedKmh;
        const responsiveness = isBraking ? 4.5 : 0.4;
        const alpha = 1 - Math.exp(-responsiveness * delta);
        this.speedKmh = THREE.MathUtils.lerp(this.speedKmh, targetSpeed, alpha);

        this.speedMs = this.speedKmh / 3.6;
        this.mesh.position.z += this.direction * this.speedMs * delta;

        this.updateInfoCard();

        if (!this.checked) {
            const rPos = this.direction === -1 ? RADAR_SOUTH_Z : RADAR_NORTH_Z;
            const crossed = this.direction === -1 ? (this.mesh.position.z <= rPos) : (this.mesh.position.z >= rPos);
            if (crossed) { this.checked = true; this.processDetection(); }
        }
    }

    updateInfoCard() {
        const rounded = Math.round(this.speedKmh);
        if (rounded === this.lastInfoCardSpeed) return;
        this.lastInfoCardSpeed = rounded;
        const canvas = this.infoCard.material.map.image;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 512, 256);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.beginPath(); ctx.roundRect(0, 0, 512, 256, 40); ctx.fill();
        ctx.lineWidth = 10; ctx.strokeStyle = rounded > SPEED_LIMIT ? '#ff3e3e' : '#22d3ee'; ctx.stroke();
        ctx.font = 'Bold 100px Arial'; ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'center';
        ctx.fillText(`${rounded} km/h`, 256, 100);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(60, 120, 392, 80);
        ctx.font = 'Bold 65px Courier New'; ctx.fillStyle = 'black'; ctx.fillText(this.plate.number, 256, 175);
        this.infoCard.material.map.needsUpdate = true;
    }

    processDetection() {
        stats.total++;
        document.getElementById('total-vehicles').innerText = stats.total;
        if (this.speedKmh > SPEED_LIMIT) {
            stats.infractions++;
            document.getElementById('total-infractions').innerText = stats.infractions;
            this.bodyMaterial.color.setHex(0xff3e3e);
            triggerCapture(this);
        } else { this.bodyMaterial.color.setHex(0x2ecc71); }
    }
}

function spawnLoop() {
    /**
     * DISTRIBUCIÓN EXPONENCIAL (Monte Carlo)
     * Generación de tiempos de espera aleatorios siguiendo una curva de probabilidad decreciente.
     */
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;
    let data = csvData.length > 0 ? csvData[dataIndex++ % csvData.length] : { speed: 80 };
    vehicles.push(new Vehicle(data, Math.random() > 0.5 ? 1 : -1));
    setTimeout(spawnLoop, delay);
}

createEnvironment();
loadCSV().finally(() => { spawnLoop(); animate(); });

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min((performance.now() - lastTime) / 1000, 0.1);
    lastTime = performance.now();
    agents.forEach(a => a.update());
    for (let i = vehicles.length - 1; i >= 0; i--) {
        vehicles[i].update(delta, vehicles);
        if (Math.abs(vehicles[i].mesh.position.z) > 500) {
            scene.remove(vehicles[i].mesh); vehicles.splice(i, 1);
        }
    }
    controls.update();
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
