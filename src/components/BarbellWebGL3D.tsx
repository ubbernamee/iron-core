import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { NativeiOSBridge } from '../engine/iosBridge';
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
  const lastPhaseRef = useRef<LiftPhaseLabel>('Опускание');

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
  }, [showHeatmap]);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Realistic IBL metallic reflections via RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 1.48, 4.95);
    camera.lookAt(0, 0.88, 0);

    // Optional Post-Processing Neon Bloom
    let composer: EffectComposer | null = null;
    try {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.28, 0.45, 0.86);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
    } catch {
      composer = null;
    }

    // Studio Lighting with Soft Shadows
    scene.add(new THREE.AmbientLight(0xdbeafe, 0.45));

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.85);
    keyLight.position.set(3.8, 6.8, 4.6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    keyLight.shadow.camera.left = -2.8;
    keyLight.shadow.camera.right = 2.8;
    keyLight.shadow.camera.top = 2.8;
    keyLight.shadow.camera.bottom = -2.8;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const warmFill = new THREE.DirectionalLight(0xf59e0b, 0.35);
    warmFill.position.set(2.5, 1.2, -3.5);
    scene.add(warmFill);

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
    createdTextures.push(knurlTex, oakTex, rubberTex);

    // PBR Materials
    const chromeMat = addMat(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.14 }));
    const knurledSteelMat = addMat(
      new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.88,
        roughness: 0.32,
        bumpMap: knurlTex,
        bumpScale: 0.012,
      })
    );
    const darkSteelMat = addMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 }));
    const frameAccentMat = addMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.72, roughness: 0.38 }));
    const leatherMat = addMat(new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.08, roughness: 0.72 }));
    const rubberMat = addMat(new THREE.MeshStandardMaterial({ map: rubberTex, metalness: 0.05, roughness: 0.9 }));
    const oakMat = addMat(new THREE.MeshStandardMaterial({ map: oakTex, metalness: 0.04, roughness: 0.58 }));
    const neonTrimMat = addMat(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.95, roughness: 0.2 })
    );

    // Athlete Base Materials
    const suitMat = addMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.25, roughness: 0.48 }));
    const shortsMat = addMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.15, roughness: 0.62 }));
    const skinMat = addMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.32, roughness: 0.4 }));
    const jointAccentMat = addMat(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0369a1, emissiveIntensity: 0.55, roughness: 0.28 })
    );

    // Muscle Heatmap Materials (dynamically driven each frame)
    const makeHeatMat = () =>
      addMat(
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xea580c,
          emissiveIntensity: 0.0,
          transparent: true,
          opacity: 0.0,
          roughness: 0.3,
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

    // Studio Floor (Receives Soft Shadows)
    const baseDisc = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(2.38, 2.48, 0.06, 48)), rubberMat);
    baseDisc.position.y = -0.03;
    baseDisc.receiveShadow = true;
    world.add(baseDisc);

    const floorRing = new THREE.Mesh(
      addGeo(new THREE.RingGeometry(2.26, 2.31, 64)),
      addMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, side: THREE.DoubleSide }))
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.005;
    world.add(floorRing);

    // ================= BUILD LOADED IPF BARBELL WITH FLEXING SLEEVES =================
    const barbellGroup = new THREE.Group();
    world.add(barbellGroup);

    const shaft = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.022, 0.022, 1.38, 18)), knurledSteelMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.castShadow = true;
    barbellGroup.add(shaft);

    // Left & Right Sleeve Pivots (for realistic heavy-weight barbell whip/bend)
    const leftEndPivot = new THREE.Group();
    leftEndPivot.position.x = -0.68;
    const rightEndPivot = new THREE.Group();
    rightEndPivot.position.x = 0.68;
    barbellGroup.add(leftEndPivot, rightEndPivot);

    const shoulderGeo = addGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 18));
    shoulderGeo.rotateZ(Math.PI / 2);
    const lSh = new THREE.Mesh(shoulderGeo, chromeMat);
    lSh.position.x = -0.02;
    lSh.castShadow = true;
    const rSh = new THREE.Mesh(shoulderGeo, chromeMat);
    rSh.position.x = 0.02;
    rSh.castShadow = true;
    leftEndPivot.add(lSh);
    rightEndPivot.add(rSh);

    const sleeveGeo = addGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.46, 18));
    sleeveGeo.rotateZ(Math.PI / 2);
    const lSl = new THREE.Mesh(sleeveGeo, chromeMat);
    lSl.position.x = -0.26;
    lSl.castShadow = true;
    const rSl = new THREE.Mesh(sleeveGeo, chromeMat);
    rSl.position.x = 0.26;
    rSl.castShadow = true;
    leftEndPivot.add(lSl);
    rightEndPivot.add(rSl);

    let plateOffset = 0.05;
    plates.forEach((plate: PlateSpec) => {
      const r = PLATE_RADIUS_MAP[plate.weight] || 0.3;
      const th = PLATE_THICKNESS_MAP[plate.weight] || 0.045;
      const lightText = plate.weight !== 5 && plate.weight !== 1.25;
      const tex = createPlateLabelTexture(plate.label, plate.color, lightText);
      createdTextures.push(tex);

      const rimMat = addMat(new THREE.MeshStandardMaterial({ color: new THREE.Color(plate.edge), roughness: 0.42, metalness: 0.2 }));
      const faceMat = addMat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.15 }));
      const discGeo = addGeo(new THREE.CylinderGeometry(r, r, th, 32));
      discGeo.rotateZ(Math.PI / 2);

      const rightP = new THREE.Mesh(discGeo, [rimMat, faceMat, faceMat]);
      rightP.position.x = plateOffset + th / 2;
      rightP.castShadow = true;
      const leftP = new THREE.Mesh(discGeo, [rimMat, faceMat, faceMat]);
      leftP.position.x = -(plateOffset + th / 2);
      leftP.castShadow = true;

      rightEndPivot.add(rightP);
      leftEndPivot.add(leftP);
      plateOffset += th + 0.008;
    });

    if (plates.length > 0) {
      const colGeo = addGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16));
      colGeo.rotateZ(Math.PI / 2);
      const rCol = new THREE.Mesh(colGeo, neonTrimMat);
      rCol.position.x = plateOffset + 0.03;
      const lCol = new THREE.Mesh(colGeo, neonTrimMat);
      lCol.position.x = -(plateOffset + 0.03);
      rightEndPivot.add(rCol);
      leftEndPivot.add(lCol);
    }

    // ================= BUILD STATION EQUIPMENT =================
    if (activeStation === 'bench') {
      const benchGroup = new THREE.Group();
      world.add(benchGroup);

      const baseBar = new THREE.Mesh(addGeo(new THREE.BoxGeometry(1.18, 0.06, 1.45)), frameAccentMat);
      baseBar.position.set(0, 0.03, 0.05);
      baseBar.receiveShadow = true;
      benchGroup.add(baseBar);

      const pad = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.34, 0.1, 1.25)), leatherMat);
      pad.position.set(0, 0.46, 0.1);
      pad.castShadow = true;
      pad.receiveShadow = true;
      benchGroup.add(pad);

      const legGeo = addGeo(new THREE.BoxGeometry(0.08, 0.4, 0.08));
      const fLeg = new THREE.Mesh(legGeo, darkSteelMat);
      fLeg.position.set(0, 0.23, 0.58);
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

    // ================= BUILD 3D PROCEDURAL ATHLETE + MUSCLE HEATMAP =================
    const athlete = new THREE.Group();
    world.add(athlete);

    const pelvis = new THREE.Group();
    athlete.add(pelvis);
    const pelvisMesh = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.32, 0.16, 0.2)), shortsMat);
    pelvisMesh.castShadow = true;
    pelvis.add(pelvisMesh);

    // Glutes Heatmap Pad
    const glutesPad = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.3, 0.14, 0.06)), glutesHeatMat);
    glutesPad.position.set(0, -0.01, -0.095);
    pelvis.add(glutesPad);

    const torso = new THREE.Group();
    torso.position.y = 0.08;
    pelvis.add(torso);

    const chestMesh = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.38, 0.48, 0.22)), suitMat);
    chestMesh.position.y = 0.26;
    chestMesh.castShadow = true;
    torso.add(chestMesh);

    const coreStripe = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.05, 0.34, 0.23)), neonTrimMat);
    coreStripe.position.y = 0.26;
    torso.add(coreStripe);

    // Pecs Heatmap Pads (Chest)
    const pecGeo = addGeo(new THREE.BoxGeometry(0.14, 0.14, 0.04));
    const lPec = new THREE.Mesh(pecGeo, pecsHeatMat);
    lPec.position.set(-0.095, 0.36, 0.11);
    const rPec = new THREE.Mesh(pecGeo, pecsHeatMat);
    rPec.position.set(0.095, 0.36, 0.11);
    torso.add(lPec, rPec);

    // Lower Back / Erectors Heatmap Pad
    const backPad = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.24, 0.26, 0.04)), backHeatMat);
    backPad.position.set(0, 0.2, -0.11);
    torso.add(backPad);

    const head = new THREE.Mesh(addGeo(new THREE.SphereGeometry(0.125, 20, 20)), skinMat);
    head.position.y = 0.64;
    head.castShadow = true;
    torso.add(head);

    // Arms + Triceps Heatmap
    const upperArmLen = 0.31;
    const foreArmLen = 0.29;
    const triGeo = addGeo(new THREE.CylinderGeometry(0.058, 0.05, 0.18, 12));

    const leftShoulderG = createLimbSegment(upperArmLen, 0.055, 0.048, skinMat, jointAccentMat, createdGeos);
    leftShoulderG.position.set(-0.24, 0.46, 0);
    const lTri = new THREE.Mesh(triGeo, tricepsHeatMat);
    lTri.position.set(0, -0.15, -0.01);
    leftShoulderG.add(lTri);
    const leftElbowG = createLimbSegment(foreArmLen, 0.046, 0.038, skinMat, jointAccentMat, createdGeos);
    leftElbowG.position.y = -upperArmLen;
    leftShoulderG.add(leftElbowG);

    const rightShoulderG = createLimbSegment(upperArmLen, 0.055, 0.048, skinMat, jointAccentMat, createdGeos);
    rightShoulderG.position.set(0.24, 0.46, 0);
    const rTri = new THREE.Mesh(triGeo, tricepsHeatMat);
    rTri.position.set(0, -0.15, -0.01);
    rightShoulderG.add(rTri);
    const rightElbowG = createLimbSegment(foreArmLen, 0.046, 0.038, skinMat, jointAccentMat, createdGeos);
    rightElbowG.position.y = -upperArmLen;
    rightShoulderG.add(rightElbowG);

    torso.add(leftShoulderG, rightShoulderG);

    // Legs + Quads Heatmap
    const thighLen = 0.42;
    const shinLen = 0.42;
    const quadGeo = addGeo(new THREE.CylinderGeometry(0.078, 0.064, 0.26, 14));

    const leftHipG = createLimbSegment(thighLen, 0.075, 0.06, shortsMat, jointAccentMat, createdGeos);
    leftHipG.position.set(-0.11, -0.04, 0);
    const lQuad = new THREE.Mesh(quadGeo, quadsHeatMat);
    lQuad.position.set(0, -0.2, 0.015);
    leftHipG.add(lQuad);
    const leftKneeG = createLimbSegment(shinLen, 0.058, 0.045, skinMat, jointAccentMat, createdGeos);
    leftKneeG.position.y = -thighLen;
    leftHipG.add(leftKneeG);

    const rightHipG = createLimbSegment(thighLen, 0.075, 0.06, shortsMat, jointAccentMat, createdGeos);
    rightHipG.position.set(0.11, -0.04, 0);
    const rQuad = new THREE.Mesh(quadGeo, quadsHeatMat);
    rQuad.position.set(0, -0.2, 0.015);
    rightHipG.add(rQuad);
    const rightKneeG = createLimbSegment(shinLen, 0.058, 0.045, skinMat, jointAccentMat, createdGeos);
    rightKneeG.position.y = -thighLen;
    rightHipG.add(rightKneeG);

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
    const loadRatio = Math.max(0, Math.min(1, (targetWeight - 60) / 140)); // 0 at <=60kg, 1 at >=200kg

    const setHeat = (mat: THREE.MeshStandardMaterial, intensity: number) => {
      const active = showHeatmapRef.current ? intensity : 0;
      mat.opacity = active * 0.85;
      mat.emissiveIntensity = active * 1.4;
    };

    const animate = (now: number) => {
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
        setHeat(pecsHeatMat, effort);
        setHeat(tricepsHeatMat, effort * 0.85);
        setHeat(quadsHeatMat, 0);
        setHeat(glutesHeatMat, 0);
        setHeat(backHeatMat, 0);

        pelvis.position.set(0, 0.56, 0.24);
        pelvis.rotation.set(-Math.PI / 2, 0, 0);
        torso.rotation.set(0.05, 0, 0);

        leftHipG.rotation.set(Math.PI / 2 + 0.15, 0, -0.14);
        rightHipG.rotation.set(Math.PI / 2 + 0.15, 0, 0.14);
        leftKneeG.rotation.set(-1.35, 0, 0);
        rightKneeG.rotation.set(-1.35, 0, 0);

        const barY = 1.18 - rep * 0.4 + microShake;
        const barZ = -0.18 + rep * 0.06;
        barbellGroup.position.set(0, barY, barZ);

        const shoulderAngle = Math.PI / 2 + rep * 0.85;
        const elbowAngle = -(rep * 1.55 + 0.12);
        leftShoulderG.rotation.set(shoulderAngle, 0, -0.35 - rep * 0.25);
        rightShoulderG.rotation.set(shoulderAngle, 0, 0.35 + rep * 0.25);
        leftElbowG.rotation.set(elbowAngle, 0, 0.22);
        rightElbowG.rotation.set(elbowAngle, 0, -0.22);
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
    <div className="slate-card slate-card-active rounded-[26px] p-4 relative overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            3D Pro Studio · {customGlbLoaded ? 'GLB Модель' : 'PBR + Bloom'}
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

        {/* Heatmap + Play/Pause Controls */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setShowHeatmap((v) => !v);
            }}
            className={`px-2.5 py-1 rounded-xl border font-mono text-[10px] font-bold active:scale-90 transition-all ${
              showHeatmap
                ? 'bg-orange-500/20 border-orange-400/50 text-orange-300'
                : 'bg-slate-950/85 border-slate-400/15 text-slate-400'
            }`}
          >
            🔥 Мышцы
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
