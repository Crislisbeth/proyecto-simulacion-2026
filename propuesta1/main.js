import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Configuración Estadística
const SPEED_LIMIT = 50;
const RADAR_SOUTH_Z = 40;
const RADAR_NORTH_Z = -10;
const SPEED_BUMP_SOUTH_Z = 50;
const SPEED_BUMP_NORTH_Z = -50;
const ROAD_WIDTH = 14;
const LAMBDA = 0.7; // Reducido de 1.2 para mejorar rendimiento
const PROB_INFRACTOR = 0.7; // Mayor probabilidad para ver el dataset (antes 0.3)
const CSV_PATH = 'ant-exceso-velocidad-febrero-2022.csv';
const TIME_SCALE = 1.6;

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
camera.position.set(60, 40, 0); // Vista amplia que ve el resalto y el radar

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
    for (let i = -500; i < 500; i += 80) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        pole.position.set(-ROAD_WIDTH / 2 - 2, 6, i);
        scene.add(pole);

        const lightHead = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        lightHead.position.set(-ROAD_WIDTH / 2 - 1, 12, i);
        scene.add(lightHead);

        const sLight = new THREE.PointLight(0xffcc88, 5, 20); // Alcance reducido para mejor rendimiento
        sLight.position.set(-ROAD_WIDTH / 2 - 1, 11, i);
        // Deshabilitar sombras de luces de calle para ganar FPS
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

    // Rompevelocidades 3D (Baden)
    const createBump = (z) => {
        const bump = new THREE.Mesh(
            new THREE.CylinderGeometry(4, 4, ROAD_WIDTH, 32, 1, false, 0, Math.PI),
            new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 })
        );
        bump.rotation.z = Math.PI / 2;
        bump.position.set(0, -3.7, z);
        scene.add(bump);

        // Líneas amarillas de advertencia en el rompevelocidades
        for (let j = -ROAD_WIDTH / 2; j <= ROAD_WIDTH / 2; j += 2) {
            const line = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.4), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
            line.rotation.x = -Math.PI / 2;
            line.position.set(j, 0.35, z);
            scene.add(line);
        }
    };

    createBump(SPEED_BUMP_SOUTH_Z);
    createBump(SPEED_BUMP_NORTH_Z);

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
        this.speedMs = this.speedKmh / 3.6;
        this.checked = false;
        this.direction = direction || -1;
        this.plate = generateEcuadorianPlate(data ? data.provinceLetter : null);
        if (data && data.city) this.plate.city = data.city;

        // Pre-calcular valores para optimizar update
        this.isInfractor = this.baseSpeedKmh > SPEED_LIMIT;
        this.safeBumpSpeedKmh = 25 + Math.random() * 5; // Todos bajan a ~25-30 km/h
        this.lastInfoCardSpeed = -1;

        // Carriles: Derecha para Sur, Izquierda para Norte
        const laneX = this.direction === -1 ? 3.5 : -3.5;
        this.mesh = new THREE.Group();
        this.mesh.position.set(laneX, 0.8, this.direction === -1 ? 400 : -400);

        // Rotar vehículo si va en dirección opuesta
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
        pLight.target.position.set(laneX, 0.5, -50);
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

    update(delta, allVehicles) {
        // 1. Lógica de frenado por rompevelocidades (Física Matemática Suave)
        const currentBumpZ = this.direction === -1 ? SPEED_BUMP_SOUTH_Z : SPEED_BUMP_NORTH_Z;
        const distToBump = (this.mesh.position.z - currentBumpZ) * -this.direction;
        let targetSpeed = this.baseSpeedKmh;

        // Rango de influencia: 160 metros antes hasta 80 metros después
        if (distToBump > 0 && distToBump < 160) {
            // Curva de frenado suave usando smoothstep (0 a 1)
            const ratio = THREE.MathUtils.smoothstep(distToBump, 0, 160);
            targetSpeed = this.safeBumpSpeedKmh + (this.baseSpeedKmh - this.safeBumpSpeedKmh) * ratio;
        } else if (distToBump <= 0 && distToBump > -80) {
            // Recuperación suave después del resalto
            const ratio = THREE.MathUtils.smoothstep(Math.abs(distToBump), 0, 80);
            targetSpeed = this.safeBumpSpeedKmh + (this.baseSpeedKmh - this.safeBumpSpeedKmh) * ratio;
        }

        // 2. Lógica Anti-Colisión Suave
        const lane = this.mesh.position.x;
        let minDist = 1000;
        let vAheadSpeed = 0;

        for (const other of allVehicles) {
            if (other === this || other.direction !== this.direction) continue;
            if (Math.abs(other.mesh.position.x - lane) < 2) {
                const d = (this.mesh.position.z - other.mesh.position.z) * -this.direction;
                if (d > 0 && d < minDist) {
                    minDist = d;
                    vAheadSpeed = other.speedKmh;
                }
            }
        }

        const safeDist = (this.speedKmh / 10) * 8 + 15;
        if (minDist < safeDist) {
            const collisionTarget = vAheadSpeed * Math.max(0, (minDist - 12) / (safeDist - 12));
            targetSpeed = Math.min(targetSpeed, collisionTarget);
            if (minDist < 12) targetSpeed = 0; // Frenado total si está muy cerca
        }

        // Aplicar cambio de velocidad con respuesta física inmediata para frenado
        const brakeResponsiveness = targetSpeed < this.speedKmh ? 5.0 : 1.5;
        const alpha = 1 - Math.exp(-brakeResponsiveness * delta);
        this.speedKmh = THREE.MathUtils.lerp(this.speedKmh, targetSpeed, alpha);

        // Debug log cada segundo para monitorear (opcional, comentar si molesta)
        if (this.speedKmh < 0.1) this.speedKmh = 0;

        const prevZ = this.mesh.position.z;
        this.speedMs = this.speedKmh / 3.6;
        this.mesh.position.z += this.direction * this.speedMs * delta;

        // Detección cuando cruza su respectivo radar
        if (!this.checked) {
            const radarPos = this.direction === -1 ? RADAR_SOUTH_Z : RADAR_NORTH_Z;
            const hasCrossed = this.direction === -1 ? (this.mesh.position.z <= radarPos) : (this.mesh.position.z >= radarPos);
            if (hasCrossed) {
                this.checked = true;
                this.processDetection();
            }
        }

        // Actualizar tarjeta visual siempre que la velocidad cambie significativamente
        this.updateInfoCard();
    }
    // Optimizar actualización de Info Card (Solo si está cerca y cambió la velocidad)

    updateInfoCard() {
        const roundedSpeed = Math.round(this.speedKmh);
        if (roundedSpeed === this.lastInfoCardSpeed) return;
        this.lastInfoCardSpeed = roundedSpeed;

        const canvas = this.infoCard.material.map.image;
        if (!canvas) return;
        const context = canvas.getContext('2d');

        // Limpieza rápida
        context.clearRect(0, 0, 512, 110);
        context.fillStyle = 'rgba(15, 23, 42, 0.95)';
        context.beginPath();
        context.roundRect(0, 0, 512, 110, { tl: 40, tr: 40, bl: 0, br: 0 });
        context.fill();

        context.lineWidth = 10;
        context.strokeStyle = roundedSpeed > SPEED_LIMIT ? '#ff3e3e' : '#22d3ee';
        context.stroke();

        context.font = 'Bold 100px Arial';
        context.fillStyle = context.strokeStyle;
        context.textAlign = 'center';
        context.fillText(`${roundedSpeed} km/h`, 256, 100);

        this.infoCard.material.map.needsUpdate = true;
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
    const delay = (-Math.log(1 - Math.random()) / LAMBDA) * 1000;

    // Categorización (Infractor o Normal)
    const isInfractor = Math.random() < PROB_INFRACTOR;

    let data = null;
    if (isInfractor && csvData.length > 0) {
        data = csvData[dataIndex % csvData.length];
        dataIndex++;
    } else {
        data = {
            speed: Math.floor(Math.random() * 20) + 35,
            provinceLetter: null,
            city: null
        };
    }

    const direction = Math.random() > 0.5 ? 1 : -1;
    vehicles.push(new Vehicle(data, direction));
    setTimeout(spawnLoop, delay / TIME_SCALE);
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
    // Limitar delta para evitar saltos bruscos y lag extremo
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    for (let i = vehicles.length - 1; i >= 0; i--) {
        const v = vehicles[i];
        v.update(delta * TIME_SCALE, vehicles);
        if (v.mesh.position.z > 500 || v.mesh.position.z < -500) {
            scene.remove(v.mesh);
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
