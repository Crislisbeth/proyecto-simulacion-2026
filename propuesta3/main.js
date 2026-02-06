import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística
const SPEED_LIMIT = 50;
const RADAR_SOUTH_Z = 150;
const RADAR_NORTH_Z = -30;
const AGENT_SOUTH_Z = 100;
const AGENT_NORTH_Z = -50;
const AGENT_SOUTH_Z2 = 250;
const AGENT_NORTH_Z2 = -200;
const ROAD_WIDTH = 14;
const LAMBDA = 0.6;
const PROB_INFRACTOR = 1.0; // Solo dataset
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';
const TIME_SCALE = 1.6;

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
    const letter2 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const letter3 = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const numbers = Math.floor(1000 + Math.random() * 9000);
    return { number: `${pLetter}${letter2}${letter3}-${numbers}`, city: provinceName };
}

async function loadCSV() {
    try {
        const response = await fetch(CSV_PATH);
        if (!response.ok) throw new Error("No se pudo cargar el CSV");
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

            return {
                provinceLetter: pLetter,
                city: parts[1] || PROVINCES[pLetter],
                speed: speed
            };
        }).filter(d => d !== null);
        console.log(`Dataset CSV cargado: ${csvData.length} registros`);
    } catch (e) {
        console.error("Error cargando el dataset:", e);
    }
}

function triggerCapture(vehicle) {
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

    const alert = document.createElement('div');
    alert.className = 'infraction-alert';
    alert.innerHTML = `
    <div class="alert-title">🚨 FOTOMULTA GENERADA</div>
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
camera.position.set(25, 20, 60);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 50);

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

    // Road (Premium Dark)
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, 1000), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.1;
    road.receiveShadow = true;
    scene.add(road);

    // Lines (Double Yellow)
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
    for (let i = -500; i < 500; i += 50) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        pole.position.set(-ROAD_WIDTH / 2 - 2, 6, i);
        scene.add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        head.position.set(-ROAD_WIDTH / 2 - 1, 12, i);
        scene.add(head);
        const sLight = new THREE.PointLight(0xffcc88, 5, 20);
        sLight.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        scene.add(sLight);
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
    for (let i = -450; i < 450; i += 60) {
        const t1 = new THREE.Mesh(treeGeo, treeMat);
        t1.position.set(-(ROAD_WIDTH / 2 + 5), 3, i);
        scene.add(t1);
        const t2 = t1.clone();
        t2.position.x = (ROAD_WIDTH / 2 + 5);
        scene.add(t2);
    }

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
        const flash = new THREE.PointLight(0xffffff, 0, 30);
        flash.position.set(0, 10.5, 0.8);
        group.add(flash);
        if (!window.radars) window.radars = {};
        window.radars[id] = { flash };
        scene.add(group);
    };
    createRadar("south", ROAD_WIDTH / 2 + 3, RADAR_SOUTH_Z, 0);
    createRadar("north", -ROAD_WIDTH / 2 - 3, RADAR_NORTH_Z, Math.PI);

    // Traffic Agents (4 total)
    agents.push(new TrafficAgent(0, AGENT_SOUTH_Z, 0));
    agents.push(new TrafficAgent(0, AGENT_NORTH_Z, Math.PI));
    agents.push(new TrafficAgent(0, AGENT_SOUTH_Z2, 0));
    agents.push(new TrafficAgent(0, AGENT_NORTH_Z2, Math.PI));

    const agentsCountEl = document.getElementById('agents-count');
    if (agentsCountEl) agentsCountEl.innerText = agents.length;
}

class TrafficAgent {
    constructor(x, z, rotation) {
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);
        this.group.rotation.y = rotation;

        // Pants
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: 0x000033 }));
        legs.position.y = 0.6;
        this.group.add(legs);

        // Shirt (Greenish Reflective)
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.5), new THREE.MeshStandardMaterial({ color: 0xccff00 }));
        torso.position.y = 1.7;
        this.group.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xffdbac }));
        head.position.y = 2.4;
        this.group.add(head);

        // Hat
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2), new THREE.MeshStandardMaterial({ color: 0x000000 }));
        hat.position.y = 2.7;
        this.group.add(hat);

        // Arm (Signaling)
        this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: 0xccff00 }));
        this.arm.position.set(0.4, 2.0, 0);
        this.arm.rotation.z = -Math.PI / 4;
        this.group.add(this.arm);

        scene.add(this.group);
    }

    update() {
        // Simple arm animation
        this.arm.rotation.x = Math.sin(Date.now() * 0.005) * 0.5;
    }
}

class Vehicle {
    constructor(data, direction) {
        this.baseSpeedKmh = data ? data.speed : 60;
        this.speedKmh = this.baseSpeedKmh;
        this.direction = direction;
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        this.checked = false;
        this.lastInfoCardSpeed = -1;

        this.mesh = new THREE.Group();
        const laneX = this.direction === -1 ? 3.5 : -3.5;
        this.mesh.position.set(laneX, 0.8, this.direction === -1 ? 400 : -400);
        if (this.direction === 1) this.mesh.rotation.y = Math.PI;

        const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.7, 0.4) });
        this.bodyMaterial = bodyMat;
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 5), bodyMat);
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
        const agentPositions = this.direction === -1 ? [AGENT_SOUTH_Z, AGENT_SOUTH_Z2] : [AGENT_NORTH_Z, AGENT_NORTH_Z2];

        let targetSpeed = this.baseSpeedKmh;

        // Disuasión por Agente: Revisar influencia de TODOS los agentes
        for (const agentZ of agentPositions) {
            const distToAgent = (this.mesh.position.z - agentZ) * -this.direction;

            // Rango de influencia: 180 metros antes hasta 60 metros después
            if (distToAgent > 0 && distToAgent < 180) {
                const ratio = THREE.MathUtils.smoothstep(distToAgent, 0, 180);
                const agentTarget = 30 + (this.baseSpeedKmh - 30) * ratio;
                if (agentTarget < targetSpeed) targetSpeed = agentTarget;
            } else if (distToAgent <= 0 && distToAgent > -60) {
                const ratio = THREE.MathUtils.smoothstep(Math.abs(distToAgent), 0, 60);
                const agentTarget = 30 + (this.baseSpeedKmh - 30) * ratio;
                if (agentTarget < targetSpeed) targetSpeed = agentTarget;
            }
        }

        // Respuesta física inmediata para frenado suave pero persistente
        const responsiveness = targetSpeed < this.speedKmh ? 3.5 : 1.2;
        const alpha = 1 - Math.exp(-responsiveness * delta);
        this.speedKmh = THREE.MathUtils.lerp(this.speedKmh, targetSpeed, alpha);

        this.speedMs = this.speedKmh / 3.6;
        this.mesh.position.z += this.direction * this.speedMs * delta;

        this.updateInfoCard();

        if (!this.checked) {
            const radarPos = this.direction === -1 ? RADAR_SOUTH_Z : RADAR_NORTH_Z;
            const hasCrossed = this.direction === -1 ? (this.mesh.position.z <= radarPos) : (this.mesh.position.z >= radarPos);
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
        const context = canvas.getContext('2d');
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

    processDetection() {
        stats.total++;
        document.getElementById('total-vehicles').innerText = stats.total;
        if (this.speedKmh > SPEED_LIMIT) {
            stats.infractions++;
            document.getElementById('total-infractions').innerText = stats.infractions;
            this.bodyMaterial.color.setHex(0xff3e3e);
            triggerCapture(this);
        } else {
            this.bodyMaterial.color.setHex(0x00e676);
        }
    }
}

function spawnLoop() {
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;
    let data = null;
    if (csvData.length > 0) {
        data = csvData[dataIndex % csvData.length];
        dataIndex++;
    } else {
        data = { speed: Math.floor(Math.random() * 40) + 55 };
    }
    const direction = Math.random() > 0.5 ? 1 : -1;
    vehicles.push(new Vehicle(data, direction));
    setTimeout(spawnLoop, delay / TIME_SCALE);
}

// Init
createEnvironment();
loadCSV().finally(() => {
    spawnLoop();
    animate();
});

let lastTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    agents.forEach(a => a.update());

    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        v.update(delta * TIME_SCALE, vehicles);
        if (Math.abs(v.mesh.position.z) > 500) {
            scene.remove(v.mesh);
            vehicles.splice(i, 1);
        }
    }
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
