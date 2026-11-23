import React, { useState } from 'react';
import { NativeiOSBridge } from '../engine/iosBridge';
import { calculateE1RM, formatTime, roundToStep } from '../engine/math';
import { AnimatedNumber } from './AnimatedNumber';
import { BarbellWebGL3D } from './BarbellWebGL3D';
import { PendingSetInfo } from './DynamicIslandBar';
import { useRestTimer } from '../hooks/useRestTimerStore';

interface GymFocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProgramTitle: string;
  dayTitle: string;
  nextPendingSet: PendingSetInfo | null;
  completedCount: number;
  totalCount: number;
  dayTonnage: number;
  timerSec?: number;
  timerTotal?: number;
  timerRunning?: boolean;
  startTimer: (sec: number) => void;
  stopTimer: () => void;
  onCompleteSetWithOutcome: (outcome: 'easy' | 'solid' | 'hard', actualReps?: number) => void;
  onAdjustReadiness: (delta: number) => void;
  readinessShift: number;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
}

export const GymFocusModal: React.FC<GymFocusModalProps> = ({
  isOpen,
  onClose,
  activeProgramTitle,
  dayTitle,
  nextPendingSet,
  completedCount,
  totalCount,
  dayTonnage,
  startTimer,
  stopTimer,
  onCompleteSetWithOutcome,
  onAdjustReadiness,
  readinessShift,
  hapticsEnabled,
  soundEnabled,
}) => {
  const { timerSec, timerTotal, timerRunning } = useRestTimer();
  const [selectedOutcome, setSelectedOutcome] = useState<'easy' | 'solid' | 'hard'>('solid');
  const [customReps, setCustomReps] = useState<number | null>(null);
  const [coachingHint, setCoachingHint] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetReps = nextPendingSet ? customReps ?? nextPendingSet.reps : 0;
  const liveE1RM =
    nextPendingSet && nextPendingSet.weightKg
      ? calculateE1RM(nextPendingSet.weightKg, targetReps)
      : 0;

  const handleBigComplete = () => {
    if (!nextPendingSet) return;
    if (selectedOutcome === 'easy') {
      setCoachingHint(
        nextPendingSet.weightKg
          ? `Запас есть! Расчётный 1ПМ: ${liveE1RM} кг. Можно держать темп или накинуть +2.5% на следующих подходах.`
          : 'Отличный темп! Отдохни 60 секунд и переходи к следующему подходу.'
      );
    } else if (selectedOutcome === 'hard') {
      setCoachingHint(
        nextPendingSet.weightKg
          ? `Тяжёлый сет (${roundToStep(nextPendingSet.weightKg - 2.5, 2.5, 20)} кг — запасной вариант, если собьётся техника).`
          : 'Восстанови дыхание 90–120 сек перед следующим подходом.'
      );
    } else {
      setCoachingHint(
        nextPendingSet.weightKg
          ? `Чётко по плану · e1RM ${liveE1RM} кг. Отдых запущен.`
          : 'Подход засчитан ✓'
      );
    }

    onCompleteSetWithOutcome(selectedOutcome, targetReps);
    setCustomReps(null);
    setSelectedOutcome('solid');
  };

  const progressPct =
    timerRunning && timerTotal > 0
      ? Math.max(0, (timerSec / timerTotal) * 100)
      : totalCount > 0
      ? (completedCount / totalCount) * 100
      : 0;

  return (
    <div className="fixed inset-0 z-[75] bg-[#090a0c] flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 max-w-xl w-full mx-auto">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 " />
            Режим зала · {completedCount}/{totalCount}
          </div>
          <div className="text-xs text-slate-400 truncate mt-0.5">
            {activeProgramTitle} · {dayTitle}
          </div>
        </div>
        <button
          onClick={() => {
            NativeiOSBridge.haptic('light', hapticsEnabled);
            onClose();
          }}
          className="px-3.5 py-2 rounded-2xl slate-pill text-xs font-bold text-slate-100 active:scale-90 transition-transform shrink-0"
        >
          Выйти ✕
        </button>
      </div>

      {/* Main Focus Stage */}
      <div className="max-w-xl w-full mx-auto my-auto space-y-4 py-3">
        {/* Active Rest Timer Card */}
        {timerRunning && (
          <div className="slate-card border-emerald-400/40 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300">Отдых между подходами</div>
              <div className="font-mono tabular text-3xl font-extrabold text-emerald-400 mt-0.5">
                {formatTime(timerSec)}
              </div>
            </div>
            <div className="flex-1 h-2.5 slate-well rounded-full overflow-hidden">
              <div
                style={{ width: `${progressPct}%` }}
                className="h-full bg-[#c8f550] transition-all duration-500 linear"
              />
            </div>
            <button
              onClick={stopTimer}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs font-bold active:scale-90"
            >
              Сброс
            </button>
          </div>
        )}

        {nextPendingSet ? (
          <>
            {/* WebGL 3D Barbell if weighted */}
            {nextPendingSet.weightKg ? (
              <BarbellWebGL3D
                targetWeight={nextPendingSet.weightKg}
                barbellWeight={nextPendingSet.barbellWeight}
                title={`${nextPendingSet.exerciseName} · Подход #${nextPendingSet.setNumber}/${nextPendingSet.totalSetsInBlock}`}
                hapticsEnabled={hapticsEnabled}
                soundEnabled={soundEnabled}
                compact
              />
            ) : (
              <div className="slate-card rounded-2xl p-5 text-center">
                <div className="text-[11px] font-mono uppercase tracking-widest text-sky-300">Подсобное упражнение</div>
                <div className="text-xl font-extrabold text-slate-50 mt-1">{nextPendingSet.exerciseName}</div>
                <div className="font-mono tabular text-3xl font-extrabold text-sky-300 mt-2">
                  Подход #{nextPendingSet.setNumber} · {nextPendingSet.reps} повт.
                </div>
              </div>
            )}

            {/* Quick Reps & RPE / Difficulty Selector */}
            <div className="slate-card rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400">Факт повторений:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', hapticsEnabled);
                      setCustomReps(Math.max(1, targetReps - 1));
                    }}
                    className="w-10 h-10 rounded-xl bg-slate-900 font-mono text-base font-bold text-slate-200 active:scale-90"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-mono tabular text-xl font-extrabold text-slate-50">
                    {targetReps}
                  </span>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', hapticsEnabled);
                      setCustomReps(targetReps + 1);
                    }}
                    className="w-10 h-10 rounded-xl bg-slate-900 font-mono text-base font-bold text-slate-200 active:scale-90"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'easy', label: 'Легко', sub: 'Есть запас' },
                    { id: 'solid', label: 'По плану', sub: 'Рабочий темп' },
                    { id: 'hard', label: 'Тяжело', sub: 'Тяжело' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', hapticsEnabled);
                      setSelectedOutcome(opt.id);
                    }}
                    className={`py-2.5 px-2 rounded-2xl text-center transition-all active:scale-95 ${
                      selectedOutcome === opt.id
                        ? 'bg-sky-400 text-slate-950 font-extrabold shadow-lg shadow-sky-400/20'
                        : 'slate-well text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 ${selectedOutcome === opt.id ? 'text-slate-900' : 'text-slate-500'}`}>
                      {opt.sub}
                    </div>
                  </button>
                ))}
              </div>

              {coachingHint && (
                <div className="p-3 rounded-2xl slate-well text-xs text-sky-200 flex items-center justify-between gap-2">
                  <span>{coachingHint}</span>
                  {readinessShift > -5 && (
                    <button
                      onClick={() => {
                        NativeiOSBridge.haptic('medium', hapticsEnabled);
                        onAdjustReadiness(-2.5);
                        setCoachingHint('Снизили нагрузку дня на -2.5%.');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-[10px] font-mono text-amber-300 shrink-0"
                    >
                      -2.5% веса
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Giant Sweat-Proof Action Button */}
            <button
              onClick={handleBigComplete}
              className="w-full py-5 rounded-2xl bg-sky-400 text-slate-950 text-base font-extrabold tracking-tight  active:scale-95 transition-transform"
            >
              ЗАКРЫТЬ ПОДХОД #{nextPendingSet.setNumber} ({nextPendingSet.weightKg ? `${nextPendingSet.weightKg} кг × ` : ''}
              {targetReps}) ✓
            </button>
          </>
        ) : (
          <div className="slate-card rounded-2xl p-8 text-center space-y-3">
            
            <div className="text-xl font-extrabold text-slate-50">Тренировка закрыта!</div>
            <div className="font-mono tabular text-sm text-emerald-300">
              Общий тоннаж: <AnimatedNumber value={dayTonnage} /> кг · {completedCount} подходов
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-6 py-3 rounded-2xl bg-sky-400 text-slate-950 text-xs font-extrabold active:scale-95"
            >
              Вернуться к обзору
            </button>
          </div>
        )}
      </div>

      {/* Quick Rest Presets Footer */}
      <div className="max-w-xl w-full mx-auto grid grid-cols-3 gap-2">
        {[
          { label: 'Отдых 60с', sec: 60 },
          { label: 'Отдых 3м', sec: 180 },
          { label: 'Отдых 5м', sec: 300 },
        ].map((t) => (
          <button
            key={t.sec}
            onClick={() => startTimer(t.sec)}
            className="py-3 rounded-2xl slate-pill font-mono text-xs font-semibold text-slate-200 active:scale-95"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
};
