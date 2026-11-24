import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { ExerciseConfig, WorkoutSessionRecord } from '../types';
import { ShareIcon } from './Icons';

interface AthleteRankCardProps {
  athleteName: string;
  gender: 'male' | 'female';
  bodyweight: number;
  sbdTotal: number;
  dotsScore: number;
  exercises: ExerciseConfig[];
  sessions: WorkoutSessionRecord[];
  hapticsEnabled: boolean;
  soundEnabled: boolean;
  onToast?: (msg: string) => void;
}

interface RankTier {
  name: string;
  code: string;
  minDots: number;
  nextDots: number;
  accent: string;
}

const RANK_TIERS: RankTier[] = [
  { name: 'IRON', code: 'TIER I', minDots: 0, nextDots: 200, accent: '#94A3B8' },
  { name: 'STEEL', code: 'TIER II', minDots: 200, nextDots: 260, accent: '#CBD5E1' },
  { name: 'CARBON', code: 'TIER III', minDots: 260, nextDots: 320, accent: '#C8F550' },
  { name: 'TITANIUM', code: 'TIER IV', minDots: 320, nextDots: 390, accent: '#D9F99D' },
  { name: 'APEX', code: 'TIER V', minDots: 390, nextDots: 500, accent: '#C8F550' },
];

function getRankTier(dots: number): RankTier {
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (dots >= RANK_TIERS[i].minDots) return RANK_TIERS[i];
  }
  return RANK_TIERS[0];
}

function getDotsPercentile(dots: number): number {
  if (dots <= 0) return 5;
  // Smooth logistic curve approximating lifter percentile
  const z = (dots - 265) / 52;
  const pct = Math.round((1 / (1 + Math.exp(-z))) * 99);
  return Math.max(5, Math.min(99, pct));
}

export const AthleteRankCard: React.FC<AthleteRankCardProps> = ({
  athleteName,
  gender,
  bodyweight,
  sbdTotal,
  dotsScore,
  exercises,
  sessions,
  hapticsEnabled,
  soundEnabled,
  onToast,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const gyroHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, gx: 50, gy: 50 });
  const [gyroActive, setGyroActive] = useState(false);
  const [needsGyroPermission, setNeedsGyroPermission] = useState(false);

  const tier = useMemo(() => getRankTier(dotsScore), [dotsScore]);
  const percentile = useMemo(() => getDotsPercentile(dotsScore), [dotsScore]);

  // 5-axis radar values (0..100)
  const radarMetrics = useMemo(() => {
    const bw = Math.max(45, bodyweight || 78);
    const bench = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;
    const squat = exercises.find((e) => e.id === 'squat')?.oneRepMax || 0;
    const deadlift = exercises.find((e) => e.id === 'deadlift')?.oneRepMax || 0;

    const scale = gender === 'female' ? 0.72 : 1.0;
    const benchScore = Math.min(100, Math.round((bench / (bw * 1.5 * scale)) * 100));
    const squatScore = Math.min(100, Math.round((squat / (bw * 2.0 * scale)) * 100));
    const deadScore = Math.min(100, Math.round((deadlift / (bw * 2.35 * scale)) * 100));

    const cutoff30 = new Date();
    cutoff30.setDate(cutoff30.getDate() - 30);
    const cutKey = cutoff30.toISOString().slice(0, 10);
    const recent = sessions.filter((s) => s.date >= cutKey);
    const totalVol = recent.reduce((acc, s) => acc + (s.tonnageKg || 0), 0);
    const volumeScore = Math.min(100, Math.max(18, Math.round((totalVol / 45000) * 100)));
    const uniqueDays = new Set(recent.map((s) => s.date)).size;
    const consistencyScore = Math.min(100, Math.max(15, Math.round((uniqueDays / 12) * 100)));

    return [
      { label: 'Жим', val: Math.max(15, benchScore) },
      { label: 'Присед', val: Math.max(15, squatScore) },
      { label: 'Тяга', val: Math.max(15, deadScore) },
      { label: 'Объём', val: volumeScore },
      { label: 'Ритм', val: consistencyScore },
    ];
  }, [exercises, bodyweight, gender, sessions]);

  // Bind iPhone gyroscope if available
  useEffect(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DOE.requestPermission === 'function') {
      setNeedsGyroPermission(true);
      return;
    }

    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      setGyroActive(true);
      const ry = Math.max(-14, Math.min(14, (e.gamma || 0) * 0.45));
      const rx = Math.max(-14, Math.min(14, ((e.beta || 45) - 45) * 0.35));
      const gx = Math.max(5, Math.min(95, 50 + ry * 3.1));
      const gy = Math.max(5, Math.min(95, 50 + rx * 3.1));
      setTilt({ rx: -rx, ry, gx, gy });
    };
    gyroHandlerRef.current = onOrient;
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      if (gyroHandlerRef.current) {
        window.removeEventListener('deviceorientation', gyroHandlerRef.current, true);
        gyroHandlerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (gyroHandlerRef.current) {
        window.removeEventListener('deviceorientation', gyroHandlerRef.current, true);
        gyroHandlerRef.current = null;
      }
    };
  }, []);

  const handleEnableGyro = async () => {
    NativeiOSBridge.haptic('light', hapticsEnabled);
    NativeiOSBridge.playTick(soundEnabled);
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>;
      };
      if (typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res === 'granted') {
          setNeedsGyroPermission(false);
          setGyroActive(true);
          const onOrient = (e: DeviceOrientationEvent) => {
            if (e.beta === null || e.gamma === null) return;
            const ry = Math.max(-14, Math.min(14, (e.gamma || 0) * 0.45));
            const rx = Math.max(-14, Math.min(14, ((e.beta || 45) - 45) * 0.35));
            const gx = Math.max(5, Math.min(95, 50 + ry * 3.1));
            const gy = Math.max(5, Math.min(95, 50 + rx * 3.1));
            setTilt({ rx: -rx, ry, gx, gy });
          };
          if (gyroHandlerRef.current) window.removeEventListener('deviceorientation', gyroHandlerRef.current, true);
          gyroHandlerRef.current = onOrient;
          window.addEventListener('deviceorientation', onOrient, true);
          onToast?.('Гироскоп карты включён ✓');
        }
      }
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gyroActive) return;
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({
      rx: (0.5 - py) * 14,
      ry: (px - 0.5) * 16,
      gx: Math.round(px * 100),
      gy: Math.round(py * 100),
    });
  };

  const handlePointerLeave = () => {
    if (gyroActive) return;
    setTilt({ rx: 0, ry: 0, gx: 50, gy: 50 });
  };

  // Radar SVG geometry
  const cx = 74;
  const cy = 74;
  const maxR = 46;
  const polygonPoints = radarMetrics
    .map((m, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
      const r = (m.val / 100) * maxR;
      return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
    })
    .join(' ');

  const handleExportCardPng = async () => {
    NativeiOSBridge.haptic('medium', hapticsEnabled);
    NativeiOSBridge.playPrPulse(soundEnabled);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 680;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Matte Carbon metallic gradient
      const bg = ctx.createLinearGradient(0, 0, 1080, 680);
      bg.addColorStop(0, '#14161c');
      bg.addColorStop(0.5, '#0b0c10');
      bg.addColorStop(1, '#15181d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1080, 680);

      // Diagonal Volt Lime holographic sheen
      const sheen = ctx.createRadialGradient(820, 140, 30, 820, 140, 560);
      sheen.addColorStop(0, 'rgba(200, 245, 80, 0.22)');
      sheen.addColorStop(0.55, 'rgba(200, 245, 80, 0.04)');
      sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, 1080, 680);

      // Card outer frame
      ctx.strokeStyle = 'rgba(200, 245, 80, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(28, 28, 1024, 624, 38);
      ctx.stroke();

      // Header
      ctx.fillStyle = '#C8F550';
      ctx.font = '800 24px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(`IRON CORE // ${tier.code}`, 72, 92);

      ctx.fillStyle = '#848792';
      ctx.font = '600 22px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`TOP ${100 - percentile}% LIFTERS`, 1008, 92);
      ctx.textAlign = 'left';

      // Athlete Name & Rank
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText((athleteName || 'Атлет').slice(0, 20), 72, 174);

      ctx.fillStyle = '#C8F550';
      ctx.font = '800 32px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(`RANK: ${tier.name}`, 72, 224);

      // Stats
      const drawStat = (x: number, y: number, label: string, val: string) => {
        ctx.fillStyle = '#848792';
        ctx.font = '700 18px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText(label, x, y);
        ctx.fillStyle = '#F7F7F9';
        ctx.font = '800 40px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillText(val, x, y + 46);
      };
      drawStat(72, 310, 'DOTS SCORE', dotsScore.toFixed(1));
      drawStat(310, 310, 'SBD TOTAL', `${sbdTotal} КГ`);
      drawStat(72, 435, 'ВЕС ТЕЛА', `${bodyweight} КГ`);
      drawStat(310, 435, 'ПРОЦЕНТИЛЬ', `${percentile}%`);

      // Draw 5-axis Radar on the right
      const rCx = 810;
      const rCy = 355;
      const rMax = 155;
      [0.33, 0.66, 1].forEach((lvl) => {
        ctx.beginPath();
        radarMetrics.forEach((_, i) => {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
          const x = rCx + Math.cos(a) * rMax * lvl;
          const y = rCy + Math.sin(a) * rMax * lvl;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });

      ctx.beginPath();
      radarMetrics.forEach((m, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
        const x = rCx + Math.cos(a) * rMax * (m.val / 100);
        const y = rCy + Math.sin(a) * rMax * (m.val / 100);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(200, 245, 80, 0.24)';
      ctx.fill();
      ctx.strokeStyle = '#C8F550';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#D4D4D8';
      ctx.font = '700 20px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      radarMetrics.forEach((m, i) => {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
        const lx = rCx + Math.cos(a) * (rMax + 34);
        const ly = rCy + Math.sin(a) * (rMax + 34) + 7;
        ctx.fillText(m.label.toUpperCase(), lx, ly);
      });
      ctx.textAlign = 'left';

      // Footer
      ctx.fillStyle = '#6B7280';
      ctx.font = '600 18px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText('iron-core-sandy.vercel.app · ATHLETE PASS', 72, 608);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const file = new File([blob], `ironcore_rank_${tier.name.toLowerCase()}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `IRON CORE · ${tier.name} Rank` });
          onToast?.('Карта атлета отправлена ✓');
          return;
        } catch {}
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      onToast?.('PNG-карта атлета сохранена ✓');
    } catch {}
  };

  return (
    <div style={{ perspective: '900px' }}>
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{
          transform: `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
          transition: gyroActive ? 'transform 0.08s linear' : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
          background:
            'linear-gradient(145deg, #1a1c22 0%, #0e0f13 52%, #171920 100%)',
        }}
        className="relative rounded-[26px] p-4 sm:p-5 border border-white/[0.11] overflow-hidden shadow-2xl select-none will-change-transform"
      >
        {/* Dynamic Holographic Metallic Sheen */}
        <div
          aria-hidden="true"
          style={{
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, rgba(200, 245, 80, 0.24) 0%, rgba(255, 255, 255, 0.06) 28%, transparent 64%)`,
          }}
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        />

        {/* Top Row: Brand, Tier & Gyro/Share Controls */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-sky-400/15 border border-sky-400/35 font-mono text-[10px] font-extrabold text-sky-300 tracking-widest">
                {tier.name}
              </span>
              <span className="font-mono text-[10px] text-slate-400">{tier.code} · TOP {100 - percentile}%</span>
            </div>
            <div className="text-base font-extrabold text-slate-50 tracking-tight mt-1">
              {athleteName || 'Атлет'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {needsGyroPermission && !gyroActive && (
              <button
                onClick={() => void handleEnableGyro()}
                className="px-2.5 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 font-mono text-[10px] font-bold text-slate-200 active:scale-90 transition-transform"
                title="Включить гироскоп iPhone"
              >
                3D-блик
              </button>
            )}
            <button
              onClick={() => void handleExportCardPng()}
              className="w-8 h-8 rounded-xl bg-sky-400 text-slate-950 flex items-center justify-center active:scale-90 transition-transform"
              title="Экспорт карты в PNG для Telegram"
            >
              <ShareIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Middle Row: Key Metrics + 5-Axis SVG Radar */}
        <div className="relative z-10 mt-3 grid grid-cols-12 items-center gap-2">
          <div className="col-span-6 space-y-2.5">
            <div>
              <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">DOTS Score</div>
              <div className="font-mono tabular text-2xl font-extrabold text-sky-300 leading-none mt-0.5">
                {dotsScore.toFixed(1)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
              <div>
                <div className="text-[9px] font-mono uppercase text-slate-500">SBD</div>
                <div className="font-mono tabular text-xs font-bold text-slate-100 mt-0.5">{sbdTotal} кг</div>
              </div>
              <div>
                <div className="text-[9px] font-mono uppercase text-slate-500">Процентиль</div>
                <div className="font-mono tabular text-xs font-bold text-slate-100 mt-0.5">{percentile}%</div>
              </div>
            </div>
          </div>

          <div className="col-span-6 flex items-center justify-end">
            <svg viewBox="0 0 148 148" className="w-36 h-36 overflow-visible">
              {[0.33, 0.66, 1].map((lvl) => {
                const ringPts = radarMetrics
                  .map((_, i) => {
                    const a = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
                    return `${(cx + Math.cos(a) * maxR * lvl).toFixed(1)},${(cy + Math.sin(a) * maxR * lvl).toFixed(1)}`;
                  })
                  .join(' ');
                return (
                  <polygon
                    key={lvl}
                    points={ringPts}
                    fill="none"
                    stroke="rgba(255,255,255,0.09)"
                    strokeWidth="1"
                  />
                );
              })}
              <polygon
                points={polygonPoints}
                fill="rgba(200, 245, 80, 0.22)"
                stroke="#C8F550"
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              {radarMetrics.map((m, i) => {
                const a = -Math.PI / 2 + (i * Math.PI * 2) / radarMetrics.length;
                const lx = cx + Math.cos(a) * (maxR + 16);
                const ly = cy + Math.sin(a) * (maxR + 16) + 3;
                return (
                  <text
                    key={m.label}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    fill="#9CA3AF"
                    fontSize="8.5"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="700"
                  >
                    {m.label}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
