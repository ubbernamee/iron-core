import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { calculatePlatesPerSide } from '../engine/math';
import { AnimatedNumber } from './AnimatedNumber';

interface Barbell3DVisualizerProps {
  targetWeight: number;
  barbellWeight?: number;
  title: string;
  hapticsEnabled: boolean;
}

export const Barbell3DVisualizer: React.FC<Barbell3DVisualizerProps> = ({
  targetWeight,
  barbellWeight = 20,
  title,
  hapticsEnabled,
}) => {
  const [animSeed, setAnimSeed] = useState(0);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 0 });
  const cardRef = useRef<HTMLDivElement | null>(null);

  const { plates, perSideKg } = useMemo(
    () => calculatePlatesPerSide(targetWeight, barbellWeight),
    [targetWeight, barbellWeight]
  );

  useEffect(() => {
    setAnimSeed((s) => s + 1);
  }, [targetWeight, title]);

  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      if (typeof e.gamma === 'number' && typeof e.beta === 'number') {
        const ry = Math.max(-8, Math.min(8, e.gamma * 0.25));
        const rx = Math.max(-6, Math.min(6, (e.beta - 45) * 0.18));
        setTilt({ rx: -rx, ry, gx: ry * 4 });
      }
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Number((-ny * 10).toFixed(2)),
      ry: Number((nx * 12).toFixed(2)),
      gx: Number((nx * 60).toFixed(1)),
    });
  };

  const handlePointerLeave = () => {
    setTilt({ rx: 0, ry: 0, gx: 0 });
  };

  const handleReplayLoad = () => {
    NativeiOSBridge.haptic('medium', hapticsEnabled);
    setAnimSeed((s) => s + 1);
  };

  return (
    <div
      ref={cardRef}
      onClick={handleReplayLoad}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        transition: tilt.rx === 0 && tilt.ry === 0 ? 'transform 0.45s var(--spring-ios)' : 'transform 0.08s linear',
      }}
      className="slate-card slate-card-active rounded-[26px] p-4 relative overflow-hidden cursor-pointer select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-sky-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
            3D Barbell · IPF Loader
          </div>
          <div className="text-sm font-semibold text-slate-50 mt-1 leading-snug truncate">{title}</div>
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

      <div className="relative h-36 slate-well rounded-2xl flex items-center justify-center overflow-hidden px-3 my-2">
        <div
          style={{ transform: `translateX(${tilt.gx}px)` }}
          className="absolute -top-6 w-48 h-24 bg-sky-300/[0.09] blur-2xl rounded-full transition-transform duration-200 pointer-events-none"
        />
        <div className="absolute bottom-2 inset-x-12 h-3 bg-sky-400/12 blur-xl rounded-full pointer-events-none" />

        <div className="relative flex items-center">
          <div className="w-14 h-2.5 bg-gradient-to-b from-slate-100 via-slate-400 to-slate-700 rounded-l-sm shadow-md relative overflow-hidden">
            <div className="absolute inset-y-0 left-2 right-2 opacity-35 bg-[repeating-linear-gradient(90deg,#000,#000_1px,transparent_1px,transparent_3px)]" />
            <div className="absolute inset-y-0 w-4 bg-white/60 chrome-sheen" />
          </div>

          <div className="w-3 h-9 bg-gradient-to-b from-slate-50 via-slate-300 to-slate-600 rounded-[2px] shadow-lg z-10" />

          <div key={`${targetWeight}-${animSeed}`} className="relative flex items-center gap-[3px] pl-1 pr-9 min-w-[214px] h-28">
            <div className="absolute left-0 right-2 h-4 bg-gradient-to-b from-slate-100 via-slate-400 to-slate-700 rounded-r-md shadow-inner z-0 overflow-hidden">
              <div className="absolute inset-y-0 w-6 bg-white/45 chrome-sheen" />
            </div>

            {plates.length === 0 ? (
              <span className="relative z-10 ml-4 px-3 py-1 rounded-lg bg-slate-950/90 border border-slate-700/60 font-mono text-[11px] text-slate-300">
                Пустой гриф · {barbellWeight} кг
              </span>
            ) : (
              plates.map((plate, index) => (
                <div
                  key={`${plate.weight}-${index}`}
                  style={{
                    height: `${plate.height}px`,
                    width: `${plate.width + 5}px`,
                    background: `linear-gradient(180deg, ${plate.color} 0%, ${plate.edge} 100%)`,
                    animationDelay: `${index * 60}ms`,
                  }}
                  className="animate-plate-load relative z-10 rounded-[3px] flex items-center justify-center shadow-[4px_6px_16px_rgba(0,0,0,0.9)]"
                >
                  <div className="absolute inset-y-0 right-0 w-[3px] bg-black/35 rounded-r-[2px]" />
                  <div className="absolute inset-x-0 top-0 h-[24%] bg-white/35 rounded-t-[2px]" />
                  <span
                    style={{ color: plate.weight === 5 || plate.weight === 1.25 ? '#0F172A' : '#FFFFFF' }}
                    className="font-mono text-[9px] font-extrabold -rotate-90 select-none z-10"
                  >
                    {plate.label}
                  </span>
                </div>
              ))
            )}

            {plates.length > 0 && (
              <div
                style={{ animationDelay: `${plates.length * 60 + 35}ms` }}
                className="animate-collar-load relative z-10 w-3.5 h-7 bg-gradient-to-b from-slate-50 via-slate-300 to-slate-600 rounded-[2px] ml-1 shadow-lg"
                title="Замок IPF"
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 text-xs">
        <span className="text-slate-400">Сборка стороны (тап — повторить):</span>
        <span className="font-mono tabular font-semibold text-slate-100">
          {plates.length === 0 ? 'Только гриф (20 кг)' : plates.map((p) => `[${p.label}]`).join(' + ')}
        </span>
      </div>
    </div>
  );
};
