import React from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { formatTime } from '../engine/math';

export interface PendingSetInfo {
  setKey: string;
  itemIdx: number;
  exerciseName: string;
  isBase: boolean;
  setNumber: number;
  totalSetsInBlock: number;
  reps: number;
  effectivePct: number;
  weightKg: number | null;
  barbellWeight: number;
  done: boolean;
}

interface DynamicIslandBarProps {
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  activeProgramTitle: string;
  nextPendingSet: PendingSetInfo | null;
  completedCount: number;
  totalCount: number;
  timerSec: number;
  timerTotal: number;
  timerRunning: boolean;
  startTimer: (sec: number) => void;
  stopTimer: () => void;
  onCompleteNext: () => void;
  onOpenPrograms: () => void;
  onOpenSettings: () => void;
  isNativeApp: boolean;
  shortcutsEnabled: boolean;
  hapticsEnabled: boolean;
}

export const DynamicIslandBar: React.FC<DynamicIslandBarProps> = ({
  expanded,
  setExpanded,
  activeProgramTitle,
  nextPendingSet,
  completedCount,
  totalCount,
  timerSec,
  timerTotal,
  timerRunning,
  startTimer,
  stopTimer,
  onCompleteNext,
  onOpenPrograms,
  onOpenSettings,
  isNativeApp,
  shortcutsEnabled,
  hapticsEnabled,
}) => {
  const progressPct =
    timerRunning && timerTotal > 0
      ? Math.max(0, (timerSec / timerTotal) * 100)
      : totalCount > 0
      ? (completedCount / totalCount) * 100
      : 0;
  const isPreStart = timerRunning && timerSec > 0 && timerSec <= 5;
  const isUrgent = timerRunning && timerSec > 0 && timerSec <= 10;
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 top-fade-cap pt-[max(0.8rem,env(safe-area-inset-top))] pb-3 px-3 pointer-events-none flex justify-center">
      <div
        onClick={() => {
          NativeiOSBridge.haptic('light', hapticsEnabled);
          setExpanded((v) => !v);
        }}
        className={`pointer-events-auto island-pill cursor-pointer select-none overflow-hidden ${
          isUrgent ? 'island-urgent' : ''
        } ${expanded ? 'w-full max-w-md rounded-[20px] p-4' : 'rounded-full px-3.5 py-2 max-w-[92vw]'}`}
      >
        {!expanded ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-5 h-5 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 -rotate-90" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r={radius} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2.5" />
                  <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    stroke={isPreStart ? '#F59E0B' : timerRunning ? '#4ADE80' : '#C8F550'}
                    strokeWidth="2.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.45s var(--spring-ios)' }}
                  />
                </svg>
              </div>

              <span
                className={`font-mono tabular text-xs font-bold truncate ${
                  timerRunning ? (isUrgent ? 'text-emerald-300 ' : 'text-emerald-400') : 'text-slate-50'
                }`}
              >
                {timerRunning
                  ? `${isPreStart ? 'Готовься' : 'Отдых'} ${formatTime(timerSec)}`
                  : nextPendingSet
                  ? nextPendingSet.weightKg
                    ? `${nextPendingSet.weightKg} кг × ${nextPendingSet.reps}`
                    : `${nextPendingSet.exerciseName.slice(0, 18)} · ${nextPendingSet.reps}`
                  : 'Тренировка закрыта ✓'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="px-2 py-0.5 rounded-full bg-slate-900/95 font-mono tabular text-[10px] text-sky-300 font-semibold">
                {completedCount}/{totalCount}
              </span>
              {(isNativeApp || shortcutsEnabled) && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
            </div>
          </div>
        ) : (
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-sky-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 " />
                  {activeProgramTitle} · {completedCount}/{totalCount}
                </div>
                <div className="text-sm font-bold text-slate-50 mt-0.5 truncate">
                  {nextPendingSet ? nextPendingSet.exerciseName : 'Все подходы закрыты!'}
                </div>
                {nextPendingSet && (
                  <div className="font-mono tabular text-xs text-slate-300 mt-0.5">
                    {nextPendingSet.weightKg
                      ? `${nextPendingSet.weightKg} кг × ${nextPendingSet.reps} повт. · Подход #${nextPendingSet.setNumber}`
                      : `${nextPendingSet.reps} повт. · Подход #${nextPendingSet.setNumber}`}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', hapticsEnabled);
                  setExpanded(false);
                }}
                className="w-7 h-7 rounded-full bg-slate-800/90 text-slate-300 hover:text-white flex items-center justify-center font-mono text-xs shrink-0"
              >
                ✕
              </button>
            </div>

            {timerRunning && (
              <div className="slate-well rounded-2xl p-2.5 flex items-center gap-3">
                <span
                  className={`font-mono tabular text-base font-bold ${
                    isUrgent ? 'text-emerald-300 ' : 'text-emerald-400'
                  }`}
                >
                  {formatTime(timerSec)}
                </span>
                <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${progressPct}%` }}
                    className="h-full bg-emerald-400 transition-all duration-500 linear"
                  />
                </div>
                <button
                  onClick={stopTimer}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-mono text-[10px] active:scale-95"
                >
                  Стоп
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: '60 сек', sec: 60 },
                { label: '3 мин', sec: 180 },
                { label: '5 мин', sec: 300 },
              ].map((t) => (
                <button
                  key={t.sec}
                  onClick={() => startTimer(t.sec)}
                  className="py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 font-mono text-xs text-slate-100 active:scale-95 transition-all"
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {nextPendingSet && (
                <button
                  onClick={onCompleteNext}
                  className="flex-1 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-extrabold active:scale-95 transition-all"
                >
                  Следующий подход ✓
                </button>
              )}
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', hapticsEnabled);
                  setExpanded(false);
                  onOpenPrograms();
                }}
                className="px-3 py-2.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-medium active:scale-95"
              >
                Циклы
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', hapticsEnabled);
                  setExpanded(false);
                  onOpenSettings();
                }}
                className="px-3 py-2.5 rounded-xl bg-slate-900 text-slate-100 text-xs font-medium active:scale-95"
              >
                Настройки
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
