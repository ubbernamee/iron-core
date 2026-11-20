import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { NativeiOSBridge } from '../engine/iosBridge';
import { calculatePlatesPerSide } from '../engine/math';
import { PlateSpec } from '../types';
import { AnimatedNumber } from './AnimatedNumber';

interface BarbellWebGL3DProps {
  targetWeight: number;
  barbellWeight?: number;
  title: string;
  hapticsEnabled: boolean;
  soundEnabled?: boolean;
  compact?: boolean;
}

const PLATE_RADIUS_MAP: Record<number, number> = {
  25: 1.48,
  20: 1.44,
  15: 1.24,
  10: 1.06,
  5: 0.86,
  2.5: 0.68,
  1.25: 0.56,
};

const PLATE_THICKNESS_MAP: Record<number, number> = {
  25: 0.21,
  20: 0.19,
  15: 0.17,
  10: 0.15,
  5: 0.12,
  2.5: 0.1,
  1.25: 0.085,
};

function createPlateLabelTexture(label: string, bgColor: string, lightText: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 256, 256);

  // Outer rim & inner hub ring
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
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
  ctx.font = '800 32px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label}`, 128, 44);
  ctx.fillText('KG', 128, 212);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const BarbellWebGL3D: React.FC<BarbellWebGL3DProps> = ({
  targetWeight,
  barbellWeight = 20,
  title,
  hapticsEnabled,
  soundEnabled = true,
  compact = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglReady, setWebglReady] = useState<boolean>(true);
  const [stepCount, setStepCount] = useState<number | null>(null); // null = show all plates
  const [cameraPreset, setCameraPreset] = useState<'quarter' | 'side' | 'front'>('quarter');
  const [animNonce, setAnimNonce] = useState<number>(0);

  const { plates, perSideKg } = useMemo(
    () => calculatePlatesPerSide(targetWeight, barbellWeight),
    [targetWeight, barbellWeight]
  );

  // Reset step-by-step loader whenever target weight changes
  useEffect(() => {
    setStepCount(null);
    setAnimNonce((n) => n + 1);
  }, [targetWeight, title]);

  const visiblePlates = useMemo(() => {
    if (stepCount === null) return plates;
    return plates.slice(0, Math.max(0, Math.min(plates.length, stepCount)));
  }, [plates, stepCount]);

  // Mutable refs for Three.js animation loop
  const sceneStateRef = useRef({
    rotY: -0.42,
    rotX: 0.24,
    targetRotY: -0.42,
    targetRotX: 0.24,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    animStartTime: performance.now(),
    soundPlayedCount: 0,
  });

  useEffect(() => {
    if (cameraPreset === 'quarter') {
      sceneStateRef.current.targetRotY = -0.42;
      sceneStateRef.current.targetRotX = 0.24;
    } else if (cameraPreset === 'side') {
      sceneStateRef.current.targetRotY = -1.36;
      sceneStateRef.current.targetRotX = 0.12;
    } else {
      sceneStateRef.current.targetRotY = 0.0;
      sceneStateRef.current.targetRotX = 0.16;
    }
  }, [cameraPreset]);

  // Build & animate WebGL scene
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

    const width = container.clientWidth || 340;
    const height = container.clientHeight || 200;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 0.35, 6.4);
    camera.lookAt(0, 0, 0);

    // Studio Lighting (Cool Cobalt Key + Warm Rim + Ambient)
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.85);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    const bottomFill = new THREE.DirectionalLight(0x34d399, 0.55);
    bottomFill.position.set(0, -4, 3);
    scene.add(bottomFill);

    // Root Barbell Assembly Group
    const assembly = new THREE.Group();
    scene.add(assembly);

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.88,
      roughness: 0.22,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.82,
      roughness: 0.34,
    });

    // Center Knurled Shaft
    const shaftGeo = new THREE.CylinderGeometry(0.11, 0.11, 3.2, 24);
    shaftGeo.rotateZ(Math.PI / 2);
    const shaftMesh = new THREE.Mesh(shaftGeo, darkSteelMat);
    assembly.add(shaftMesh);

    // Left & Right Inner Collars (Shoulders)
    const shoulderGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 28);
    shoulderGeo.rotateZ(Math.PI / 2);
    const leftShoulder = new THREE.Mesh(shoulderGeo, chromeMat);
    leftShoulder.position.x = -1.65;
    const rightShoulder = new THREE.Mesh(shoulderGeo, chromeMat);
    rightShoulder.position.x = 1.65;
    assembly.add(leftShoulder, rightShoulder);

    // Left & Right Loading Sleeves
    const sleeveGeo = new THREE.CylinderGeometry(0.165, 0.165, 1.85, 28);
    sleeveGeo.rotateZ(Math.PI / 2);
    const leftSleeve = new THREE.Mesh(sleeveGeo, chromeMat);
    leftSleeve.position.x = -2.62;
    const rightSleeve = new THREE.Mesh(sleeveGeo, chromeMat);
    rightSleeve.position.x = 2.62;
    assembly.add(leftSleeve, rightSleeve);

    // Subtle Studio Floor Grid Disc beneath Barbell
    const ringGeo = new THREE.RingGeometry(2.1, 2.13, 64);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
    });
    const floorRing = new THREE.Mesh(ringGeo, ringMat);
    floorRing.position.y = -1.62;
    assembly.add(floorRing);

    // Build Animated Plate Pairs (Left + Right symmetrical)
    interface AnimatedPlateObj {
      leftMesh: THREE.Group;
      rightMesh: THREE.Group;
      targetX: number;
      startX: number;
      delayMs: number;
      weight: number;
      clanked: boolean;
    }

    const animatedPlates: AnimatedPlateObj[] = [];
    const createdTextures: THREE.Texture[] = [];
    const createdGeos: THREE.BufferGeometry[] = [];
    const createdMats: THREE.Material[] = [];
    createdGeos.push(shaftGeo, shoulderGeo, sleeveGeo, ringGeo);
    createdMats.push(chromeMat, darkSteelMat, ringMat);

    let cursorX = 1.74;
    visiblePlates.forEach((plate: PlateSpec, idx: number) => {
      const radius = PLATE_RADIUS_MAP[plate.weight] || 1.0;
      const thickness = PLATE_THICKNESS_MAP[plate.weight] || 0.14;
      const lightText = plate.weight !== 5 && plate.weight !== 1.25;

      const faceTex = createPlateLabelTexture(plate.label, plate.color, lightText);
      createdTextures.push(faceTex);

      const rimMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(plate.edge),
        metalness: 0.25,
        roughness: 0.45,
      });
      const faceMat = new THREE.MeshStandardMaterial({
        map: faceTex,
        metalness: 0.18,
        roughness: 0.42,
      });
      createdMats.push(rimMat, faceMat);

      const discGeo = new THREE.CylinderGeometry(radius, radius, thickness, 36);
      discGeo.rotateZ(Math.PI / 2);
      const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, thickness + 0.025, 24);
      hubGeo.rotateZ(Math.PI / 2);
      createdGeos.push(discGeo, hubGeo);

      const makeSidePlate = () => {
        const g = new THREE.Group();
        const disc = new THREE.Mesh(discGeo, [rimMat, faceMat, faceMat]);
        const hub = new THREE.Mesh(hubGeo, darkSteelMat);
        g.add(disc, hub);
        return g;
      };

      const targetX = cursorX + thickness / 2;
      const startX = targetX + 1.55;

      const rightGroup = makeSidePlate();
      rightGroup.position.x = startX;
      const leftGroup = makeSidePlate();
      leftGroup.position.x = -startX;

      assembly.add(rightGroup, leftGroup);
      animatedPlates.push({
        leftMesh: leftGroup,
        rightMesh: rightGroup,
        targetX,
        startX,
        delayMs: idx * 85,
        weight: plate.weight,
        clanked: false,
      });

      cursorX += thickness + 0.022;
    });

    // IPF Locking Collars at the end of loaded plates
    let rightCollar: THREE.Group | null = null;
    let leftCollar: THREE.Group | null = null;
    const collarTargetX = cursorX + 0.09;
    const collarStartX = collarTargetX + 1.4;
    const collarDelayMs = visiblePlates.length * 85 + 60;

    if (visiblePlates.length > 0) {
      const collarBodyGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.16, 24);
      collarBodyGeo.rotateZ(Math.PI / 2);
      const leverGeo = new THREE.BoxGeometry(0.08, 0.34, 0.08);
      createdGeos.push(collarBodyGeo, leverGeo);

      const collarMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.65,
        roughness: 0.25,
      });
      createdMats.push(collarMat);

      const makeCollar = () => {
        const cg = new THREE.Group();
        const body = new THREE.Mesh(collarBodyGeo, collarMat);
        const lever = new THREE.Mesh(leverGeo, chromeMat);
        lever.position.y = 0.24;
        cg.add(body, lever);
        return cg;
      };

      rightCollar = makeCollar();
      rightCollar.position.x = collarStartX;
      leftCollar = makeCollar();
      leftCollar.position.x = -collarStartX;
      assembly.add(rightCollar, leftCollar);
    }

    sceneStateRef.current.animStartTime = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const st = sceneStateRef.current;
      const elapsed = now - st.animStartTime;

      // Animate sequential plate slide-on with elastic settle
      animatedPlates.forEach((ap) => {
        const localT = Math.max(0, Math.min(1, (elapsed - ap.delayMs) / 340));
        // Spring ease-out
        const eased =
          localT === 1
            ? 1
            : 1 - Math.pow(2, -10 * localT) * Math.cos((localT * 10 - 0.75) * ((2 * Math.PI) / 3));
        const currX = ap.startX + (ap.targetX - ap.startX) * eased;
        ap.rightMesh.position.x = currX;
        ap.leftMesh.position.x = -currX;

        if (localT >= 0.88 && !ap.clanked) {
          ap.clanked = true;
          const pitch = ap.weight >= 20 ? 0.85 : ap.weight >= 10 ? 1.05 : 1.3;
          NativeiOSBridge.playPlateClank(soundEnabled, pitch);
        }
      });

      if (rightCollar && leftCollar) {
        const cT = Math.max(0, Math.min(1, (elapsed - collarDelayMs) / 280));
        const cEase = 1 - Math.pow(1 - cT, 3);
        const cx = collarStartX + (collarTargetX - collarStartX) * cEase;
        rightCollar.position.x = cx;
        leftCollar.position.x = -cx;
      }

      // Smooth orbit damping + subtle idle breathing float
      st.rotY += (st.targetRotY - st.rotY) * 0.12;
      st.rotX += (st.targetRotX - st.rotX) * 0.12;
      assembly.rotation.y = st.rotY + Math.sin(now * 0.0012) * 0.035;
      assembly.rotation.x = st.rotX;
      assembly.position.y = Math.sin(now * 0.002) * 0.03;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 340;
      const h = container.clientHeight || 200;
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
  }, [visiblePlates, animNonce, soundEnabled]);

  const handlePointerDown = (e: React.PointerEvent) => {
    sceneStateRef.current.isDragging = true;
    sceneStateRef.current.lastX = e.clientX;
    sceneStateRef.current.lastY = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!sceneStateRef.current.isDragging) return;
    const dx = e.clientX - sceneStateRef.current.lastX;
    const dy = e.clientY - sceneStateRef.current.lastY;
    sceneStateRef.current.lastX = e.clientX;
    sceneStateRef.current.lastY = e.clientY;
    sceneStateRef.current.targetRotY = Math.max(-1.6, Math.min(1.6, sceneStateRef.current.targetRotY + dx * 0.012));
    sceneStateRef.current.targetRotX = Math.max(-0.55, Math.min(0.75, sceneStateRef.current.targetRotX + dy * 0.01));
  };

  const handlePointerUp = () => {
    sceneStateRef.current.isDragging = false;
  };

  const handleStepNextPlate = (e: React.MouseEvent) => {
    e.stopPropagation();
    NativeiOSBridge.haptic('medium', hapticsEnabled);
    setStepCount((prev) => {
      if (prev === null) return plates.length > 0 ? 1 : 0;
      if (prev >= plates.length) return null;
      return prev + 1;
    });
    setAnimNonce((n) => n + 1);
  };

  const handleReplayFull = () => {
    NativeiOSBridge.haptic('medium', hapticsEnabled);
    setStepCount(null);
    setAnimNonce((n) => n + 1);
  };

  return (
    <div className="slate-card slate-card-active rounded-[26px] p-4 relative overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            WebGL 3D · IPF Barbell Lab
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

      {/* Interactive 3D Viewport */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className={`relative ${
          compact ? 'h-44' : 'h-48'
        } slate-well rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing touch-none`}
      >
        {webglReady ? (
          <div ref={mountRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 font-mono">
            3D WebGL недоступен · Сборка: {plates.map((p) => p.label).join(' + ') || 'Пустой гриф'}
          </div>
        )}

        {/* Camera Angle Switcher Overlay */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1 bg-slate-950/75 backdrop-blur-md border border-slate-400/15 rounded-xl p-1">
          {(
            [
              { id: 'quarter', label: '3D' },
              { id: 'side', label: 'Торец' },
              { id: 'front', label: 'Фронт' },
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

        {/* Step-by-Step Plate Loader & Replay Controls */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
          {plates.length > 0 && (
            <button
              onClick={handleStepNextPlate}
              className="px-2.5 py-1 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-sky-400/30 font-mono text-[10px] font-bold text-sky-300 active:scale-90 transition-transform"
            >
              {stepCount === null
                ? 'По шагам'
                : stepCount < plates.length
                ? `+ Блин (${stepCount}/${plates.length})`
                : 'Все блины ✓'}
            </button>
          )}
          <button
            onClick={handleReplayFull}
            className="px-2.5 py-1 rounded-xl bg-slate-950/85 hover:bg-slate-900 border border-slate-400/15 font-mono text-[10px] text-slate-200 active:scale-90 transition-transform"
            title="Повторить сборку"
          >
            ↻
          </button>
        </div>

        <div className="absolute bottom-2.5 left-3 text-[10px] font-mono text-slate-500 pointer-events-none">
          Крути пальцем
        </div>
      </div>

      {/* Bottom Plate Breakdown Strip */}
      <div className="flex items-center justify-between pt-2.5 text-xs gap-2">
        <span className="text-slate-400 shrink-0">На сторону:</span>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {visiblePlates.length === 0 ? (
            <span className="font-mono text-slate-300">Только гриф ({barbellWeight} кг)</span>
          ) : (
            visiblePlates.map((p, idx) => (
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
