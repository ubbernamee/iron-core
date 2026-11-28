import React from 'react';
import { useRestTimer } from '../hooks/useRestTimerStore';
import { WorkoutSessionRecord } from '../types';

export const Sparkline1RM = React.memo(function Sparkline1RM({
  history,
  currentWeight,
  id,
}: {
  history?: { date: string; weight: number }[];
  currentWeight: number;
  id: string;
}) {
  const pts = (history && history.length > 0 ? history : [{ date: '', weight: currentWeight }]).slice(-12);
  const weights = pts.map((p) => p.weight);
  const first = weights[0] ?? currentWeight;
  const last = weights[weights.length - 1] ?? currentWeight;
  const delta = Number((last - first).toFixed(1));
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const span = Math.max(1, maxW - minW);

  const width = 220;
  const height = 34;
  const padX = 4;
  const padY = 5;

  const coords =
    pts.length === 1
      ? [
          { x: padX, y: height / 2 },
          { x: width - padX, y: height / 2 },
        ]
      : pts.map((p, idx) => {
          const x = padX + (idx / (pts.length - 1)) * (width - padX * 2);
          const y = height - padY - ((p.weight - minW) / span) * (height - padY * 2);
          return { x, y };
        });

  const linePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `M ${coords[0].x.toFixed(1)} ${height} L ${coords
    .map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' L ')} L ${coords[coords.length - 1].x.toFixed(1)} ${height} Z`;
  const lastPt = coords[coords.length - 1];
  const gradId = `spark-grad-${id}`;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-white/[0.045] flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ic-accent, #c8f550)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--ic-accent, #c8f550)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <polyline
            fill="none"
            stroke="var(--ic-accent, #c8f550)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={linePoints}
          />
          <circle cx={lastPt.x} cy={lastPt.y} r="3" fill="var(--ic-accent, #c8f550)" />
        </svg>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`font-mono tabular text-[11px] font-bold ${
            delta > 0 ? 'text-sky-300' : delta < 0 ? 'text-rose-300' : 'text-slate-400'
          }`}
        >
          {pts.length > 1 ? `${delta > 0 ? '+' : ''}${delta} кг` : 'База'}
        </div>
        <div className="font-mono text-[9px] text-slate-500">
          {pts.length > 1 ? `${pts.length} зам.` : '1 запись'}
        </div>
      </div>
    </div>
  );
});

export const StreakHeatmap = React.memo(function StreakHeatmap({
  sessions,
  onSelectDate,
}: {
  sessions: WorkoutSessionRecord[];
  onSelectDate?: (dateKey: string) => void;
}) {
  const daysCount = 84; // 12 weeks
  const today = new Date();
  const byDate = new Map<string, number>();
  for (const s of sessions) {
    if (!s.date) continue;
    const prev = byDate.get(s.date) || 0;
    const score = s.tonnageKg > 0 ? s.tonnageKg : s.completedSets * 100;
    byDate.set(s.date, prev + score);
  }

  const maxScore = Math.max(1, ...Array.from(byDate.values()));
  const cells: { key: string; level: 0 | 1 | 2 | 3 | 4; score: number }[] = [];
  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const score = byDate.get(key) || 0;
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (score > 0) {
      const ratio = score / maxScore;
      if (ratio >= 0.75) level = 4;
      else if (ratio >= 0.45) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }
    cells.push({ key, level, score });
  }

  const activeDaysCount = cells.filter((c) => c.level > 0).length;
  let currentStreakWeeks = 0;
  for (let w = 11; w >= 0; w--) {
    const weekSlice = cells.slice(w * 7, w * 7 + 7);
    if (weekSlice.some((c) => c.level > 0)) currentStreakWeeks++;
    else if (w < 11) break;
  }

  const levelStyles: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: 'rgba(255, 255, 255, 0.045)',
    1: 'rgba(200, 245, 80, 0.24)',
    2: 'rgba(200, 245, 80, 0.48)',
    3: 'rgba(200, 245, 80, 0.74)',
    4: '#c8f550',
  };

  return (
    <div className="mt-4 pt-4 border-t border-slate-400/10 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-100">Активность за 12 недель</div>
          <div className="font-mono text-[10px] text-slate-400 mt-0.5">
            Тренировок: <span className="text-slate-200 font-bold">{activeDaysCount}</span> · Серия:{' '}
            <span className="text-sky-300 font-bold">{currentStreakWeeks} нед.</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500">
          <span>Меньше</span>
          {([0, 1, 2, 3, 4] as const).map((lv) => (
            <span
              key={lv}
              style={{ backgroundColor: levelStyles[lv] }}
              className="w-2.5 h-2.5 rounded-[3px] inline-block"
            />
          ))}
          <span>Больше</span>
        </div>
      </div>

      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto no-scrollbar py-0.5">
        {cells.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => onSelectDate?.(c.key)}
            title={`${c.key}${c.score > 0 ? ` · ${Math.round(c.score)} ед.` : ' · Отдых'}`}
            style={{ backgroundColor: levelStyles[c.level] }}
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-[4px] transition-transform hover:scale-110 active:scale-90 focus:outline-none"
          />
        ))}
      </div>
    </div>
  );
});

export function RestTimerEdgeBar() {
  const { timerSec, timerTotal, timerRunning } = useRestTimer();
  if (!timerRunning || timerTotal <= 0) return null;
  return (
    <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.06] pointer-events-none">
      <div
        style={{
          width: `${Math.max(0, Math.min(100, (timerSec / timerTotal) * 100))}%`,
          backgroundColor: 'var(--ic-accent, #c8f550)',
        }}
        className="h-full transition-all duration-500 linear"
      />
    </div>
  );
}
