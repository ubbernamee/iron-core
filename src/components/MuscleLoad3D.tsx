import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MuscleGroupId } from '../types';
import { MUSCLE_LABELS_RU } from '../data/exerciseCatalog';
import { NativeiOSBridge } from '../engine/iosBridge';
import { subscribeAppLifecycle } from '../utils/ios-lifecycle';

interface MuscleLoad3DProps {
  todayLoad: Partial<Record<MuscleGroupId, number>>;
  weekLoad: Partial<Record<MuscleGroupId, number>>;
  hapticsEnabled: boolean;
}

const ALL_MUSCLES: MuscleGroupId[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'triceps',
  'biceps',
  'lats',
  'upper_back',
  'lower_back',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
];

export const MuscleLoad3D: React.FC<MuscleLoad3DProps> = ({
  todayLoad,
  weekLoad,
  hapticsEnabled,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<'week' | 'today'>(() =>
    Object.keys(todayLoad).length > 0 ? 'today' : 'week'
  );
  const [webglReady, setWebglReady] = useState(true);

  const activeLoad = mode === 'today' ? todayLoad : weekLoad;
  const activeLoadRef = useRef(activeLoad);
  activeLoadRef.current = activeLoad;

  const orbitRef = useRef({
    rotY: 0.45,
    targetRotY: 0.45,
    isDragging: false,
    lastX: 0,
  });

  const rankedMuscles = useMemo(() => {
    return (Object.entries(activeLoad) as [MuscleGroupId, number][])
      .filter(([, val]) => (val || 0) > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [activeLoad]);

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

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 260;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090a0c);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 1.05, 3.35);
    camera.lookAt(0, 0.96, 0);

    scene.add(new THREE.AmbientLight(0xe2e8f0, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2.5, 4.5, 3.5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xc8f550, 1.15);
    rim.position.set(-3.5, 2.5, -3.5);
    scene.add(rim);

    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];
    const addGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geos.push(g);
      return g;
    };
    const addMat = <T extends THREE.Material>(m: T): T => {
      mats.push(m);
      return m;
    };

    const baseBodyMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x1e2028,
        metalness: 0.48,
        roughness: 0.42,
        clearcoat: 0.35,
        clearcoatRoughness: 0.3,
      })
    );
    const visorMat = addMat(
      new THREE.MeshPhysicalMaterial({
        color: 0x050608,
        metalness: 0.9,
        roughness: 0.1,
        clearcoat: 1,
      })
    );

    const muscleMats: Record<MuscleGroupId, THREE.MeshStandardMaterial> = {} as Record<
      MuscleGroupId,
      THREE.MeshStandardMaterial
    >;
    ALL_MUSCLES.forEach((m) => {
      muscleMats[m] = addMat(
        new THREE.MeshStandardMaterial({
          color: 0x2a2d38,
          emissive: 0x84cc16,
          emissiveIntensity: 0,
          roughness: 0.35,
          metalness: 0.25,
        })
      );
    });

    const root = new THREE.Group();
    scene.add(root);

    // Pedestal ring
    const ring = new THREE.Mesh(
      addGeo(new THREE.RingGeometry(0.55, 0.58, 64)),
      addMat(new THREE.MeshBasicMaterial({ color: 0xc8f550, transparent: true, opacity: 0.24, side: THREE.DoubleSide }))
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    root.add(ring);

    // Base mannequin skeleton
    const addPart = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], scale?: [number, number, number], rot?: [number, number, number]) => {
      const mesh = new THREE.Mesh(addGeo(geo), mat);
      mesh.position.set(...pos);
      if (scale) mesh.scale.set(...scale);
      if (rot) mesh.rotation.set(...rot);
      root.add(mesh);
      return mesh;
    };

    // Head + Neck + Visor
    addPart(new THREE.SphereGeometry(0.105, 22, 22), baseBodyMat, [0, 1.66, 0], [0.92, 1.12, 0.98]);
    addPart(new THREE.CylinderGeometry(0.098, 0.094, 0.04, 22, 1, false, -Math.PI * 0.35, Math.PI * 0.7), visorMat, [0, 1.675, 0.014]);
    addPart(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16), baseBodyMat, [0, 1.54, 0]);

    // Torso & Pelvis core
    addPart(new THREE.CylinderGeometry(0.19, 0.145, 0.34, 24), baseBodyMat, [0, 1.32, 0], [1.1, 1, 0.66]);
    addPart(new THREE.CylinderGeometry(0.145, 0.135, 0.22, 22), baseBodyMat, [0, 1.06, 0], [1.06, 1, 0.72]);
    addPart(new THREE.CylinderGeometry(0.142, 0.13, 0.16, 22), baseBodyMat, [0, 0.89, 0], [1.12, 1, 0.74]);

    // Muscle Shells — Chest, Core, Back
    [-1, 1].forEach((s) => {
      // Chest (pecs)
      addPart(new THREE.SphereGeometry(0.088, 18, 18), muscleMats.chest, [s * 0.088, 1.36, 0.102], [1.08, 0.78, 0.44]);
      // Front, Side, Rear Delts
      addPart(new THREE.SphereGeometry(0.058, 16, 16), muscleMats.front_delts, [s * 0.215, 1.43, 0.045], [0.95, 1.05, 0.85]);
      addPart(new THREE.SphereGeometry(0.062, 16, 16), muscleMats.side_delts, [s * 0.245, 1.425, 0], [0.85, 1.1, 0.9]);
      addPart(new THREE.SphereGeometry(0.056, 16, 16), muscleMats.rear_delts, [s * 0.215, 1.43, -0.048], [0.95, 1.0, 0.85]);

      // Arms (Upper + Forearm + Hand)
      addPart(new THREE.CylinderGeometry(0.046, 0.038, 0.29, 16), baseBodyMat, [s * 0.275, 1.24, 0], undefined, [0, 0, s * 0.1]);
      addPart(new THREE.CylinderGeometry(0.036, 0.028, 0.27, 16), baseBodyMat, [s * 0.305, 0.98, 0.02], undefined, [-0.08, 0, s * 0.06]);
      addPart(new THREE.SphereGeometry(0.038, 12, 12), baseBodyMat, [s * 0.315, 0.83, 0.035]);

      // Biceps & Triceps
      addPart(new THREE.CapsuleGeometry(0.036, 0.12, 8, 12), muscleMats.biceps, [s * 0.272, 1.24, 0.028], undefined, [0, 0, s * 0.1]);
      addPart(new THREE.CapsuleGeometry(0.038, 0.13, 8, 12), muscleMats.triceps, [s * 0.276, 1.25, -0.028], undefined, [0, 0, s * 0.1]);

      // Upper Back / Traps & Lats
      addPart(new THREE.SphereGeometry(0.092, 16, 16), muscleMats.upper_back, [s * 0.075, 1.44, -0.082], [1.1, 0.72, 0.52]);
      addPart(new THREE.CapsuleGeometry(0.062, 0.16, 10, 14), muscleMats.lats, [s * 0.135, 1.26, -0.072], [0.95, 1, 0.6], [0, 0, -s * 0.18]);

      // Glutes
      addPart(new THREE.SphereGeometry(0.088, 18, 18), muscleMats.glutes, [s * 0.082, 0.86, -0.076], [1.05, 0.98, 0.72]);

      // Legs (Thigh + Shin + Foot)
      addPart(new THREE.CylinderGeometry(0.074, 0.052, 0.42, 18), baseBodyMat, [s * 0.112, 0.62, 0]);
      addPart(new THREE.CylinderGeometry(0.05, 0.035, 0.4, 16), baseBodyMat, [s * 0.112, 0.22, -0.01]);
      addPart(new THREE.CapsuleGeometry(0.04, 0.1, 8, 12), baseBodyMat, [s * 0.112, 0.035, 0.045], [1, 1, 0.7], [Math.PI / 2, 0, 0]);

      // Quads, Hamstrings, Calves
      addPart(new THREE.CapsuleGeometry(0.058, 0.21, 10, 14), muscleMats.quads, [s * 0.114, 0.63, 0.034]);
      addPart(new THREE.CapsuleGeometry(0.054, 0.2, 10, 14), muscleMats.hamstrings, [s * 0.112, 0.62, -0.036]);
      addPart(new THREE.SphereGeometry(0.054, 16, 16), muscleMats.calves, [s * 0.112, 0.29, -0.036], [0.92, 1.65, 0.92]);
    });

    // Core & Lower Back
    addPart(new THREE.CapsuleGeometry(0.062, 0.18, 10, 14), muscleMats.core, [0, 1.1, 0.085], [1.45, 1, 0.42]);
    addPart(new THREE.CapsuleGeometry(0.055, 0.16, 10, 14), muscleMats.lower_back, [0, 1.08, -0.088], [1.35, 1, 0.45]);

    const coldColor = new THREE.Color(0x282b36);
    const hotColor = new THREE.Color(0xc8f550);

    let rafId = 0;
    let isBgPaused = false;
    let isInView = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              isInView = Boolean(entries[0]?.isIntersecting);
            },
            { threshold: 0.05 }
          )
        : null;
    io?.observe(container);

    const unsub = subscribeAppLifecycle((st) => {
      isBgPaused = st === 'background' || st === 'hidden';
    });

    const animate = () => {
      if (isBgPaused || !isInView) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      const load = activeLoadRef.current;
      ALL_MUSCLES.forEach((m) => {
        const pct = Math.max(0, Math.min(100, load[m] || 0)) / 100;
        const mat = muscleMats[m];
        mat.color.copy(coldColor).lerp(hotColor, pct);
        mat.emissiveIntensity = pct > 0.05 ? pct * 0.78 : 0;
      });

      const ob = orbitRef.current;
      if (!ob.isDragging) {
        ob.targetRotY += 0.0045;
      }
      ob.rotY += (ob.targetRotY - ob.rotY) * 0.1;
      root.rotation.y = ob.rotY;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 320;
      const h = container.clientHeight || 260;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      io?.disconnect();
      unsub();
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      envRT.dispose();
      pmrem.dispose();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div className="slate-card rounded-[26px] p-4 sm:p-5 space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-sky-300 font-bold">
            3D WebGL · Нагрузка мышц
          </div>
          <h3 className="text-sm font-semibold text-slate-50 mt-0.5">Карта восстановления и объёма</h3>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl slate-well">
          {(
            [
              { id: 'today', label: 'Сегодня' },
              { id: 'week', label: '7 дней' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                NativeiOSBridge.haptic('light', hapticsEnabled);
                setMode(tab.id);
              }}
              className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold transition-colors ${
                mode === tab.id ? 'bg-sky-400 text-slate-950' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        onPointerDown={(e) => {
          orbitRef.current.isDragging = true;
          orbitRef.current.lastX = e.clientX;
        }}
        onPointerMove={(e) => {
          if (!orbitRef.current.isDragging) return;
          const dx = e.clientX - orbitRef.current.lastX;
          orbitRef.current.lastX = e.clientX;
          orbitRef.current.targetRotY += dx * 0.015;
        }}
        onPointerUp={() => {
          orbitRef.current.isDragging = false;
        }}
        onPointerLeave={() => {
          orbitRef.current.isDragging = false;
        }}
        className="relative h-64 rounded-2xl overflow-hidden slate-well cursor-grab active:cursor-grabbing touch-none"
      >
        {webglReady ? (
          <div ref={mountRef} className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs font-mono text-slate-400">
            3D WebGL недоступен
          </div>
        )}
        <div className="absolute bottom-2.5 left-3 text-[10px] font-mono text-slate-500 pointer-events-none">
          Крути 360°
        </div>
        <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 text-[9px] font-mono text-slate-400 pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-[#282b36]" />
          <span>Свежие</span>
          <span className="w-2 h-2 rounded-full bg-[#c8f550] ml-1" />
          <span>Пик</span>
        </div>
      </div>

      {rankedMuscles.length === 0 ? (
        <div className="text-center py-2 text-xs text-slate-400">
          Выполни хотя бы 1 подход, чтобы увидеть 3D-разбор нагрузки по мышцам.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {rankedMuscles.slice(0, 6).map(([muscle, pct]) => (
            <div key={muscle} className="p-2.5 rounded-xl slate-well space-y-1.5">
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="text-slate-200 font-medium truncate">{MUSCLE_LABELS_RU[muscle] || muscle}</span>
                <span className="font-mono tabular text-sky-300 font-bold shrink-0">{pct}%</span>
              </div>
              <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  style={{ width: `${pct}%`, backgroundColor: '#c8f550' }}
                  className="h-full rounded-full transition-all duration-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
