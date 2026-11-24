import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { NativeiOSBridge } from '../engine/iosBridge';
import { subscribeAppLifecycle } from '../utils/ios-lifecycle';
import { calculatePlatesPerSide } from '../engine/math';
import { ExerciseId, PlateSpec } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

interface BarbellWebGL3DProps {
  targetWeight: number;
  barbellWeight?: number;
  title: string;
  exerciseType?: ExerciseId;
  hapticsEnabled: boolean;
  soundEnabled?: boolean;
  compact?: boolean;
}

type LiftPhaseLabel = 'Опускание' | 'Пауза' | 'Взрыв' | 'Локаут';

const PLATE_RADIUS_MAP: Record<number, number> = {
  25: 0.45,
  20: 0.44,
  15: 0.38,
  10: 0.33,
  5: 0.27,
  2.5: 0.21,
  1.25: 0.17,
};

const PLATE_THICKNESS_MAP: Record<number, number> = {
  25: 0.068,
  20: 0.06,
  15: 0.052,
  10: 0.045,
  5: 0.036,
  2.5: 0.03,
  1.25: 0.025,
};

function detectExerciseFromTitle(title: string): ExerciseId {
  const lower = title.toLowerCase();
  if (lower.includes('присед') || lower.includes('squat')) return 'squat';
  if (lower.includes('станов') || lower.includes('тяга') || lower.includes('deadlift')) return 'deadlift';
  return 'bench';
}

// 4-phase realistic lifting biomechanics cycle (Total 3.7s):
// 0.0 -> 1.8s: Controlled Eccentric (0 -> 1)
// 1.8 -> 2.2s: Bottom Pause (1)
// 2.2 -> 3.0s: Explosive Concentric (1 -> 0)
// 3.0 -> 3.7s: Lockout Hold (0)
function evaluateFourPhaseRep(cycleTimeSec: number): {
  rep: number;
  effort: number;
  stickingPoint: number;
  phaseLabel: LiftPhaseLabel;
} {
  const total = 3.7;
  const t = ((cycleTimeSec % total) + total) % total;

  if (t < 1.8) {
    // Controlled lowering (ease-in-out)
    const u = t / 1.8;
    const rep = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    return { rep, effort: 0.25 + rep * 0.45, stickingPoint: 0, phaseLabel: 'Опускание' };
  }
  if (t < 2.2) {
    // Brief pause at peak stretch/bottom
    return { rep: 1, effort: 0.85, stickingPoint: 0.2, phaseLabel: 'Пауза' };
  }
  if (t < 3.0) {
    // Explosive concentric push/pull (fast out of the hole, slight sticking point mid-way)
    const u = (t - 2.2) / 0.8;
    const easeOut = 1 - Math.pow(1 - u, 2.6);
    const rep = 1 - easeOut;
    const sticking = Math.exp(-Math.pow((u - 0.42) / 0.18, 2));
    return { rep, effort: 0.75 + sticking * 0.25, stickingPoint: sticking, phaseLabel: 'Взрыв' };
  }
  // Lockout hold
  return { rep: 0, effort: 0.15, stickingPoint: 0, phaseLabel: 'Локаут' };
}

function createPlateLabelTexture(label: string, bgColor: string, lightText: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(128, 128, 115, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.24)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = lightText ? '#F8FAFC' : '#090D16';
  ctx.font = '800 36px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 44);
  ctx.fillText('KG', 128, 212);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createKnurlingBumpTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#d0d0d0';
  ctx.lineWidth = 2;
  for (let i = -128; i < 256; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 128, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + 128, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 2);
  return tex;
}

function createOakWoodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#7c5634';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 64; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(42, 24, 10, 0.16)' : 'rgba(210, 165, 115, 0.1)';
    ctx.fillRect(i * 4, 0, 2, 256);
  }
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(20, 12, 5, 0.12)';
    ctx.fillRect(0, y, 256, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  return tex;
}

function createRubberSpeckleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0e17';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 240; i++) {
    const x = (i * 53) % 128;
    const y = (i * 97) % 128;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(56, 189, 248, 0.14)' : 'rgba(148, 163, 184, 0.08)';
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function createStudioFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#090a0c';
  ctx.fillRect(0, 0, 512, 512);

  // Soft overhead studio spotlight pool
  const grad = ctx.createRadialGradient(256, 256, 12, 256, 256, 240);
  grad.addColorStop(0, '#1e2128');
  grad.addColorStop(0.35, '#13151a');
  grad.addColorStop(0.7, '#0c0d10');
  grad.addColorStop(1, '#090a0c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle architectural studio micro-grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.028)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createLimbSegment(
  length: number,
  topR: number,
  botR: number,
  mat: THREE.Material,
  jointMat: THREE.Material,
  geos: THREE.BufferGeometry[]
): THREE.Group {
  const g = new THREE.Group();
  const jointGeo = new THREE.SphereGeometry(topR * 1.08, 18, 18);
  const segGeo = new THREE.CylinderGeometry(topR, botR, length, 18);
  geos.push(jointGeo, segGeo);

  const joint = new THREE.Mesh(jointGeo, jointMat);
  joint.castShadow = true;
  const seg = new THREE.Mesh(segGeo, mat);
  seg.position.y = -length / 2;
  seg.castShadow = true;
  g.add(joint, seg);
  return g;
}

export const BarbellWebGL3D: React.FC<BarbellWebGL3DProps> = ({
  targetWeight,
  barbellWeight = 20,
  title,
  exerciseType,
  hapticsEnabled,
  soundEnabled = true,
  compact = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglReady, setWebglReady] = useState<boolean>(true);
  const [activeStation, setActiveStation] = useState<ExerciseId>(() => exerciseType || detectExerciseFromTitle(title));
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showBarPath, setShowBarPath] = useState<boolean>(true);
  const [cameraPreset, setCameraPreset] = useState<'quarter' | 'side' | 'front'>('quarter');
  const [phaseLabel, setPhaseLabel] = useState<LiftPhaseLabel>('Опускание');
  const [customGlbLoaded, setCustomGlbLoaded] = useState<boolean>(false);

  useEffect(() => {
    setActiveStation(exerciseType || detectExerciseFromTitle(title));
  }, [exerciseType, title]);

  const { plates, perSideKg } = useMemo(
    () => calculatePlatesPerSide(targetWeight, barbellWeight),
    [targetWeight, barbellWeight]
  );

  const orbitRef = useRef({
    rotY: 0.62,
    rotX: 0.24,
    targetRotY: 0.62,
    targetRotX: 0.24,
    isDragging: false,
    lastX: 0,
    lastY: 0,
  });

  const isPlayingRef = useRef(isPlaying);
  const showHeatmapRef = useRef(showHeatmap);
  const showBarPathRef = useRef(showBarPath);
  const lastPhaseRef = useRef<LiftPhaseLabel>('Опускание');

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
  }, [showHeatmap]);

  useEffect(() => {
    showBarPathRef.current = showBarPath;
  }, [showBarPath]);

  useEffect(() => {
    if (cameraPreset === 'quarter') {
      orbitRef.current.targetRotY = activeStation === 'bench' ? 0.68 : 0.56;
      orbitRef.current.targetRotX = 0.24;
    } else if (cameraPreset === 'side') {
      orbitRef.current.targetRotY = Math.PI / 2 - 0.04;
      orbitRef.current.targetRotX = 0.1;
    } else {
      orbitRef.current.targetRotY = 0.0;
      orbitRef.current.targetRotX = 0.14;
    }
  }, [cameraPreset, activeStation]);

  // Main Three.js 3D Pro Studio Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglReady(false);
      return;
    }

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 256;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090a0c);
    scene.fog = new THREE.FogExp2(0x090a0c, 0.115);

    // Realistic IBL metallic reflections via RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 1.48, 4.85);
    camera.lookAt(0, 0.86, 0);

    // Optional Post-Processing Subtle Studio Bloom
    let composer: EffectComposer | null = null;
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.16, 0.35, 0.9);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
    }

    // Nike / Apple Studio Three-Point + Overhead Pool Lighting
    scene.add(new THREE.AmbientLight(0xe2e8f0, 0.35));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3.6, 6.8, 4.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -2.8;
    keyLight.shadow.camera.right = 2.8;
    keyLight.shadow.camera.top = 2.8;
    keyLight.shadow.camera.bottom = -2.8;
    keyLight.shadow.bias = -0.0006;
    scene.add(keyLight);

    const topSpot = new THREE.SpotLight(0xf8fafc, 18, 12, Math.PI / 4.2, 0.72, 1.4);
    topSpot.position.set(0, 5.2, 0.4);
    topSpot.target.position.set(0, 0.3, 0);
    scene.add(topSpot, topSpot.target);

    const rimLight = new THREE.DirectionalLight(0xc8f550, 1.25);
    rimLight.position.set(-4.8, 3.8, -4.2);
    scene.add(rimLight);

    const coolFill = new THREE.DirectionalLight(0x94a3b8, 0.55);
    coolFill.position.set(3.2, 1.6, -3.2);
    scene.add(coolFill);

    const createdGeos: THREE.BufferGeometry[] = [];
    const createdMats: THREE.Material[] = [];
    const createdTextures: THREE.Texture[] = [];

    const addGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      createdGeos.push(g);
      return g;
    };
    const addMat = <T extends THREE.Material>(m: T): T => {
      createdMats.push(m);
      return m;
    };

    const knurlTex = createKnurlingBumpTexture();
    const oakTex = createOakWoodTexture();
    const rubberTex = createRubberSpeckleTexture();
    const studioFloorTex = createStudioFloorTexture();
    createdTextures.push(knurlTex, oakTex, rubberTex, studioFloorTex);

    // PBR Materials
    const chromeMat = addMat(new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 0.96, roughness: 0.12 }));
    const brushedSteelMat = addMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.26 }));
    const knurledSteelMat = addMat(
      new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        metalness: 0.9,
        roughness: 0.3,
        bumpMap: knurlTex,
        bumpScale: 0.014,
      })
    );
    const darkSteelMat = addMat(new THREE.MeshStandardMaterial({ color: 0x1b1e26, metalness: 0.82, roughness: 0.28 }));
    const frameAccentMat = addMat(new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.72, roughness: 0.38 }));
    const leatherMat = addMat(new THREE.MeshStandardMaterial({ color: 0x12141a, metalness: 0.06, roughness: 0.74 }));
    const rubberMat = addMat(new THREE.MeshStandardMaterial({ map: rubberTex, metalness: 0.05, roughness: 0.9 }));
    const oakMat = addMat(new THREE.MeshStandardMaterial({ map: oakTex, metalness: 0.04, roughness: 0.58 }));
    const neonTrimMat = addMat(
      new THREE.MeshStandardMaterial({ color: 0xc8f550, emissive: 0x65a30d, emissiveIntensity: 0.32, roughness: 0.28, metalness: 0.2 })
    );

    // Premium Satin Dark Titanium Mannequin Materials (MeshPhysicalMaterial + Clearcoat)
    const suitMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x252830,
        metalness: 0.52,
        roughness: 0.36,
        clearcoat: 0.45,
        clearcoatRoughness: 0.28,
      })
    );
    const shortsMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x14161c,
        metalness: 0.25,
        roughness: 0.52,
        clearcoat: 0.18,
        clearcoatRoughness: 0.45,
      })
    );
    const skinMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x3b3f4c,
        metalness: 0.58,
        roughness: 0.3,
        clearcoat: 0.5,
        clearcoatRoughness: 0.24,
      })
    );
    const shoeMat = addMat(new THREE.MeshStandardMaterial({ color: 0x111216, metalness: 0.22, roughness: 0.62 }));
    const visorMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x050608,
        metalness: 0.92,
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
      })
    );
    const jointAccentMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x5c6070,
        metalness: 0.72,
        roughness: 0.24,
        clearcoat: 0.4,
      })
    );

    // Muscle Heatmap Materials (dynamically driven each frame)
    const makeHeatMat = () =>
      addMat(
        new THREE.MeshStandardMaterial({
          color: 0xc8f550,
          emissive: 0x84cc16,
          emissiveIntensity: 0.0,
          transparent: true,
          opacity: 0.0,
          roughness: 0.35,
        })
      );
    const pecsHeatMat = makeHeatMat();
    const tricepsHeatMat = makeHeatMat();
    const quadsHeatMat = makeHeatMat();
    const glutesHeatMat = makeHeatMat();
    const backHeatMat = makeHeatMat();

    // Root World Pivot
    const world = new THREE.Group();
    world.position.y = -0.15;
    scene.add(world);

    // Seamless Infinite Studio Floor (fades smoothly into #090a0c fog, no cut-out disc)
    const studioFloorMat = addMat(
      new THREE.MeshStandardMaterial({
        map: studioFloorTex,
        roughness: 0.82,
        metalness: 0.08,
      })
    );
    const studioFloor = new THREE.Mesh(addGeo(new THREE.PlaneGeometry(18, 18)), studioFloorMat);
    studioFloor.rotation.x = -Math.PI / 2;
    studioFloor.position.y = 0;
    studioFloor.receiveShadow = true;
    world.add(studioFloor);

    // Subtle hairline calibration ring on studio floor
    const floorRing = new THREE.Mesh(
      addGeo(new THREE.RingGeometry(1.78, 1.805, 72)),
      addMat(new THREE.MeshBasicMaterial({ color: 0xc8f550, transparent: true, opacity: 0.16, side: THREE.DoubleSide }))
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.003;
    world.add(floorRing);

    // ================= BUILD LOADED IPF BARBELL WITH SCULPTED COMPETITION PLATES =================
    const barbellGroup = new THREE.Group();
    world.add(barbellGroup);

    const shaft = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.022, 0.022, 1.38, 20)), knurledSteelMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.castShadow = true;
    barbellGroup.add(shaft);

    // Machined IPF 81cm Grip Rings + Center Marker
    const gripRingGeo = addGeo(new THREE.CylinderGeometry(0.0235, 0.0235, 0.012, 18));
    gripRingGeo.rotateZ(Math.PI / 2);
    [-0.405, 0.405].forEach((gx) => {
      const gr = new THREE.Mesh(gripRingGeo, chromeMat);
      gr.position.x = gx;
      barbellGroup.add(gr);
    });
    const centerMark = new THREE.Mesh(gripRingGeo, neonTrimMat);
    centerMark.scale.set(0.6, 1.02, 1.02);
    barbellGroup.add(centerMark);

    // Left & Right Sleeve Pivots (for realistic heavy-weight barbell whip/bend)
    const leftEndPivot = new THREE.Group();
    leftEndPivot.position.x = -0.68;
    const rightEndPivot = new THREE.Group();
    rightEndPivot.position.x = 0.68;
    barbellGroup.add(leftEndPivot, rightEndPivot);

    const shoulderGeo = addGeo(new THREE.CylinderGeometry(0.052, 0.052, 0.042, 22));
    shoulderGeo.rotateZ(Math.PI / 2);
    const lSh = new THREE.Mesh(shoulderGeo, chromeMat);
    lSh.position.x = -0.021;
    lSh.castShadow = true;
    const rSh = new THREE.Mesh(shoulderGeo, chromeMat);
    rSh.position.x = 0.021;
    rSh.castShadow = true;
    leftEndPivot.add(lSh);
    rightEndPivot.add(rSh);

    const sleeveGeo = addGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.48, 22));
    sleeveGeo.rotateZ(Math.PI / 2);
    const lSl = new THREE.Mesh(sleeveGeo, chromeMat);
    lSl.position.x = -0.26;
    lSl.castShadow = true;
    const rSl = new THREE.Mesh(sleeveGeo, chromeMat);
    rSl.position.x = 0.26;
    rSl.castShadow = true;
    leftEndPivot.add(lSl);
    rightEndPivot.add(rSl);

    // Competition Sculpted Bumper Plates (Beveled outer lip + Recessed face + Brushed steel hub)
    let plateOffset = 0.05;
    plates.forEach((plate: PlateSpec) => {
      const r = PLATE_RADIUS_MAP[plate.weight] || 0.3;
      const th = PLATE_THICKNESS_MAP[plate.weight] || 0.045;
      const lightText = plate.weight !== 5 && plate.weight !== 1.25;
      const tex = createPlateLabelTexture(plate.label, plate.color, lightText);
      createdTextures.push(tex);

      const rimMat = addMat(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(plate.edge),
          roughness: 0.48,
          metalness: 0.14,
        })
      );
      const faceMat = addMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.36,
          metalness: 0.12,
        })
      );

      // Slightly recessed core disc so outer lip stands proud like a real Eleiko/IPF plate
      const innerDiscGeo = addGeo(new THREE.CylinderGeometry(r * 0.94, r * 0.94, th * 0.78, 36));
      innerDiscGeo.rotateZ(Math.PI / 2);

      // Rounded outer rubber bumper tire
      const outerLipGeo = addGeo(new THREE.TorusGeometry(r - th * 0.34, th * 0.48, 12, 36));
      outerLipGeo.rotateY(Math.PI / 2);

      // Brushed steel center hub insert
      const hubGeo = addGeo(new THREE.CylinderGeometry(0.068, 0.068, th * 0.92, 22));
      hubGeo.rotateZ(Math.PI / 2);

      const buildPlateMesh = () => {
        const pg = new THREE.Group();
        const core = new THREE.Mesh(innerDiscGeo, [rimMat, faceMat, faceMat]);
        core.castShadow = true;
        const lip = new THREE.Mesh(outerLipGeo, rimMat);
        lip.castShadow = true;
        const hub = new THREE.Mesh(hubGeo, brushedSteelMat);
        pg.add(core, lip, hub);
        return pg;
      };

      const rightP = buildPlateMesh();
      rightP.position.x = plateOffset + th / 2;
      const leftP = buildPlateMesh();
      leftP.position.x = -(plateOffset + th / 2);

      rightEndPivot.add(rightP);
      leftEndPivot.add(leftP);
      plateOffset += th + 0.008;
    });

    // Competition Lever-Lock Collars
    if (plates.length > 0) {
      const colBodyGeo = addGeo(new THREE.CylinderGeometry(0.056, 0.056, 0.048, 20));
      colBodyGeo.rotateZ(Math.PI / 2);
      const leverGeo = addGeo(new THREE.BoxGeometry(0.022, 0.065, 0.022));

      const buildCollar = () => {
        const cg = new THREE.Group();
        const body = new THREE.Mesh(colBodyGeo, darkSteelMat);
        body.castShadow = true;
        const lever = new THREE.Mesh(leverGeo, neonTrimMat);
        lever.position.set(0, 0.06, 0.015);
        lever.rotation.x = 0.25;
        cg.add(body, lever);
        return cg;
      };

      const rCol = buildCollar();
      rCol.position.x = plateOffset + 0.03;
      const lCol = buildCollar();
      lCol.position.x = -(plateOffset + 0.03);
      rightEndPivot.add(rCol);
      leftEndPivot.add(lCol);
    }

    // ================= 3D BAR PATH TRAJECTORY TRAIL (VOLT LIME) =================
    const BAR_PATH_POINTS = 56;
    const barPathPositions = new Float32Array(BAR_PATH_POINTS * 3);
    const barPathGeo = addGeo(new THREE.BufferGeometry());
    barPathGeo.setAttribute('position', new THREE.BufferAttribute(barPathPositions, 3));
    const barPathMat = addMat(
      new THREE.LineBasicMaterial({
        color: 0xc8f550,
        transparent: true,
        opacity: 0.72,
      })
    );
    const barPathLine = new THREE.Line(barPathGeo, barPathMat);
    barPathLine.frustumCulled = false;
    world.add(barPathLine);

    const barPathDot = new THREE.Mesh(
      addGeo(new THREE.SphereGeometry(0.026, 12, 12)),
      neonTrimMat
    );
    world.add(barPathDot);
    let barPathInitialized = false;

    // ================= BUILD STATION EQUIPMENT =================
    if (activeStation === 'bench') {
      const benchGroup = new THREE.Group();
      world.add(benchGroup);

      const baseBar = new THREE.Mesh(addGeo(new THREE.BoxGeometry(1.18, 0.06, 1.45)), frameAccentMat);
      baseBar.position.set(0, 0.03, 0.05);
      baseBar.receiveShadow = true;
      benchGroup.add(baseBar);

      const pad = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.34, 0.1, 1.08)), leatherMat);
      pad.position.set(0, 0.46, 0.02);
      pad.castShadow = true;
      pad.receiveShadow = true;
      benchGroup.add(pad);

      const legGeo = addGeo(new THREE.BoxGeometry(0.08, 0.4, 0.08));
      const fLeg = new THREE.Mesh(legGeo, darkSteelMat);
      fLeg.position.set(0, 0.23, 0.48);
      fLeg.castShadow = true;
      const bLeg = new THREE.Mesh(legGeo, darkSteelMat);
      bLeg.position.set(0, 0.23, -0.4);
      bLeg.castShadow = true;
      benchGroup.add(fLeg, bLeg);

      const postGeo = addGeo(new THREE.BoxGeometry(0.075, 1.18, 0.075));
      const lPost = new THREE.Mesh(postGeo, darkSteelMat);
      lPost.position.set(-0.56, 0.62, -0.44);
      lPost.castShadow = true;
      const rPost = new THREE.Mesh(postGeo, darkSteelMat);
      rPost.position.set(0.56, 0.62, -0.44);
      rPost.castShadow = true;
      benchGroup.add(lPost, rPost);

      const cupGeo = addGeo(new THREE.BoxGeometry(0.09, 0.08, 0.12));
      const lCup = new THREE.Mesh(cupGeo, neonTrimMat);
      lCup.position.set(-0.56, 1.05, -0.4);
      const rCup = new THREE.Mesh(cupGeo, neonTrimMat);
      rCup.position.set(0.56, 1.05, -0.4);
      benchGroup.add(lCup, rCup);

      const safeGeo = addGeo(new THREE.BoxGeometry(0.05, 0.05, 0.45));
      const lSafe = new THREE.Mesh(safeGeo, chromeMat);
      lSafe.position.set(-0.56, 0.66, -0.2);
      const rSafe = new THREE.Mesh(safeGeo, chromeMat);
      rSafe.position.set(0.56, 0.66, -0.2);
      benchGroup.add(lSafe, rSafe);
    } else if (activeStation === 'squat') {
      const rackGroup = new THREE.Group();
      world.add(rackGroup);

      const postGeo = addGeo(new THREE.BoxGeometry(0.08, 2.25, 0.08));
      const postPositions: [number, number][] = [
        [-0.64, -0.45],
        [0.64, -0.45],
        [-0.64, 0.45],
        [0.64, 0.45],
      ];
      postPositions.forEach(([px, pz]) => {
        const post = new THREE.Mesh(postGeo, darkSteelMat);
        post.position.set(px, 1.125, pz);
        post.castShadow = true;
        rackGroup.add(post);
      });

      const sideBeamGeo = addGeo(new THREE.BoxGeometry(0.07, 0.07, 0.96));
      const frontBeamGeo = addGeo(new THREE.BoxGeometry(1.36, 0.07, 0.07));
      [-0.64, 0.64].forEach((px) => {
        const topB = new THREE.Mesh(sideBeamGeo, frameAccentMat);
        topB.position.set(px, 2.22, 0);
        const botB = new THREE.Mesh(sideBeamGeo, frameAccentMat);
        botB.position.set(px, 0.04, 0);
        rackGroup.add(topB, botB);
      });
      const topFront = new THREE.Mesh(frontBeamGeo, neonTrimMat);
      topFront.position.set(0, 2.22, 0.45);
      const topBack = new THREE.Mesh(frontBeamGeo, frameAccentMat);
      topBack.position.set(0, 2.22, -0.45);
      const botBack = new THREE.Mesh(frontBeamGeo, frameAccentMat);
      botBack.position.set(0, 0.04, -0.45);
      rackGroup.add(topFront, topBack, botBack);

      const spotterGeo = addGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.92, 12));
      spotterGeo.rotateX(Math.PI / 2);
      [-0.64, 0.64].forEach((px) => {
        const sp = new THREE.Mesh(spotterGeo, chromeMat);
        sp.position.set(px, 0.72, 0);
        sp.castShadow = true;
        rackGroup.add(sp);
      });
    } else {
      const platGroup = new THREE.Group();
      world.add(platGroup);

      const centerOak = new THREE.Mesh(addGeo(new THREE.BoxGeometry(1.05, 0.07, 1.65)), oakMat);
      centerOak.position.set(0, 0.035, 0);
      centerOak.receiveShadow = true;
      const leftRub = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.68, 0.07, 1.65)), rubberMat);
      leftRub.position.set(-0.87, 0.035, 0);
      leftRub.receiveShadow = true;
      const rightRub = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.68, 0.07, 1.65)), rubberMat);
      rightRub.position.set(0.87, 0.035, 0);
      rightRub.receiveShadow = true;

      const trimFront = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.44, 0.075, 0.04)), neonTrimMat);
      trimFront.position.set(0, 0.038, 0.84);
      const trimBack = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.44, 0.075, 0.04)), darkSteelMat);
      trimBack.position.set(0, 0.038, -0.84);

      platGroup.add(centerOak, leftRub, rightRub, trimFront, trimBack);
    }

    // ================= BUILD SCULPTED 3D ATHLETE MANNEQUIN + MUSCLE HEATMAP =================
    const athlete = new THREE.Group();
    world.add(athlete);

    // Sculpted Pelvis & Athletic Waistband
    const pelvis = new THREE.Group();
    athlete.add(pelvis);

    const pelvisCore = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.145, 0.135, 0.16, 24)), shortsMat);
    pelvisCore.scale.set(1.12, 1, 0.74);
    pelvisCore.castShadow = true;
    pelvis.add(pelvisCore);

    const beltBand = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.148, 0.148, 0.032, 24)), neonTrimMat);
    beltBand.scale.set(1.13, 1, 0.75);
    beltBand.position.y = 0.072;
    pelvis.add(beltBand);

    // Contoured Glutes Heatmap Shells
    const gluteGeo = addGeo(new THREE.SphereGeometry(0.088, 18, 18));
    const lGlute = new THREE.Mesh(gluteGeo, glutesHeatMat);
    lGlute.scale.set(1.05, 0.95, 0.75);
    lGlute.position.set(-0.078, -0.02, -0.082);
    const rGlute = new THREE.Mesh(gluteGeo, glutesHeatMat);
    rGlute.scale.set(1.05, 0.95, 0.75);
    rGlute.position.set(0.078, -0.02, -0.082);
    pelvis.add(lGlute, rGlute);

    // Sculpted V-Tapered Athletic Torso (Waist -> Ribcage -> Lats -> Traps)
    const torso = new THREE.Group();
    torso.position.y = 0.08;
    pelvis.add(torso);

    const absMesh = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.155, 0.138, 0.22, 24)), suitMat);
    absMesh.scale.set(1.08, 1, 0.72);
    absMesh.position.y = 0.11;
    absMesh.castShadow = true;
    torso.add(absMesh);

    const upperChestMesh = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.195, 0.158, 0.28, 26)), suitMat);
    upperChestMesh.scale.set(1.12, 1, 0.68);
    upperChestMesh.position.y = 0.34;
    upperChestMesh.castShadow = true;
    torso.add(upperChestMesh);

    // Trapezius / Upper Back Slope
    const trapsMesh = new THREE.Mesh(addGeo(new THREE.SphereGeometry(0.165, 22, 16)), suitMat);
    trapsMesh.scale.set(1.22, 0.42, 0.68);
    trapsMesh.position.y = 0.47;
    trapsMesh.castShadow = true;
    torso.add(trapsMesh);

    // Subtle Spine Accent Line (Back)
    const spineAccent = new THREE.Mesh(addGeo(new THREE.CapsuleGeometry(0.012, 0.26, 8, 12)), neonTrimMat);
    spineAccent.position.set(0, 0.28, -0.118);
    torso.add(spineAccent);

    // Contoured Pecs Heatmap Shells (flush with chest)
    const pecGeo = addGeo(new THREE.SphereGeometry(0.082, 20, 18));
    const lPec = new THREE.Mesh(pecGeo, pecsHeatMat);
    lPec.scale.set(1.08, 0.78, 0.32);
    lPec.position.set(-0.082, 0.355, 0.108);
    const rPec = new THREE.Mesh(pecGeo, pecsHeatMat);
    rPec.scale.set(1.08, 0.78, 0.32);
    rPec.position.set(0.082, 0.355, 0.108);
    torso.add(lPec, rPec);

    // Sculpted Lats / Lower Back Heatmap Shells
    const backGeo = addGeo(new THREE.CapsuleGeometry(0.052, 0.2, 10, 14));
    const lBack = new THREE.Mesh(backGeo, backHeatMat);
    lBack.position.set(-0.068, 0.24, -0.102);
    lBack.rotation.z = -0.12;
    const rBack = new THREE.Mesh(backGeo, backHeatMat);
    rBack.position.set(0.068, 0.24, -0.102);
    rBack.rotation.z = 0.12;
    torso.add(lBack, rBack);

    // Neck + Sculpted Athletic Head + Sleek Dark Visor
    const neck = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.052, 0.062, 0.095, 18)), skinMat);
    neck.position.y = 0.535;
    neck.castShadow = true;
    torso.add(neck);

    const headGroup = new THREE.Group();
    headGroup.position.y = 0.655;
    const cranium = new THREE.Mesh(addGeo(new THREE.SphereGeometry(0.106, 24, 24)), skinMat);
    cranium.scale.set(0.92, 1.12, 0.98);
    cranium.castShadow = true;
    headGroup.add(cranium);

    const visor = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.098, 0.094, 0.042, 24, 1, false, -Math.PI * 0.35, Math.PI * 0.7)), visorMat);
    visor.position.set(0, 0.015, 0.015);
    headGroup.add(visor);
    torso.add(headGroup);

    // Sculpted Arms (Deltoids + Tapered Upper Arm + Forearm + Gripping Hand)
    const upperArmLen = 0.31;
    const foreArmLen = 0.29;
    const deltGeo = addGeo(new THREE.SphereGeometry(0.068, 18, 18));
    const triGeo = addGeo(new THREE.CapsuleGeometry(0.048, 0.12, 10, 14));
    const handGeo = addGeo(new THREE.SphereGeometry(0.044, 14, 14));

    const buildArm = (side: -1 | 1) => {
      const shoulderG = createLimbSegment(upperArmLen, 0.054, 0.044, skinMat, jointAccentMat, createdGeos);
      shoulderG.position.set(side * 0.235, 0.445, 0);

      const delt = new THREE.Mesh(deltGeo, suitMat);
      delt.scale.set(1.05, 1.15, 0.95);
      delt.position.set(side * 0.008, -0.015, 0);
      delt.castShadow = true;
      shoulderG.add(delt);

      const tri = new THREE.Mesh(triGeo, tricepsHeatMat);
      tri.position.set(0, -0.15, -0.018);
      shoulderG.add(tri);

      const elbowG = createLimbSegment(foreArmLen, 0.044, 0.032, skinMat, jointAccentMat, createdGeos);
      elbowG.position.y = -upperArmLen;

      const hand = new THREE.Mesh(handGeo, shoeMat);
      hand.scale.set(0.9, 1.1, 0.85);
      hand.position.y = -foreArmLen;
      elbowG.add(hand);

      shoulderG.add(elbowG);
      return { shoulderG, elbowG };
    };

    const { shoulderG: leftShoulderG, elbowG: leftElbowG } = buildArm(-1);
    const { shoulderG: rightShoulderG, elbowG: rightElbowG } = buildArm(1);
    torso.add(leftShoulderG, rightShoulderG);

    // Sculpted Legs (Thigh + Quads Heatmap + Tapered Calf + Athletic Shoe)
    const thighLen = 0.42;
    const shinLen = 0.42;
    const quadGeo = addGeo(new THREE.CapsuleGeometry(0.068, 0.18, 12, 16));
    const calfGeo = addGeo(new THREE.SphereGeometry(0.056, 16, 16));
    const shoeGeo = addGeo(new THREE.CapsuleGeometry(0.046, 0.11, 10, 14));

    const buildLeg = (side: -1 | 1) => {
      const hipG = createLimbSegment(thighLen, 0.078, 0.056, shortsMat, jointAccentMat, createdGeos);
      hipG.position.set(side * 0.108, -0.04, 0);

      const quad = new THREE.Mesh(quadGeo, quadsHeatMat);
      quad.position.set(0, -0.2, 0.022);
      hipG.add(quad);

      const kneeG = createLimbSegment(shinLen, 0.054, 0.038, skinMat, jointAccentMat, createdGeos);
      kneeG.position.y = -thighLen;

      const calf = new THREE.Mesh(calfGeo, skinMat);
      calf.scale.set(0.95, 1.65, 1.05);
      calf.position.set(0, -0.14, -0.018);
      calf.castShadow = true;
      kneeG.add(calf);

      const shoe = new THREE.Mesh(shoeGeo, shoeMat);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.0, 1.0, 0.72);
      shoe.position.set(0, -shinLen - 0.015, 0.048);
      shoe.castShadow = true;
      kneeG.add(shoe);

      hipG.add(kneeG);
      return { hipG, kneeG };
    };

    const { hipG: leftHipG, kneeG: leftKneeG } = buildLeg(-1);
    const { hipG: rightHipG, kneeG: rightKneeG } = buildLeg(1);
    pelvis.add(leftHipG, rightHipG);

    // ================= OPTIONAL CUSTOM .GLB MODEL LOADER (public/models/athlete.glb) =================
    let mixer: THREE.AnimationMixer | null = null;
    let glbModel: THREE.Group | null = null;
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
      './models/athlete.glb',
      (gltf) => {
        glbModel = gltf.scene;
        glbModel.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });
        athlete.visible = false;
        world.add(glbModel);
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(glbModel);
          const clip =
            gltf.animations.find((a) => a.name.toLowerCase().includes(activeStation)) || gltf.animations[0];
          mixer.clipAction(clip).play();
        }
        setCustomGlbLoaded(true);
      },
      undefined,
      () => {
        // No custom athlete.glb placed yet -> silently keep procedural cyber-athlete
        setCustomGlbLoaded(false);
      }
    );

    // ================= ANIMATION LOOP =================
    let frameId = 0;
    let cycleSec = 0;
    let lastTime = performance.now();
    let isBgPaused = false;
    let isInView = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isInView = Boolean(entries[0]?.isIntersecting);
              if (isInView) lastTime = performance.now();
            },
            { threshold: 0.05 }
          )
        : null;
    io?.observe(container);
    const unsubscribeLifecycle = subscribeAppLifecycle((state) => {
      isBgPaused = state === 'background' || state === 'hidden';
      if (!isBgPaused) {
        lastTime = performance.now();
      }
    });
    const loadRatio = Math.max(0, Math.min(1, (targetWeight - 60) / 140)); // 0 at <=60kg, 1 at >=200kg

    const setHeat = (mat: THREE.MeshStandardMaterial, intensity: number) => {
      const active = showHeatmapRef.current ? intensity : 0;
      mat.opacity = active * 0.72;
      mat.emissiveIntensity = active * 0.75;
    };

    const animate = (now: number) => {
      if (isBgPaused || !isInView) {
        frameId = requestAnimationFrame(animate);
        return;
      }
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (isPlayingRef.current) {
        cycleSec += dt;
        mixer?.update(dt);
      }

      const { rep, effort, stickingPoint, phaseLabel: curPhase } = evaluateFourPhaseRep(cycleSec);
      if (curPhase !== lastPhaseRef.current) {
        lastPhaseRef.current = curPhase;
        setPhaseLabel(curPhase);
      }

      // Heavy-weight barbell whip & sticking-point micro-vibration
      const whipAngle = loadRatio * (0.045 + stickingPoint * 0.045 + Math.sin(now * 0.025) * 0.008 * effort);
      rightEndPivot.rotation.z = -whipAngle;
      leftEndPivot.rotation.z = whipAngle;
      const microShake = stickingPoint * loadRatio * Math.sin(now * 0.09) * 0.006;

      // Update Muscle Heatmap intensity per exercise
      if (activeStation === 'bench') {
        setHeat(pecsHeatMat, effort * 0.65);
        setHeat(tricepsHeatMat, effort * 0.55);
        setHeat(quadsHeatMat, 0);
        setHeat(glutesHeatMat, 0);
        setHeat(backHeatMat, 0);

        // Athlete lies flat on bench pad (pad top y = 0.51, front edge z = 0.56)
        pelvis.position.set(0, 0.58, 0.38);
        pelvis.rotation.set(-Math.PI / 2, 0, 0);
        torso.rotation.set(0.03, 0, 0);

        // Legs splay cleanly around front edge of bench, shins go straight down to floor (no clipping)
        leftHipG.rotation.set(0.28, 0, -0.34);
        rightHipG.rotation.set(0.28, 0, 0.34);
        leftKneeG.rotation.set(1.25, 0, 0.18);
        rightKneeG.rotation.set(1.25, 0, -0.18);

        // Barbell travels directly over chest (shoulders are at world y ~ 0.59, z ~ -0.14)
        const barY = 1.13 - rep * 0.39 + microShake;
        const barZ = -0.14 + rep * 0.05;
        barbellGroup.position.set(0, barY, barZ);

        // Exact 2-bone analytical IK in torso local space (pelvis rotated -PI/2 around X: local +Z = world UP, local +Y = world -Z)
        const shoulderY = 0.593;
        const shoulderZ = -0.145;
        // Convert world delta (bar - shoulder) into torso local YZ plane:
        // local_dy (towards head) = -(barZ - shoulderZ), local_dz (UP) = (barY - shoulderY)
        const localDy = -(barZ - shoulderZ);
        const localDz = barY - shoulderY;
        const dist = Math.min(upperArmLen + foreArmLen - 0.01, Math.max(0.14, Math.hypot(localDy, localDz)));
        const cosElbow = Math.max(
          -1,
          Math.min(1, (upperArmLen * upperArmLen + foreArmLen * foreArmLen - dist * dist) / (2 * upperArmLen * foreArmLen))
        );
        const elbowFlex = Math.PI - Math.acos(cosElbow);
        const cosAlpha = Math.max(
          -1,
          Math.min(1, (upperArmLen * upperArmLen + dist * dist - foreArmLen * foreArmLen) / (2 * upperArmLen * dist))
        );
        const alpha = Math.acos(cosAlpha);
        // Arm at rest points along local -Y; rotation.x by rx gives (0, -cos(rx), -sin(rx))
        const rxTarget = Math.atan2(-localDz, -localDy);
        const upperArmPitch = rxTarget + alpha; // negative angle -> points UP towards barbell!
        const flareOut = 0.12 + rep * 0.16;

        leftShoulderG.rotation.set(upperArmPitch, 0, -flareOut);
        rightShoulderG.rotation.set(upperArmPitch, 0, flareOut);
        leftElbowG.rotation.set(-elbowFlex, 0, flareOut * 0.9);
        rightElbowG.rotation.set(-elbowFlex, 0, -flareOut * 0.9);
      } else if (activeStation === 'squat') {
        setHeat(pecsHeatMat, 0);
        setHeat(tricepsHeatMat, 0);
        setHeat(quadsHeatMat, effort);
        setHeat(glutesHeatMat, effort * 0.9);
        setHeat(backHeatMat, effort * 0.45);

        const hipDrop = rep * 0.42;
        const hipBack = -rep * 0.16;
        pelvis.position.set(0, 0.9 - hipDrop, hipBack);
        pelvis.rotation.set(0, 0, 0);

        const torsoLean = 0.08 + rep * 0.48;
        torso.rotation.set(torsoLean, 0, 0);

        const hipFlex = -rep * 1.28;
        const kneeFlex = rep * 1.65;
        leftHipG.rotation.set(hipFlex, 0, -0.14);
        rightHipG.rotation.set(hipFlex, 0, 0.14);
        leftKneeG.rotation.set(kneeFlex, 0, 0);
        rightKneeG.rotation.set(kneeFlex, 0, 0);

        leftShoulderG.rotation.set(-0.35, 0, -0.85);
        rightShoulderG.rotation.set(-0.35, 0, 0.85);
        leftElbowG.rotation.set(-1.75, 0, 0.35);
        rightElbowG.rotation.set(-1.75, 0, -0.35);

        const barY = pelvis.position.y + Math.cos(torsoLean) * 0.48 + 0.08 + microShake;
        const barZ = pelvis.position.z + Math.sin(torsoLean) * 0.48 - 0.11;
        barbellGroup.position.set(0, barY, barZ);
      } else {
        setHeat(pecsHeatMat, 0);
        setHeat(tricepsHeatMat, 0);
        setHeat(quadsHeatMat, effort * 0.55);
        setHeat(glutesHeatMat, effort * 0.95);
        setHeat(backHeatMat, effort);

        const floorBarY = plates.length > 0 ? Math.max(0.24, (PLATE_RADIUS_MAP[plates[0].weight] || 0.44) + 0.07) : 0.24;
        const lockoutBarY = 0.78;
        const barY = lockoutBarY - rep * (lockoutBarY - floorBarY) + microShake;
        barbellGroup.position.set(0, barY, 0.22);

        const hipDrop = rep * 0.26;
        const hipBack = -rep * 0.22;
        pelvis.position.set(0, 0.9 - hipDrop, hipBack);
        pelvis.rotation.set(0, 0, 0);

        const torsoLean = 0.05 + rep * 0.92;
        torso.rotation.set(torsoLean, 0, 0);

        leftHipG.rotation.set(-rep * 0.85, 0, -0.1);
        rightHipG.rotation.set(-rep * 0.85, 0, 0.1);
        leftKneeG.rotation.set(rep * 0.92, 0, 0);
        rightKneeG.rotation.set(rep * 0.92, 0, 0);

        leftShoulderG.rotation.set(-torsoLean + 0.08, 0, -0.08);
        rightShoulderG.rotation.set(-torsoLean + 0.08, 0, 0.08);
        leftElbowG.rotation.set(-0.04, 0, 0);
        rightElbowG.rotation.set(-0.04, 0, 0);
      }

      // Update 3D Bar Path Trajectory Trail
      const showPath = showBarPathRef.current;
      barPathLine.visible = showPath;
      barPathDot.visible = showPath;
      if (showPath) {
        const bx = barbellGroup.position.x;
        const by = barbellGroup.position.y;
        const bz = barbellGroup.position.z;
        barPathDot.position.set(bx, by, bz);

        if (!barPathInitialized) {
          for (let i = 0; i < BAR_PATH_POINTS; i++) {
            barPathPositions[i * 3] = bx;
            barPathPositions[i * 3 + 1] = by;
            barPathPositions[i * 3 + 2] = bz;
          }
          barPathInitialized = true;
        } else if (isPlayingRef.current) {
          for (let i = 0; i < BAR_PATH_POINTS - 1; i++) {
            barPathPositions[i * 3] = barPathPositions[(i + 1) * 3];
            barPathPositions[i * 3 + 1] = barPathPositions[(i + 1) * 3 + 1];
            barPathPositions[i * 3 + 2] = barPathPositions[(i + 1) * 3 + 2];
          }
          const last = (BAR_PATH_POINTS - 1) * 3;
          barPathPositions[last] = bx;
          barPathPositions[last + 1] = by;
          barPathPositions[last + 2] = bz;
        }
        (barPathGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      const st = orbitRef.current;
      st.rotY += (st.targetRotY - st.rotY) * 0.12;
      st.rotX += (st.targetRotX - st.rotX) * 0.12;
      world.rotation.y = st.rotY;
      world.rotation.x = st.rotX;

      if (composer) {
        composer.render();
      } else {
        renderer.render(scene, camera);
      }
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 256;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      composer?.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      io?.disconnect();
      unsubscribeLifecycle();
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      envRT.dispose();
      pmremGenerator.dispose();
      createdTextures.forEach((t) => t.dispose());
      createdGeos.forEach((g) => g.dispose());
      createdMats.forEach((m) => m.dispose());
      composer?.dispose();
      renderer.dispose();
    };
  }, [activeStation, plates, targetWeight]);

  const handlePointerDown = (e: React.PointerEvent) => {
    orbitRef.current.isDragging = true;
    orbitRef.current.lastX = e.clientX;
    orbitRef.current.lastY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!orbitRef.current.isDragging) return;
    const dx = e.clientX - orbitRef.current.lastX;
    const dy = e.clientY - orbitRef.current.lastY;
    orbitRef.current.lastX = e.clientX;
    orbitRef.current.lastY = e.clientY;
    orbitRef.current.targetRotY += dx * 0.012;
    orbitRef.current.targetRotX = Math.max(-0.2, Math.min(0.65, orbitRef.current.targetRotX + dy * 0.008));
  };

  const handlePointerUp = () => {
    orbitRef.current.isDragging = false;
  };

  const stationLabels: { id: ExerciseId; label: string }[] = [
    { id: 'bench', label: 'Жим' },
    { id: 'squat', label: 'Присед' },
    { id: 'deadlift', label: 'Становая' },
  ];

  return (
    <div className="slate-card slate-card-active rounded-2xl p-4 relative overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 " />
            3D-сборка штанги
          </div>
          <div className="text-sm font-semibold text-slate-50 mt-0.5 leading-snug truncate">{title}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono tabular text-2xl font-extrabold text-sky-300 tracking-tight">
            <AnimatedNumber value={targetWeight} /> <span className="text-xs font-medium text-slate-400">кг</span>
          </div>
          <div className="font-mono tabular text-[11px] text-emerald-300/90">
            +<AnimatedNumber value={perSideKg} /> кг / сторона
          </div>
        </div>
      </div>

      {/* Exercise Station Switcher */}
      <div className="grid grid-cols-3 gap-1.5 mb-2.5">
        {stationLabels.map((st) => {
          const isAct = activeStation === st.id;
          return (
            <button
              key={st.id}
              onClick={() => {
                NativeiOSBridge.haptic('medium', hapticsEnabled);
                NativeiOSBridge.playPlateClank(soundEnabled, st.id === 'deadlift' ? 0.85 : 1.05);
                setActiveStation(st.id);
              }}
              className={`py-1.5 rounded-xl font-mono text-[11px] font-bold transition-all active:scale-95 ${
                isAct
                  ? 'bg-sky-400 text-slate-950 shadow-md shadow-sky-400/20'
                  : 'slate-well text-slate-400 hover:text-slate-100'
              }`}
            >
              {st.label}
            </button>
          );
        })}
      </div>

      {/* Interactive 3D Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative ${
          compact ? 'h-56' : 'h-64'
        } slate-well rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing touch-none`}
      >
        {webglReady ? (
          <div ref={mountRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-mono">
            3D WebGL недоступен · Сборка: {plates.map((p) => p.label).join(' + ') || 'Пустой гриф'}
          </div>
        )}

        {/* Camera Presets */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-slate-950/75 backdrop-blur-md border border-slate-400/15 rounded-xl p-1">
          {(
            [
              { id: 'quarter', label: '3D' },
              { id: 'side', label: 'Сбоку' },
              { id: 'front', label: 'Спереди' },
            ] as const
          ).map((cam) => (
            <button
              key={cam.id}
              onClick={(e) => {
                e.stopPropagation();
                NativeiOSBridge.haptic('light', hapticsEnabled);
                setCameraPreset(cam.id);
              }}
              className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-semibold transition-colors ${
                cameraPreset === cam.id ? 'bg-sky-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {cam.label}
            </button>
          ))}
        </div>

        {/* Live 4-Phase Tempo Indicator Pill */}
        <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-400/15 font-mono text-[10px] font-bold text-amber-300 pointer-events-none">
          {phaseLabel}
        </div>

        {/* Bar Path + Heatmap + Play/Pause Controls */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setShowBarPath((v) => !v);
            }}
            className={`px-2.5 py-1 rounded-xl border font-mono text-[10px] font-bold active:scale-90 transition-all ${
              showBarPath
                ? 'bg-sky-400/15 border-sky-400/35 text-sky-300'
                : 'bg-slate-950/85 border-slate-400/15 text-slate-400'
            }`}
          >
            Путь
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setShowHeatmap((v) => !v);
            }}
            className={`px-2.5 py-1 rounded-xl border font-mono text-[10px] font-bold active:scale-90 transition-all ${
              showHeatmap
                ? 'bg-sky-400/15 border-sky-400/35 text-sky-300'
                : 'bg-slate-950/85 border-slate-400/15 text-slate-400'
            }`}
          >
            Мышцы
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setIsPlaying((p) => !p);
            }}
            className="px-2.5 py-1 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-sky-400/30 font-mono text-[10px] font-bold text-sky-300 active:scale-90 transition-transform"
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>

        <div className="absolute bottom-2.5 left-3 text-[10px] font-mono text-slate-500 pointer-events-none">
          Крути 360°
        </div>
      </div>

      {/* Bottom Plate Breakdown Strip */}
      <div className="flex items-center justify-between pt-2.5 text-xs gap-2">
        <span className="text-slate-400 shrink-0">Блины на сторону:</span>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {plates.length === 0 ? (
            <span className="font-mono text-slate-300">Только гриф ({barbellWeight} кг)</span>
          ) : (
            plates.map((p, idx) => (
              <span
                key={`${p.weight}-${idx}`}
                style={{ borderColor: p.color }}
                className="px-2 py-0.5 rounded-md bg-slate-950/90 border font-mono tabular text-[11px] font-bold text-slate-100"
              >
                {p.label}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
