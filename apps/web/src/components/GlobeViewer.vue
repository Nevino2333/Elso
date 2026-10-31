<template>
  <canvas ref="canvas" class="globe"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface WorldView {
  width: number;
  height: number;
  cells: {
    biome: string;
    elevation: number;
    temperature: number;
    moisture: number;
    resource: number;
    resourceKind: string | null;
    terrain: string;
  }[][];
}

interface AgentView {
  id: string;
  x: number;
  y: number;
  energy: number;
  hunger: number;
  inventory?: { food: number; wood: number; stone: number; ore: number };
}

const props = defineProps<{
  agents: AgentView[];
  world: WorldView | null;
  selected?: string | null;
  day?: number;
}>();

const emit = defineEmits<{
  (e: "select", id: string | null): void;
}>();

const canvas = ref<HTMLCanvasElement | null>(null);
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null = null;
let cloudMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null = null;
let atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
let agentGroup: THREE.Group | null = null;
let terrainTexture: THREE.CanvasTexture | null = null;
let cloudTexture: THREE.CanvasTexture | null = null;
let resizeObserver: ResizeObserver | null = null;
let raf = 0;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
const agentMeshes = new Map<string, THREE.Group>();

const BIOME: Record<string, [number, number, number]> = {
  "deep-water": [10, 38, 64],
  water: [18, 58, 92],
  shallows: [42, 118, 164],
  beach: [212, 196, 138],
  snow: [240, 244, 250],
  tundra: [178, 186, 176],
  taiga: [46, 78, 58],
  grassland: [78, 138, 66],
  savanna: [162, 168, 86],
  desert: [206, 178, 120],
  "temperate-forest": [48, 102, 58],
  rainforest: [26, 78, 54],
  mountain: [158, 154, 150],
  barren: [118, 92, 63],
};

function hash(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function makeTerrainTexture(world: WorldView | null): THREE.CanvasTexture {
  const w = world?.width ?? 20;
  const h = world?.height ?? 20;
  const px = Math.min(2048, w * 8);
  const py = Math.min(1024, h * 8);
  const cv = document.createElement("canvas");
  cv.width = px;
  cv.height = py;
  const ctx = cv.getContext("2d")!;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cell = world?.cells?.[y]?.[x];
      const base = BIOME[cell?.biome ?? "water"] ?? BIOME.water;
      // Elevation shading: high = brighter, low = darker.
      const elev = cell?.elevation ?? 0.5;
      const shade = 0.55 + elev * 0.7;
      const r = Math.round(base[0] * shade);
      const g = Math.round(base[1] * shade);
      const b = Math.round(base[2] * shade);
      const cellW = px / w;
      const cellH = py / h;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));

      // Temperature tint (warmer equator).
      if (cell) {
        const t = cell.temperature ?? 0.5;
        if (t > 0.75) {
          ctx.fillStyle = `rgba(255, 120, 60, ${(t - 0.75) * 0.18})`;
          ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        } else if (t < 0.25) {
          ctx.fillStyle = `rgba(120, 180, 255, ${(0.25 - t) * 0.22})`;
          ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
      }

      // Moisture tint (lush green).
      if (cell) {
        const m = cell.moisture ?? 0.5;
        if (m > 0.6) {
          ctx.fillStyle = `rgba(60, 200, 90, ${(m - 0.6) * 0.18})`;
          ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        }
      }

      // Resource wash + marker.
      if (cell && cell.resource > 0.05) {
        ctx.fillStyle = `rgba(232, 193, 96, ${0.06 + cell.resource * 0.18})`;
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
        if (cell.resource > 0.55) {
          ctx.fillStyle = `rgba(244, 211, 127, ${0.45 + cell.resource * 0.3})`;
          ctx.beginPath();
          ctx.arc(
            (x + 0.5) * cellW,
            (y + 0.5) * cellH,
            Math.max(1, cellW * 0.12),
            0,
            Math.PI * 2
          );
          ctx.fill();
        }
      }

      // Sub-pixel noise grain for organic feel.
      for (let py = 0; py < 2; py++) {
        for (let px = 0; px < 2; px++) {
          const n = hash(x * 4 + px, y * 4 + py);
          if (n > 0.85) {
            ctx.fillStyle = `rgba(255, 255, 255, ${(n - 0.85) * 0.25})`;
            ctx.fillRect(
              x * cellW + (px / 2) * cellW,
              y * cellH + (py / 2) * cellH,
              cellW / 2 + 1,
              cellH / 2 + 1
            );
          } else if (n < 0.12) {
            ctx.fillStyle = `rgba(0, 0, 0, ${(0.12 - n) * 0.35})`;
            ctx.fillRect(
              x * cellW + (px / 2) * cellW,
              y * cellH + (py / 2) * cellH,
              cellW / 2 + 1,
              cellH / 2 + 1
            );
          }
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 4;
  return tex;
}

function makeCloudTexture(): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0)";
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 1400; i++) {
    const x = hash(i, 1) * cv.width;
    const y = hash(i, 2) * cv.height;
    const r = 4 + hash(i, 3) * 14;
    const a = 0.05 + hash(i, 4) * 0.18;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function latLonToVec3(lat: number, lon: number, r: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function cellToLatLon(x: number, y: number, width: number, height: number) {
  const lon = ((x + 0.5) / width) * 360 - 180;
  const lat = 90 - ((y + 0.5) / height) * 180;
  return { lat, lon };
}

function rebuildAgents() {
  if (!agentGroup) return;
  agentGroup.clear();
  agentMeshes.clear();

  const world = props.world;
  const width = world?.width ?? 20;
  const height = world?.height ?? 20;

  for (const a of props.agents) {
    const { lat, lon } = cellToLatLon(a.x, a.y, width, height);
    const pos = latLonToVec3(lat, lon, 1.04);
    const color = a.energy > 60 ? 0x4be3a4 : a.energy > 30 ? 0xf0b44c : 0xff5f6d;

    const group = new THREE.Group();
    group.userData = { agentId: a.id };

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.copy(pos);
    group.add(mesh);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 10, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      })
    );
    halo.position.copy(pos);
    group.add(halo);

    agentGroup.add(group);
    agentMeshes.set(a.id, group);
  }
  applySelection();
}

function applySelection() {
  agentMeshes.forEach((g, id) => {
    const sel = id === props.selected;
    g.scale.setScalar(sel ? 1.6 : 1);
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) {
        o.material.opacity = sel ? 1 : o.geometry instanceof THREE.SphereGeometry && o.geometry.parameters.radius < 0.03 ? 1 : 0.22;
      }
    });
  });
}

function applyTexture() {
  if (!globe) return;
  terrainTexture?.dispose();
  terrainTexture = makeTerrainTexture(props.world);
  globe.material.map = terrainTexture;
  globe.material.color.set(0xffffff);
  globe.material.needsUpdate = true;
}

function applyClouds() {
  if (!cloudMesh) return;
  cloudTexture?.dispose();
  cloudTexture = makeCloudTexture();
  cloudMesh.material.map = cloudTexture;
  cloudMesh.material.needsUpdate = true;
}

function applyDay() {
  if (!scene) return;
  const sun = scene.getObjectByName("sun") as THREE.DirectionalLight | undefined;
  const ambient = scene.getObjectByName("ambient") as THREE.AmbientLight | undefined;
  const day = (props.day ?? 12) / 24; // 0..1
  const angle = day * Math.PI * 2 - Math.PI / 2;
  if (sun) {
    sun.position.set(Math.cos(angle) * 4, 1.2, Math.sin(angle) * 4);
    const intensity = 0.3 + 0.7 * (0.5 + 0.5 * Math.cos(angle));
    sun.intensity = intensity;
    // Warm sunrise/sunset.
    const warm = Math.abs(Math.sin(angle));
    sun.color.setRGB(1, 0.92 + warm * 0.06, 0.82 + (1 - warm) * 0.1);
  }
  if (ambient) {
    ambient.intensity = 0.25 + 0.35 * (0.5 + 0.5 * Math.cos(angle));
  }
}

function resize() {
  const c = canvas.value;
  if (!c || !renderer || !camera) return;
  const w = c.clientWidth || 1;
  const h = c.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function onClick(ev: MouseEvent) {
  if (!canvas.value || !camera || !scene) return;
  const rect = canvas.value.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const targets: THREE.Object3D[] = [];
  agentMeshes.forEach((g) => targets.push(...g.children));
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length) {
    // Find owning group.
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData?.agentId) obj = obj.parent;
    if (obj?.userData?.agentId) {
      emit("select", obj.userData.agentId);
      return;
    }
  }
  emit("select", null);
}

onMounted(() => {
  const c = canvas.value!;
  renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05080d, 0.025);

  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0.6, 0.4, 3.0);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.6;
  controls.maxDistance = 6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;

  globe = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 64),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 })
  );
  scene.add(globe);

  cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 64, 48),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      roughness: 1,
    })
  );
  scene.add(cloudMesh);

  // Fresnel atmosphere (back-side glow).
  atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.12, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x5aa8ff) },
        c: { value: 0.35 },
        p: { value: 4.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float c;
        uniform float p;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(c - dot(vNormal, vec3(0.0, 0.0, 1.0)), p);
          gl_FragColor = vec4(color, intensity * 0.75);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(atmosphere);

  // Stars.
  const starCount = 1200;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const u = hash(i, 1) * 2 - 1;
    const theta = hash(i, 2) * Math.PI * 2;
    const r = 22 + hash(i, 3) * 28;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = r * s * Math.cos(theta);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * s * Math.sin(theta);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({
      color: 0xc6d9ea,
      size: 0.08,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
  );
  scene.add(stars);

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  ambient.name = "ambient";
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff3dd, 1.2);
  sun.name = "sun";
  sun.position.set(4, 1.2, 3);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x5aa8ff, 0x0a1420, 0.35);
  scene.add(hemi);

  agentGroup = new THREE.Group();
  globe.add(agentGroup);

  applyTexture();
  applyClouds();
  rebuildAgents();
  applyDay();
  resize();

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(c);

  canvas.value?.addEventListener("click", onClick);

  const animate = () => {
    raf = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (cloudMesh) cloudMesh.rotation.y += 0.0006;
    if (globe) globe.rotation.y += 0; // controlled by user drag
    if (renderer && scene && camera) renderer.render(scene, camera);
  };
  animate();
});

watch(() => props.agents, rebuildAgents, { deep: true });
watch(() => props.world, () => {
  applyTexture();
  applyClouds();
  rebuildAgents();
});
watch(() => props.selected, applySelection);
watch(() => props.day, applyDay);

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  resizeObserver?.disconnect();
  canvas.value?.removeEventListener("click", onClick);
  controls?.dispose();

  scene?.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
  terrainTexture?.dispose();
  cloudTexture?.dispose();
  renderer?.dispose();
});
</script>

<style scoped>
.globe {
  width: 100%;
  height: 100%;
  display: block;
  cursor: grab;
}
.globe:active {
  cursor: grabbing;
}
</style>