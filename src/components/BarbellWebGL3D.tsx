import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
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

function createPlateLabelTexture(label: string, bgColor: string, lightText: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(128, 128, 116, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 52, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = lightText ? '#F8FAFC' : '#090D16';
  ctx.font = '800 34px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 44);
  ctx.fillText('KG', 128, 212);

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
  const jointGeo = new THREE.SphereGeometry(topR * 1.06, 16, 16);
  const segGeo = new THREE.CylinderGeometry(topR, botR, length, 16);
  geos.push(jointGeo, segGeo);

  const joint = new THREE.Mesh(jointGeo, jointMat);
  const seg = new THREE.Mesh(segGeo, mat);
  seg.position.y = -length / 2;
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
  const [cameraPreset, setCameraPreset] = useState<'quarter' | 'side' | 'front'>('quarter');

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
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

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

  // Main Three.js 3D Gym Studio Scene
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
    const height = container.clientHeight || 240;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 1.45, 4.9);
    camera.lookAt(0, 0.9, 0);

    // Studio Lighting
    scene.add(new THREE.AmbientLight(0xdbeafe, 0.78));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(4, 7, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.45);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    const accentFill = new THREE.DirectionalLight(0x34d399, 0.55);
    accentFill.position.set(0, 1, 5);
    scene.add(accentFill);

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

    // Shared Materials
    const chromeMat = addMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.2 }));
    const darkSteelMat = addMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.75, roughness: 0.35 }));
    const frameAccentMat = addMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.65, roughness: 0.4 }));
    const leatherMat = addMat(new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.1, roughness: 0.78 }));
    const rubberMat = addMat(new THREE.MeshStandardMaterial({ color: 0x0b0f19, metalness: 0.05, roughness: 0.92 }));
    const oakMat = addMat(new THREE.MeshStandardMaterial({ color: 0x8a623c, metalness: 0.05, roughness: 0.65 }));
    const neonTrimMat = addMat(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.65, roughness: 0.2 })
    );

    // Athlete Materials (Stylized Athletic Cyber-Mannequin)
    const suitMat = addMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.22, roughness: 0.52 }));
    const shortsMat = addMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.15, roughness: 0.65 }));
    const skinMat = addMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.25, roughness: 0.45 }));
    const jointAccentMat = addMat(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0369a1, emissiveIntensity: 0.4, roughness: 0.3 })
    );

    // Root World Pivot (for orbit rotation)
    const world = new THREE.Group();
    world.position.y = -0.15;
    scene.add(world);

    // Subtle Studio Floor Base
    const baseDisc = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(2.35, 2.45, 0.06, 48)), rubberMat);
    baseDisc.position.y = -0.03;
    world.add(baseDisc);

    const floorRing = new THREE.Mesh(
      addGeo(new THREE.RingGeometry(2.26, 2.31, 64)),
      addMat(new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.25, side: THREE.DoubleSide }))
    );
    floorRing.rotation.x = -Math.PI / 2;
    floorRing.position.y = 0.005;
    world.add(floorRing);

    // ================= BUILD LOADED IPF BARBELL =================
    const barbellGroup = new THREE.Group();
    world.add(barbellGroup);

    const shaft = new THREE.Mesh(addGeo(new THREE.CylinderGeometry(0.022, 0.022, 1.38, 16)), darkSteelMat);
    shaft.rotation.z = Math.PI / 2;
    barbellGroup.add(shaft);

    const shoulderGeo = addGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.04, 16));
    shoulderGeo.rotateZ(Math.PI / 2);
    const lSh = new THREE.Mesh(shoulderGeo, chromeMat);
    lSh.position.x = -0.7;
    const rSh = new THREE.Mesh(shoulderGeo, chromeMat);
    rSh.position.x = 0.7;
    barbellGroup.add(lSh, rSh);

    const sleeveGeo = addGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.46, 16));
    sleeveGeo.rotateZ(Math.PI / 2);
    const lSl = new THREE.Mesh(sleeveGeo, chromeMat);
    lSl.position.x = -0.94;
    const rSl = new THREE.Mesh(sleeveGeo, chromeMat);
    rSl.position.x = 0.94;
    barbellGroup.add(lSl, rSl);

    let plateCursorX = 0.73;
    plates.forEach((plate: PlateSpec) => {
      const r = PLATE_RADIUS_MAP[plate.weight] || 0.3;
      const th = PLATE_THICKNESS_MAP[plate.weight] || 0.045;
      const lightText = plate.weight !== 5 && plate.weight !== 1.25;
      const tex = createPlateLabelTexture(plate.label, plate.color, lightText);
      createdTextures.push(tex);

      const rimMat = addMat(new THREE.MeshStandardMaterial({ color: new THREE.Color(plate.edge), roughness: 0.45 }));
      const faceMat = addMat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
      const discGeo = addGeo(new THREE.CylinderGeometry(r, r, th, 28));
      discGeo.rotateZ(Math.PI / 2);

      const rightP = new THREE.Mesh(discGeo, [rimMat, faceMat, faceMat]);
      rightP.position.x = plateCursorX + th / 2;
      const leftP = new THREE.Mesh(discGeo, [rimMat, faceMat, faceMat]);
      leftP.position.x = -(plateCursorX + th / 2);
      barbellGroup.add(rightP, leftP);

      plateCursorX += th + 0.008;
    });

    if (plates.length > 0) {
      const colGeo = addGeo(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 16));
      colGeo.rotateZ(Math.PI / 2);
      const rCol = new THREE.Mesh(colGeo, neonTrimMat);
      rCol.position.x = plateCursorX + 0.03;
      const lCol = new THREE.Mesh(colGeo, neonTrimMat);
      lCol.position.x = -(plateCursorX + 0.03);
      barbellGroup.add(rCol, lCol);
    }

    // ================= BUILD STATION EQUIPMENT =================
    if (activeStation === 'bench') {
      // Competition Bench Press Station
      const benchGroup = new THREE.Group();
      world.add(benchGroup);

      // Floor frame
      const baseBar = new THREE.Mesh(addGeo(new THREE.BoxGeometry(1.18, 0.06, 1.45)), frameAccentMat);
      baseBar.position.set(0, 0.03, 0.05);
      benchGroup.add(baseBar);

      // Main Bench Pad
      const pad = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.34, 0.1, 1.25)), leatherMat);
      pad.position.set(0, 0.46, 0.1);
      benchGroup.add(pad);

      // Pad support legs
      const legGeo = addGeo(new THREE.BoxGeometry(0.08, 0.4, 0.08));
      const fLeg = new THREE.Mesh(legGeo, darkSteelMat);
      fLeg.position.set(0, 0.23, 0.58);
      const bLeg = new THREE.Mesh(legGeo, darkSteelMat);
      bLeg.position.set(0, 0.23, -0.4);
      benchGroup.add(fLeg, bLeg);

      // Left & Right Uprights + J-cups
      const postGeo = addGeo(new THREE.BoxGeometry(0.075, 1.18, 0.075));
      const lPost = new THREE.Mesh(postGeo, darkSteelMat);
      lPost.position.set(-0.56, 0.62, -0.44);
      const rPost = new THREE.Mesh(postGeo, darkSteelMat);
      rPost.position.set(0.56, 0.62, -0.44);
      benchGroup.add(lPost, rPost);

      const cupGeo = addGeo(new THREE.BoxGeometry(0.09, 0.08, 0.12));
      const lCup = new THREE.Mesh(cupGeo, neonTrimMat);
      lCup.position.set(-0.56, 1.05, -0.4);
      const rCup = new THREE.Mesh(cupGeo, neonTrimMat);
      rCup.position.set(0.56, 1.05, -0.4);
      benchGroup.add(lCup, rCup);

      // Safety Spotter Arms
      const safeGeo = addGeo(new THREE.BoxGeometry(0.05, 0.05, 0.45));
      const lSafe = new THREE.Mesh(safeGeo, chromeMat);
      lSafe.position.set(-0.56, 0.66, -0.2);
      const rSafe = new THREE.Mesh(safeGeo, chromeMat);
      rSafe.position.set(0.56, 0.66, -0.2);
      benchGroup.add(lSafe, rSafe);
    } else if (activeStation === 'squat') {
      // Heavy-Duty Power Rack / Squat Cage
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
        rackGroup.add(post);
      });

      // Top & Bottom Crossbeams
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

      // Safety Spotter Bars
      const spotterGeo = addGeo(new THREE.CylinderGeometry(0.024, 0.024, 0.92, 12));
      spotterGeo.rotateX(Math.PI / 2);
      [-0.64, 0.64].forEach((px) => {
        const sp = new THREE.Mesh(spotterGeo, chromeMat);
        sp.position.set(px, 0.72, 0);
        rackGroup.add(sp);
      });
    } else {
      // Competition Deadlift Platform (Oak Center + Rubber Sides)
      const platGroup = new THREE.Group();
      world.add(platGroup);

      const centerOak = new THREE.Mesh(addGeo(new THREE.BoxGeometry(1.05, 0.07, 1.65)), oakMat);
      centerOak.position.set(0, 0.035, 0);
      const leftRub = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.68, 0.07, 1.65)), rubberMat);
      leftRub.position.set(-0.87, 0.035, 0);
      const rightRub = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.68, 0.07, 1.65)), rubberMat);
      rightRub.position.set(0.87, 0.035, 0);

      // Steel perimeter trim
      const trimFront = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.44, 0.075, 0.04)), neonTrimMat);
      trimFront.position.set(0, 0.038, 0.84);
      const trimBack = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.44, 0.075, 0.04)), darkSteelMat);
      trimBack.position.set(0, 0.038, -0.84);

      platGroup.add(centerOak, leftRub, rightRub, trimFront, trimBack);
    }

    // ================= BUILD 3D ARTICULATED ATHLETE =================
    const athlete = new THREE.Group();
    world.add(athlete);

    // Pelvis / Hips root
    const pelvis = new THREE.Group();
    athlete.add(pelvis);
    const pelvisMesh = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.32, 0.16, 0.2)), shortsMat);
    pelvis.add(pelvisMesh);

    // Torso (child of pelvis)
    const torso = new THREE.Group();
    torso.position.y = 0.08;
    pelvis.add(torso);

    const chestMesh = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.38, 0.48, 0.22)), suitMat);
    chestMesh.position.y = 0.26;
    torso.add(chestMesh);

    // Glowing spine/core stripe on chest
    const coreStripe = new THREE.Mesh(addGeo(new THREE.BoxGeometry(0.06, 0.34, 0.23)), neonTrimMat);
    coreStripe.position.y = 0.26;
    torso.add(coreStripe);

    // Head
    const head = new THREE.Mesh(addGeo(new THREE.SphereGeometry(0.125, 20, 20)), skinMat);
    head.position.y = 0.64;
    torso.add(head);

    // Arms (attached to shoulders on torso)
    const upperArmLen = 0.31;
    const foreArmLen = 0.29;
    const leftShoulderG = createLimbSegment(upperArmLen, 0.055, 0.048, skinMat, jointAccentMat, createdGeos);
    leftShoulderG.position.set(-0.24, 0.46, 0);
    const leftElbowG = createLimbSegment(foreArmLen, 0.046, 0.038, skinMat, jointAccentMat, createdGeos);
    leftElbowG.position.y = -upperArmLen;
    leftShoulderG.add(leftElbowG);

    const rightShoulderG = createLimbSegment(upperArmLen, 0.055, 0.048, skinMat, jointAccentMat, createdGeos);
    rightShoulderG.position.set(0.24, 0.46, 0);
    const rightElbowG = createLimbSegment(foreArmLen, 0.046, 0.038, skinMat, jointAccentMat, createdGeos);
    rightElbowG.position.y = -upperArmLen;
    rightShoulderG.add(rightElbowG);

    torso.add(leftShoulderG, rightShoulderG);

    // Legs (attached to pelvis)
    const thighLen = 0.42;
    const shinLen = 0.42;
    const leftHipG = createLimbSegment(thighLen, 0.075, 0.06, shortsMat, jointAccentMat, createdGeos);
    leftHipG.position.set(-0.11, -0.04, 0);
    const leftKneeG = createLimbSegment(shinLen, 0.058, 0.045, skinMat, jointAccentMat, createdGeos);
    leftKneeG.position.y = -thighLen;
    leftHipG.add(leftKneeG);

    const rightHipG = createLimbSegment(thighLen, 0.075, 0.06, shortsMat, jointAccentMat, createdGeos);
    rightHipG.position.set(0.11, -0.04, 0);
    const rightKneeG = createLimbSegment(shinLen, 0.058, 0.045, skinMat, jointAccentMat, createdGeos);
    rightKneeG.position.y = -thighLen;
    rightHipG.add(rightKneeG);

    pelvis.add(leftHipG, rightHipG);

    // ================= ANIMATION LOOP =================
    let frameId = 0;
    let phase = 0;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (isPlayingRef.current) {
        phase += dt * 1.95; // smooth realistic rep tempo
      }

      // rep = 0 (top/lockout) -> 1 (bottom/peak effort) -> 0
      const rep = (1 - Math.cos(phase)) * 0.5;

      if (activeStation === 'bench') {
        // Athlete lying supine on bench
        pelvis.position.set(0, 0.56, 0.24);
        pelvis.rotation.set(-Math.PI / 2, 0, 0);
        torso.rotation.set(0.05, 0, 0); // subtle powerlifting arch

        // Legs planted on floor
        leftHipG.rotation.set(Math.PI / 2 + 0.15, 0, -0.14);
        rightHipG.rotation.set(Math.PI / 2 + 0.15, 0, 0.14);
        leftKneeG.rotation.set(-1.35, 0, 0);
        rightKneeG.rotation.set(-1.35, 0, 0);

        // Barbell moves vertically from lockout (y=1.18) down to chest (y=0.78)
        const barY = 1.18 - rep * 0.4;
        const barZ = -0.18 + rep * 0.06;
        barbellGroup.position.set(0, barY, barZ);

        // Arms follow barbell press mechanics
        const shoulderAngle = Math.PI / 2 + rep * 0.85;
        const elbowAngle = -(rep * 1.55 + 0.12);
        leftShoulderG.rotation.set(shoulderAngle, 0, -0.35 - rep * 0.25);
        rightShoulderG.rotation.set(shoulderAngle, 0, 0.35 + rep * 0.25);
        leftElbowG.rotation.set(elbowAngle, 0, 0.22);
        rightElbowG.rotation.set(elbowAngle, 0, -0.22);
      } else if (activeStation === 'squat') {
        // Standing upright -> deep parallel squat
        const hipDrop = rep * 0.42;
        const hipBack = -rep * 0.16;
        pelvis.position.set(0, 0.9 - hipDrop, hipBack);
        pelvis.rotation.set(0, 0, 0);

        // Forward torso lean at bottom of squat
        const torsoLean = 0.08 + rep * 0.48;
        torso.rotation.set(torsoLean, 0, 0);

        // Hip & knee flexion
        const hipFlex = -rep * 1.28;
        const kneeFlex = rep * 1.65;
        leftHipG.rotation.set(hipFlex, 0, -0.14);
        rightHipG.rotation.set(hipFlex, 0, 0.14);
        leftKneeG.rotation.set(kneeFlex, 0, 0);
        rightKneeG.rotation.set(kneeFlex, 0, 0);

        // Arms holding bar on upper back
        leftShoulderG.rotation.set(-0.35, 0, -0.85);
        rightShoulderG.rotation.set(-0.35, 0, 0.85);
        leftElbowG.rotation.set(-1.75, 0, 0.35);
        rightElbowG.rotation.set(-1.75, 0, -0.35);

        // Barbell rests on shoulders/traps
        const barY = pelvis.position.y + Math.cos(torsoLean) * 0.48 + 0.08;
        const barZ = pelvis.position.z + Math.sin(torsoLean) * 0.48 - 0.11;
        barbellGroup.position.set(0, barY, barZ);
      } else {
        // Deadlift: floor (rep=1) -> lockout (rep=0)
        const floorBarY = plates.length > 0 ? Math.max(0.24, (PLATE_RADIUS_MAP[plates[0].weight] || 0.44) + 0.07) : 0.24;
        const lockoutBarY = 0.78;
        const barY = lockoutBarY - rep * (lockoutBarY - floorBarY);
        barbellGroup.position.set(0, barY, 0.22);

        // Hip hinge & knee bend
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

        // Arms stay straight vertical, pulling the bar
        leftShoulderG.rotation.set(-torsoLean + 0.08, 0, -0.08);
        rightShoulderG.rotation.set(-torsoLean + 0.08, 0, 0.08);
        leftElbowG.rotation.set(-0.04, 0, 0);
        rightElbowG.rotation.set(-0.04, 0, 0);
      }

      // Smooth Orbit Damping
      const st = orbitRef.current;
      st.rotY += (st.targetRotY - st.rotY) * 0.12;
      st.rotX += (st.targetRotX - st.rotX) * 0.12;
      world.rotation.y = st.rotY;
      world.rotation.x = st.rotX;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 240;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      createdTextures.forEach((t) => t.dispose());
      createdGeos.forEach((g) => g.dispose());
      createdMats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [activeStation, plates]);

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
            WebGL 3D Studio · Атлет + Тренажёр
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

        {/* Play / Pause Animation Button */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              NativeiOSBridge.haptic('light', hapticsEnabled);
              setIsPlaying((p) => !p);
            }}
            className="px-2.5 py-1 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-sky-400/30 font-mono text-[10px] font-bold text-sky-300 active:scale-90 transition-transform"
          >
            {isPlaying ? '⏸ Пауза' : '▶ Движение'}
          </button>
        </div>

        <div className="absolute bottom-2.5 left-3 text-[10px] font-mono text-slate-500 pointer-events-none">
          Крути 360° пальцем
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
