import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedNumber } from './components/AnimatedNumber';
import { BarbellWebGL3D } from './components/BarbellWebGL3D';
import { BottomSheet } from './components/BottomSheet';
import { DynamicIslandBar, PendingSetInfo } from './components/DynamicIslandBar';
import { FormCheckVision } from './components/FormCheckVision';
import { GymFocusModal } from './components/GymFocusModal';
import { analyzeFoodPhotoAI, analyzeProgramPhotoAI } from './services/aiVision';
import {
  isCloudConfigured,
  joinLiveGymRoom,
  LiveGymPeerState,
  pullBackupFromCloud,
  pushBackupToCloud,
} from './services/cloudSync';
import { enableBackgroundPush, sendLocalRestNotification } from './services/webPush';
import { LivingAuroraBackdrop, TAB_THEMES } from './components/LivingAuroraBackdrop';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import {
  DEFAULT_EXERCISES,
  DEFAULT_MEAL_TEMPLATES,
  DEFAULT_PROGRAMS,
  FRIDGE_PRODUCTS,
  QUICK_PROGRAM_PRESETS,
} from './data/programs';
import { NativeiOSBridge } from './engine/iosBridge';
import { calculateDOTS, calculateE1RM, roundToStep } from './engine/math';
import { parseUniversalProgram } from './engine/parser';
import { extractTextFromPdfArrayBuffer } from './engine/pdfImport';
import {
  createSafetySnapshot,
  CURRENT_SCHEMA_VERSION,
  hydrateFromIndexedDB,
  listSafetySnapshots,
  mergeBuiltInPrograms,
  saveKV,
  SnapshotRecord,
} from './storage/db';
import {
  ExerciseConfig,
  ExerciseId,
  FullBackupPayload,
  IOSSettings,
  MealTemplate,
  NutritionLog,
  ProgramPosition,
  ShoppingItem,
  TabId,
  TrainingProgram,
} from './types';

function spawnCelebrationBurst(): void {
  const colors = ['#38BDF8', '#34D399', '#FBBF24', '#A78BFA', '#F8FAFC'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.45;
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-dot';
    el.style.left = `${cx}px`;
    el.style.top = `${cy}px`;
    el.style.backgroundColor = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 28 + (Math.random() - 0.5) * 0.3;
    const dist = 90 + Math.random() * 140;
    el.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
    el.style.setProperty('--ty', `${Math.sin(angle) * dist - 40}px`);
    el.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
}

export default function App() {
  const isNativeApp = NativeiOSBridge.isNativeCapacitor();
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageBanner, setStorageBanner] = useState<string>('');

  const [programs, setPrograms] = useState<TrainingProgram[]>(DEFAULT_PROGRAMS);
  const [activeProgramId, setActiveProgramId] = useState<string>('path-100kg');
  const [programPositions, setProgramPositions] = useState<Record<string, ProgramPosition>>({
    'path-100kg': { week: 1, dayIdx: 0 },
  });

  const [exercises, setExercises] = useState<ExerciseConfig[]>(DEFAULT_EXERCISES);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>(DEFAULT_MEAL_TEMPLATES);
  const [nutritionLog, setNutritionLog] = useState<NutritionLog>({
    bodyweight: 78.0,
    dayType: 'workout',
    entries: [DEFAULT_MEAL_TEMPLATES[0]],
  });

  const [iosSettings, setIosSettings] = useState<IOSSettings>({
    hapticsEnabled: true,
    wakeLockEnabled: true,
    shortcutsIslandEnabled: false,
    shortcutName: 'IronCoreTimer',
    soundEffectsEnabled: true,
  });

  const [activeTab, setActiveTab] = useState<TabId>('workout');
  const [readinessShift, setReadinessShift] = useState<number>(0);
  const [recipeCategory, setRecipeCategory] = useState<string>('Все');
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [selectedFridgeItems, setSelectedFridgeItems] = useState<string[]>(['творог', 'яйц', 'курин']);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [newShoppingInput, setNewShoppingInput] = useState<string>('');

  // Sheets, Gym Focus Mode & Z-Depth Recede State
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [isGymFocusOpen, setIsGymFocusOpen] = useState(false);
  const [isFormCheckOpen, setIsFormCheckOpen] = useState(false);
  const [isCloudSheetOpen, setIsCloudSheetOpen] = useState(false);
  const [syncCode, setSyncCode] = useState('max-iron');
  const [cloudStatus, setCloudStatus] = useState('');
  const [livePeers, setLivePeers] = useState<LiveGymPeerState[]>([]);
  const [isInLiveRoom, setIsInLiveRoom] = useState(false);
  const liveRoomRef = useRef<{ updateMyState: (s: LiveGymPeerState) => void; leave: () => void } | null>(null);
  const [aiFoodLoading, setAiFoodLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const foodPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const progPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [activePlateTarget, setActivePlateTarget] = useState<{
    weight: number;
    barbell: number;
    title: string;
  } | null>(null);
  const [activeRecipeSheet, setActiveRecipeSheet] = useState<MealTemplate | null>(null);
  const [recipePortionScale, setRecipePortionScale] = useState<number>(1);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false);
  const [isProgramsSheetOpen, setIsProgramsSheetOpen] = useState(false);
  const [programsSheetMode, setProgramsSheetMode] = useState<'list' | 'add'>('list');
  const [sheetDragRatio, setSheetDragRatio] = useState(1);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);

  // Shockwave set feedback + Day transition direction
  const [recentBurstSetKey, setRecentBurstSetKey] = useState<string | null>(null);
  const [dayTransitionDir, setDayTransitionDir] = useState<'next' | 'prev'>('next');
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);

  // Add Program state
  const [newProgTitle, setNewProgTitle] = useState('');
  const [newProgBadge, setNewProgBadge] = useState('NEW');
  const [newProgRawText, setNewProgRawText] = useState('');
  const [pdfImportStatus, setPdfImportStatus] = useState('');
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  // Timer
  const [timerEndTime, setTimerEndTime] = useState<number | null>(null);
  const [timerSec, setTimerSec] = useState<number>(0);
  const [timerTotal, setTimerTotal] = useState<number>(180);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // e1RM Quick Calc
  const [calcExId, setCalcExId] = useState<ExerciseId>('bench');
  const [calcWeight, setCalcWeight] = useState<number>(85);
  const [calcReps, setCalcReps] = useState<number>(5);

  const importJsonRef = useRef<HTMLInputElement | null>(null);
  const currentTheme = TAB_THEMES[activeTab] || TAB_THEMES.workout;

  // Hydrate everything from IndexedDB
  useEffect(() => {
    let alive = true;
    hydrateFromIndexedDB()
      .then(async (data) => {
        if (!alive) return;
        setPrograms(data.programs);
        setExercises(data.exercises);
        setCompletedSets(data.completedSets);
        setMealTemplates(data.mealTemplates);
        setNutritionLog(data.nutritionLog);

        const s = data.session;
        if (s.activeProgramId) setActiveProgramId(s.activeProgramId);
        if (s.programPositions) setProgramPositions(s.programPositions);
        if (typeof s.readinessShift === 'number') setReadinessShift(s.readinessShift);
        if (s.recipeCategory) setRecipeCategory(s.recipeCategory);
        if (s.checkedIngredients) setCheckedIngredients(s.checkedIngredients);
        if (s.selectedFridgeItems) setSelectedFridgeItems(s.selectedFridgeItems);
        if (Array.isArray(s.shoppingList)) setShoppingList(s.shoppingList);
        if (s.activeTab) setActiveTab(s.activeTab);
        if (s.iosSettings) setIosSettings((prev) => ({ ...prev, ...s.iosSettings }));

        if (s.timerEndTime) {
          const rem = Math.max(0, Math.round((s.timerEndTime - Date.now()) / 1000));
          if (rem > 0) {
            setTimerEndTime(s.timerEndTime);
            setTimerTotal(s.timerTotal || 180);
            setTimerSec(rem);
            setTimerRunning(true);
          }
        }

        if (data.migratedFromLocalStorage) {
          setStorageBanner('Данные перенесены в IndexedDB ✓');
          setTimeout(() => setStorageBanner(''), 4000);
        }

        const snaps = await listSafetySnapshots();
        if (alive) setSnapshots(snaps);
        setIsHydrated(true);
      })
      .catch(() => {
        if (alive) setIsHydrated(true);
      });

    return () => {
      alive = false;
    };
  }, []);

  // Sync CSS accent variables with active tab atmosphere
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-rgb', currentTheme.accentRgb);
    document.documentElement.style.setProperty('--accent-hex', currentTheme.accentHex);
  }, [currentTheme]);

  // Persist slices asynchronously to IndexedDB
  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('programs', programs);
  }, [isHydrated, programs]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('exercises', exercises);
  }, [isHydrated, exercises]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('completedSets', completedSets);
  }, [isHydrated, completedSets]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('mealTemplates', mealTemplates);
  }, [isHydrated, mealTemplates]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('nutritionLog', nutritionLog);
  }, [isHydrated, nutritionLog]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveKV('session', {
      activeTab,
      activeProgramId,
      programPositions,
      readinessShift,
      recipeCategory,
      checkedIngredients,
      selectedFridgeItems,
      shoppingList,
      timerEndTime,
      timerTotal,
      iosSettings,
    });
  }, [
    isHydrated,
    activeTab,
    activeProgramId,
    programPositions,
    readinessShift,
    recipeCategory,
    checkedIngredients,
    selectedFridgeItems,
    shoppingList,
    timerEndTime,
    timerTotal,
    iosSettings,
  ]);

  const isAnySheetOpen = isProgramsSheetOpen || Boolean(activeRecipeSheet) || isFilterSheetOpen || isSettingsSheetOpen || isCloudSheetOpen;

  useEffect(() => {
    if (isAnySheetOpen) setSheetDragRatio(0);
    else setSheetDragRatio(1);
  }, [isAnySheetOpen]);

  const activeProgram = useMemo(
    () => programs.find((p) => p.id === activeProgramId) || programs[0],
    [programs, activeProgramId]
  );

  const currentPos = programPositions[activeProgram.id] || { week: 1, dayIdx: 0 };
  const selectedWeek = currentPos.week;
  const selectedDayIdx = currentPos.dayIdx;

  const setSelectedWeek = (weekNum: number) => {
    setDayTransitionDir(weekNum >= selectedWeek ? 'next' : 'prev');
    setProgramPositions((prev) => ({
      ...prev,
      [activeProgram.id]: { week: weekNum, dayIdx: 0 },
    }));
  };

  const setSelectedDayIdx = (dayIdx: number) => {
    setDayTransitionDir(dayIdx >= selectedDayIdx ? 'next' : 'prev');
    setProgramPositions((prev) => ({
      ...prev,
      [activeProgram.id]: { ...(prev[activeProgram.id] || { week: 1 }), dayIdx },
    }));
  };

  const handleSwitchProgram = (progId: string) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    setActiveProgramId(progId);
    setActiveTab('workout');
    setIsProgramsSheetOpen(false);
  };

  const parsedNewProgramWeeks = useMemo(() => {
    if (!newProgRawText.trim()) return [];
    return parseUniversalProgram(newProgRawText);
  }, [newProgRawText]);

  const parsedNewStats = useMemo(() => {
    const wCount = parsedNewProgramWeeks.length;
    const dCount = parsedNewProgramWeeks.reduce((s, w) => s + w.days.length, 0);
    const exCount = parsedNewProgramWeeks.reduce(
      (s, w) => s + w.days.reduce((sd, d) => sd + d.items.length, 0),
      0
    );
    return { wCount, dCount, exCount };
  }, [parsedNewProgramWeeks]);

  const handlePdfProgramUpload = async (file?: File) => {
    if (!file) return;
    setPdfImportStatus('Читаем PDF...');
    try {
      const buf = await file.arrayBuffer();
      const txt = await extractTextFromPdfArrayBuffer(buf);
      if (!txt.trim()) {
        setPdfImportStatus('В PDF нет текстового слоя (возможно, скан-картинка). Вставь текст ниже.');
        return;
      }
      setNewProgRawText(txt);
      if (!newProgTitle.trim()) {
        setNewProgTitle(file.name.replace(/\.pdf$/i, '').slice(0, 28));
      }
      setPdfImportStatus(`Загружен: ${file.name}`);
      NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPdfImportStatus(`Ошибка PDF: ${msg}`);
    }
  };

  const buildCurrentPayload = useCallback(
    (): FullBackupPayload => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      programs,
      activeProgramId,
      programPositions,
      exercises,
      completedSets,
      mealTemplates,
      nutritionLog,
      shoppingList,
      iosSettings,
    }),
    [
      programs,
      activeProgramId,
      programPositions,
      exercises,
      completedSets,
      mealTemplates,
      nutritionLog,
      shoppingList,
      iosSettings,
    ]
  );

  const handleSaveNewProgram = async () => {
    if (parsedNewProgramWeeks.length === 0) return;
    const id = `prog-${Date.now()}`;
    const title = newProgTitle.trim() || `Программа #${programs.length + 1}`;
    const badge = (newProgBadge.trim() || `${parsedNewStats.wCount} НЕД`).slice(0, 8).toUpperCase();
    const newProg: TrainingProgram = {
      id,
      title,
      badge,
      description: `${parsedNewStats.wCount} нед. · ${parsedNewStats.dCount} трен. дней`,
      isBuiltIn: false,
      weeks: parsedNewProgramWeeks,
    };
    await createSafetySnapshot(`Перед добавлением «${title}»`, buildCurrentPayload());
    setPrograms((prev) => [...prev, newProg]);
    setProgramPositions((prev) => ({ ...prev, [id]: { week: 1, dayIdx: 0 } }));
    setActiveProgramId(id);
    setActiveTab('workout');
    setNewProgTitle('');
    setNewProgBadge('NEW');
    setNewProgRawText('');
    setPdfImportStatus('');
    setProgramsSheetMode('list');
    setIsProgramsSheetOpen(false);
    setSnapshots(await listSafetySnapshots());
    NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
  };

  const handleDeleteProgram = async (progId: string) => {
    const target = programs.find((p) => p.id === progId);
    if (!target || target.isBuiltIn) return;
    if (!window.confirm(`Удалить программу «${target.title}»?`)) return;
    await createSafetySnapshot(`Перед удалением «${target.title}»`, buildCurrentPayload());
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    setPrograms((prev) => prev.filter((p) => p.id !== progId));
    if (activeProgramId === progId) setActiveProgramId('path-100kg');
    setSnapshots(await listSafetySnapshots());
  };

  useEffect(() => {
    void NativeiOSBridge.setKeepAwake(iosSettings.wakeLockEnabled);
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && iosSettings.wakeLockEnabled) {
        void NativeiOSBridge.setKeepAwake(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      void NativeiOSBridge.setKeepAwake(false);
    };
  }, [iosSettings.wakeLockEnabled]);

  const weekObj = useMemo(
    () => activeProgram.weeks.find((w) => w.week === selectedWeek) || activeProgram.weeks[0],
    [activeProgram, selectedWeek]
  );
  const dayObj = weekObj.days[selectedDayIdx] || weekObj.days[0];

  const handleWorkoutTouchStart = (e: React.TouchEvent) => {
    swipeStartXRef.current = e.touches[0].clientX;
    swipeStartYRef.current = e.touches[0].clientY;
  };
  const handleWorkoutTouchEnd = (e: React.TouchEvent) => {
    if (swipeStartXRef.current === null || swipeStartYRef.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
    const dy = e.changedTouches[0].clientY - swipeStartYRef.current;
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0 && selectedDayIdx < weekObj.days.length - 1) {
        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
        setSelectedDayIdx(selectedDayIdx + 1);
      } else if (dx > 0 && selectedDayIdx > 0) {
        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
        setSelectedDayIdx(selectedDayIdx - 1);
      }
    }
  };

  const progKeyPrefix = activeProgram.id === 'path-100kg' ? '' : `${activeProgram.id}-`;

  const computedDayItems = useMemo(() => {
    return dayObj.items.map((item, itemIdx) => {
      const ex = item.exId ? exercises.find((e) => e.id === item.exId) : null;
      const computedBlocks = item.blocks.map((b, bIdx) => {
        if (!ex || !b.pct || b.pct <= 0) {
          return {
            ...b,
            effectivePct: 0,
            weightKg: null as number | null,
            barbellWeight: 20,
            oneRepMax: null as number | null,
            blockKey: `${progKeyPrefix}w${weekObj.week}-d${selectedDayIdx}-i${itemIdx}-b${bIdx}`,
          };
        }
        const effectivePct = Math.max(30, b.pct + readinessShift);
        const rawKg = (ex.oneRepMax * effectivePct) / 100;
        const weightKg = roundToStep(rawKg, ex.step, ex.barbellWeight);
        return {
          ...b,
          effectivePct,
          weightKg,
          barbellWeight: ex.barbellWeight,
          oneRepMax: ex.oneRepMax,
          blockKey: `${progKeyPrefix}w${weekObj.week}-d${selectedDayIdx}-i${itemIdx}-b${bIdx}`,
        };
      });
      return {
        ...item,
        exName: ex ? ex.name : item.name,
        oneRepMax: ex ? ex.oneRepMax : null,
        computedBlocks,
      };
    });
  }, [dayObj, exercises, readinessShift, progKeyPrefix, weekObj.week, selectedDayIdx]);

  const flatDaySets = useMemo<PendingSetInfo[]>(() => {
    const list: PendingSetInfo[] = [];
    computedDayItems.forEach((item, itemIdx) => {
      item.computedBlocks.forEach((b) => {
        for (let sIdx = 0; sIdx < b.sets; sIdx++) {
          const setKey = `${b.blockKey}-s${sIdx}`;
          list.push({
            setKey,
            itemIdx,
            exerciseName: item.name,
            isBase: item.isBase,
            setNumber: sIdx + 1,
            totalSetsInBlock: b.sets,
            reps: b.reps,
            effectivePct: b.effectivePct,
            weightKg: b.weightKg,
            barbellWeight: b.barbellWeight || 20,
            done: Boolean(completedSets[setKey]),
          });
        }
      });
    });
    return list;
  }, [computedDayItems, completedSets]);

  const nextPendingSet = useMemo(() => flatDaySets.find((s) => !s.done) || null, [flatDaySets]);
  const completedSetsCount = useMemo(() => flatDaySets.filter((s) => s.done).length, [flatDaySets]);

  useEffect(() => {
    if (!isNativeApp) return;
    if (!nextPendingSet && !timerRunning) {
      void NativeiOSBridge.endLiveActivity();
      return;
    }
    void NativeiOSBridge.syncLiveActivity({
      exerciseName: nextPendingSet ? nextPendingSet.exerciseName : 'Тренировка завершена',
      weightKg: nextPendingSet?.weightKg || 0,
      reps: nextPendingSet?.reps || 0,
      setNumber: nextPendingSet?.setNumber || completedSetsCount,
      completedSets: completedSetsCount,
      totalSets: flatDaySets.length,
      timerEndTimestamp: timerRunning && timerEndTime ? Math.floor(timerEndTime / 1000) : 0,
      isResting: timerRunning,
    });
  }, [isNativeApp, nextPendingSet, completedSetsCount, flatDaySets.length, timerRunning, timerEndTime]);

  useEffect(() => {
    if (!timerRunning || !timerEndTime) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((timerEndTime - Date.now()) / 1000));
      setTimerSec(left);
      if (left <= 0) {
        setTimerRunning(false);
        setTimerEndTime(null);
        if (iosSettings.soundEffectsEnabled) NativeiOSBridge.playChime();
        sendLocalRestNotification('IRON CORE · Отдых завершён!', 'Пора выходить на следующий подход 💪');
        NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
      }
    }, 400);
    return () => clearInterval(interval);
  }, [timerRunning, timerEndTime, iosSettings.hapticsEnabled, iosSettings.soundEffectsEnabled]);

  const startTimer = useCallback(
    (sec: number) => {
      NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
      const end = Date.now() + sec * 1000;
      setTimerTotal(sec);
      setTimerEndTime(end);
      setTimerSec(sec);
      setTimerRunning(true);
      if (!isNativeApp && iosSettings.shortcutsIslandEnabled) {
        NativeiOSBridge.triggerShortcutsDynamicIslandTimer(sec, iosSettings.shortcutName);
      }
    },
    [isNativeApp, iosSettings]
  );

  const stopTimer = useCallback(() => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setTimerRunning(false);
    setTimerEndTime(null);
    setTimerSec(0);
  }, [iosSettings.hapticsEnabled]);

  useEffect(() => {
    if (nextPendingSet && nextPendingSet.weightKg) {
      setActivePlateTarget({
        weight: nextPendingSet.weightKg,
        barbell: nextPendingSet.barbellWeight,
        title: `${nextPendingSet.exerciseName} · Подход #${nextPendingSet.setNumber} (${nextPendingSet.effectivePct}%)`,
      });
      return;
    }
    for (const it of computedDayItems) {
      const firstWeighted = it.computedBlocks.find((b) => b.weightKg !== null);
      if (firstWeighted && firstWeighted.weightKg !== null) {
        setActivePlateTarget({
          weight: firstWeighted.weightKg,
          barbell: firstWeighted.barbellWeight || 20,
          title: `${it.name} · ${firstWeighted.effectivePct}% × ${firstWeighted.reps} повт.`,
        });
        return;
      }
    }
    setActivePlateTarget(null);
  }, [nextPendingSet, computedDayItems]);

  const triggerSetShockwave = (key: string, willCompleteAll: boolean) => {
    setRecentBurstSetKey(key);
    setTimeout(() => setRecentBurstSetKey((prev) => (prev === key ? null : prev)), 600);
    if (willCompleteAll) {
      spawnCelebrationBurst();
    }
  };

  const handleCompleteNextSet = () => {
    if (!nextPendingSet) return;
    NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
    const willCompleteAll = completedSetsCount + 1 === flatDaySets.length;
    triggerSetShockwave(nextPendingSet.setKey, willCompleteAll);
    setCompletedSets((prev) => ({ ...prev, [nextPendingSet.setKey]: true }));
    if (nextPendingSet.isBase) {
      startTimer(nextPendingSet.effectivePct >= 88 ? 300 : 180);
    } else {
      startTimer(60);
    }
  };

  const handleCompleteSetWithOutcome = (outcome: 'easy' | 'solid' | 'hard') => {
    if (!nextPendingSet) return;
    NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
    const willCompleteAll = completedSetsCount + 1 === flatDaySets.length;
    triggerSetShockwave(nextPendingSet.setKey, willCompleteAll);
    setCompletedSets((prev) => ({ ...prev, [nextPendingSet.setKey]: true }));
    if (nextPendingSet.isBase) {
      const baseRest = nextPendingSet.effectivePct >= 88 ? 300 : 180;
      startTimer(outcome === 'hard' ? baseRest + 60 : outcome === 'easy' ? Math.max(90, baseRest - 30) : baseRest);
    } else {
      startTimer(outcome === 'hard' ? 90 : 60);
    }
  };

  const toggleSet = (setKey: string, isBase: boolean, effectivePct = 0) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const nextVal = !completedSets[setKey];
    setCompletedSets((prev) => ({ ...prev, [setKey]: nextVal }));
    if (nextVal) {
      const willCompleteAll = completedSetsCount + 1 === flatDaySets.length;
      triggerSetShockwave(setKey, willCompleteAll);
      if (isBase) startTimer(effectivePct >= 88 ? 300 : 180);
      else startTimer(60);
    }
  };

  const handleUpdate1RM = (id: ExerciseId, newVal: string | number) => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    const num = typeof newVal === 'number' ? newVal : parseFloat(newVal);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== id) return ex;
        const cleanVal = Number.isNaN(num) ? 0 : num;
        const today = new Date().toISOString().slice(0, 10);
        const updatedHistory = [...(ex.history || [])];
        if (cleanVal > 0) {
          const last = updatedHistory[updatedHistory.length - 1];
          if (last && last.date === today) last.weight = cleanVal;
          else updatedHistory.push({ date: today, weight: cleanVal });
        }
        return { ...ex, oneRepMax: cleanVal, history: updatedHistory };
      })
    );
  };

  const dayTonnage = useMemo(() => {
    let sum = 0;
    for (const s of flatDaySets) {
      if (s.done && s.weightKg) sum += s.weightKg * s.reps;
    }
    return Math.round(sum);
  }, [flatDaySets]);

  const filteredRecipes = useMemo(() => {
    if (recipeCategory === 'Все') return mealTemplates;
    return mealTemplates.filter((m) => m.category === recipeCategory);
  }, [mealTemplates, recipeCategory]);

  const fridgeMatchedRecipes = useMemo(() => {
    if (selectedFridgeItems.length === 0) return [];
    const activeKeywords = FRIDGE_PRODUCTS.filter((p) => selectedFridgeItems.includes(p.id)).flatMap((p) => p.keywords);
    return mealTemplates
      .map((meal) => {
        const text = `${meal.name} ${meal.ingredients}`.toLowerCase();
        let hits = 0;
        for (const kw of activeKeywords) {
          if (text.includes(kw)) hits++;
        }
        return { ...meal, hits };
      })
      .filter((m) => m.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.p - a.p);
  }, [mealTemplates, selectedFridgeItems]);

  const toggleFridgeItem = (id: string) => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setSelectedFridgeItems((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addMealToLog = (meal: MealTemplate, scale = 1) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const scaledMeal: MealTemplate = {
      ...meal,
      name: scale === 1 ? meal.name : `${meal.name} (${scale}×)`,
      kcal: Math.round(meal.kcal * scale),
      p: Math.round(meal.p * scale),
      f: Math.round(meal.f * scale),
      c: Math.round(meal.c * scale),
      uid: Date.now() + Math.random(),
    };
    setNutritionLog((prev) => ({
      ...prev,
      entries: [...prev.entries, scaledMeal],
    }));
  };

  const addRecipeIngredientsToShoppingList = (meal: MealTemplate) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const parts = meal.ingredients
      .split(',')
      .map((s) => s.trim().replace(/\.$/, ''))
      .filter(Boolean);
    setShoppingList((prev) => {
      const existingLower = new Set(prev.map((it) => it.text.toLowerCase()));
      const additions: ShoppingItem[] = [];
      for (const p of parts) {
        if (!existingLower.has(p.toLowerCase())) {
          additions.push({
            id: `shop-${Date.now()}-${Math.random()}`,
            text: p,
            recipeName: meal.name,
            done: false,
          });
        }
      }
      return [...additions, ...prev];
    });
    setStorageBanner(`Ингредиенты добавлены в список покупок ✓`);
    setTimeout(() => setStorageBanner(''), 3000);
  };

  const handleAddManualShoppingItem = () => {
    const clean = newShoppingInput.trim();
    if (!clean) return;
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setShoppingList((prev) => [
      { id: `shop-${Date.now()}`, text: clean, done: false },
      ...prev,
    ]);
    setNewShoppingInput('');
  };

  const toggleIngredientCheck = (recipeId: string, idx: number) => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    const k = `${recipeId}-${idx}`;
    setCheckedIngredients((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const nutritionTotals = useMemo(() => {
    return nutritionLog.entries.reduce(
      (acc, m) => ({
        kcal: acc.kcal + (Number(m.kcal) || 0),
        p: acc.p + (Number(m.p) || 0),
        f: acc.f + (Number(m.f) || 0),
        c: acc.c + (Number(m.c) || 0),
      }),
      { kcal: 0, p: 0, f: 0, c: 0 }
    );
  }, [nutritionLog.entries]);

  const targetKcal = nutritionLog.dayType === 'workout' ? 3000 : 2500;
  const targetProtein = Math.round((nutritionLog.bodyweight || 78) * 2.0);
  const bench1RM = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;

  const sbdTotal = useMemo(() => {
    const s = exercises.find((e) => e.id === 'squat')?.oneRepMax || 0;
    const b = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;
    const d = exercises.find((e) => e.id === 'deadlift')?.oneRepMax || 0;
    return Number((s + b + d).toFixed(1));
  }, [exercises]);

  const dotsScore = useMemo(
    () => calculateDOTS(sbdTotal, nutritionLog.bodyweight),
    [sbdTotal, nutritionLog.bodyweight]
  );

  
  const handleFoodPhotoUpload = async (file?: File) => {
    if (!file) return;
    setAiFoodLoading(true);
    setStorageBanner('AI анализирует фото блюда...');
    const res = await analyzeFoodPhotoAI(file);
    setAiFoodLoading(false);
    if (res.error || !res.meal) {
      setStorageBanner(res.error || 'Не удалось распознать блюдо');
      setTimeout(() => setStorageBanner(''), 4500);
      return;
    }
    addMealToLog(res.meal, 1);
    setStorageBanner(`AI добавил: ${res.meal.name} (${res.meal.kcal} ккал) ✓`);
    setTimeout(() => setStorageBanner(''), 4500);
  };

  const handleProgramPhotoUpload = async (file?: File) => {
    if (!file) return;
    setPdfImportStatus('AI распознаёт программу с фото...');
    const res = await analyzeProgramPhotoAI(file);
    if (res.error || !res.text) {
      setPdfImportStatus(res.error || 'Ошибка AI-распознавания');
      return;
    }
    setNewProgRawText(res.text);
    setPdfImportStatus('Программа распознана с фото ✓');
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
  };

  const handleToggleLiveRoom = () => {
    if (isInLiveRoom) {
      liveRoomRef.current?.leave();
      liveRoomRef.current = null;
      setIsInLiveRoom(false);
      setLivePeers([]);
      setCloudStatus('Отключено от Live-комнаты.');
      return;
    }
    const room = joinLiveGymRoom(
      syncCode,
      {
        name: 'Максим',
        exercise: nextPendingSet?.exerciseName || 'Отдых',
        weightKg: nextPendingSet?.weightKg || null,
        reps: nextPendingSet?.reps || 0,
        completedSets: completedSetsCount,
        totalSets: flatDaySets.length,
        updatedAt: Date.now(),
      },
      (peers) => setLivePeers(peers)
    );
    if (!room) {
      setCloudStatus('Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel.');
      return;
    }
    liveRoomRef.current = room;
    setIsInLiveRoom(true);
    setCloudStatus(`В комнате «${syncCode}» в реальном времени ✓`);
  };

  const handleShareWorkout = async () => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    const lines = [
      `IRON CORE // ${activeProgram.title} · ${dayObj.title}`,
      `Тоннаж: ${dayTonnage} кг (${completedSetsCount}/${flatDaySets.length} подх.)`,
      ...computedDayItems.map((it, i) => {
        const desc = it.computedBlocks
          .map((b) => (b.weightKg ? `${b.weightKg}кг×${b.reps}×${b.sets}` : `${b.reps}×${b.sets}`))
          .join(', ');
        return `${i + 1}. ${it.name}: ${desc}`;
      }),
    ].join('\n');
    await NativeiOSBridge.shareText(`IRON CORE · ${activeProgram.title}`, lines);
  };

  const handleExportBackup = () => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    const payload = buildCurrentPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ironcore_full_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyBackupPayload = async (data: Partial<FullBackupPayload>, reason: string) => {
    await createSafetySnapshot(reason, buildCurrentPayload());
    if (data.programs) setPrograms(mergeBuiltInPrograms(data.programs));
    if (data.activeProgramId) setActiveProgramId(data.activeProgramId);
    if (data.programPositions) setProgramPositions(data.programPositions);
    if (data.exercises) setExercises(data.exercises);
    if (data.completedSets) setCompletedSets(data.completedSets);
    if (data.mealTemplates) setMealTemplates(data.mealTemplates);
    if (data.nutritionLog) setNutritionLog(data.nutritionLog);
    if (data.shoppingList) setShoppingList(data.shoppingList);
    if (data.iosSettings) setIosSettings((prev) => ({ ...prev, ...data.iosSettings }));
    setSnapshots(await listSafetySnapshots());
  };

  const handleImportBackup = async (file?: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Partial<FullBackupPayload>;
      await applyBackupPayload(data, `Перед импортом ${file.name}`);
      NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
      window.alert('Бэкап и все программы восстановлены! Автоснимок создан в IndexedDB.');
    } catch {
      window.alert('Ошибка чтения JSON.');
    }
  };

  const stageScale = isAnySheetOpen ? 0.952 + 0.048 * sheetDragRatio : 1;
  const stageTranslateY = isAnySheetOpen ? 8 * (1 - sheetDragRatio) : 0;
  const stageBrightness = isAnySheetOpen ? 0.65 + 0.35 * sheetDragRatio : 1;
  const stageRadius = isAnySheetOpen ? Math.round(28 * (1 - sheetDragRatio)) : 0;

  const tabsList: { id: TabId; label: string; icon: string }[] = [
    { id: 'workout', label: 'Программы', icon: '🏋️' },
    { id: 'recipes', label: 'Рецепты', icon: '🥗' },
    { id: 'fridge', label: 'Кухня', icon: '🧊' },
    { id: 'calc', label: 'Калькулятор', icon: '⚡' },
  ];
  const activeTabIdx = Math.max(0, tabsList.findIndex((t) => t.id === activeTab));

  const readinessOptions = [
    { label: '-5%', val: -5 },
    { label: '-2.5%', val: -2.5 },
    { label: '0% План', val: 0 },
    { label: '+2.5%', val: 2.5 },
  ];
  const activeReadinessIdx = Math.max(0, readinessOptions.findIndex((o) => o.val === readinessShift));

  return (
    <div className="min-h-screen relative">
      {/* ================= LIVING MIDNIGHT OBSIDIAN AURORA ================= */}
      <LivingAuroraBackdrop activeTab={activeTab} timerRunning={timerRunning} />

      {/* ================= PWA SMART UPDATE PROMPT ================= */}
      <PwaUpdateBanner hapticsEnabled={iosSettings.hapticsEnabled} />

      {/* ================= FULL-SCREEN GYM FOCUS MODE ================= */}
      <GymFocusModal
        isOpen={isGymFocusOpen}
        onClose={() => setIsGymFocusOpen(false)}
        activeProgramTitle={activeProgram.title}
        dayTitle={dayObj.title}
        nextPendingSet={nextPendingSet}
        completedCount={completedSetsCount}
        totalCount={flatDaySets.length}
        dayTonnage={dayTonnage}
        timerSec={timerSec}
        timerTotal={timerTotal}
        timerRunning={timerRunning}
        startTimer={startTimer}
        stopTimer={stopTimer}
        onCompleteSetWithOutcome={handleCompleteSetWithOutcome}
        onAdjustReadiness={(delta) => setReadinessShift((r) => Math.max(-10, Math.min(10, r + delta)))}
        readinessShift={readinessShift}
        hapticsEnabled={iosSettings.hapticsEnabled}
        soundEnabled={iosSettings.soundEffectsEnabled}
      />

      {/* ================= MEDIAPIPE GPU FORM CHECK ================= */}
      <FormCheckVision
        isOpen={isFormCheckOpen}
        onClose={() => setIsFormCheckOpen(false)}
        hapticsEnabled={iosSettings.hapticsEnabled}
      />

      {/* ================= DYNAMIC ISLAND BAR ================= */}
      <DynamicIslandBar
        expanded={islandExpanded}
        setExpanded={setIslandExpanded}
        activeProgramTitle={activeProgram.title}
        nextPendingSet={nextPendingSet}
        completedCount={completedSetsCount}
        totalCount={flatDaySets.length}
        timerSec={timerSec}
        timerTotal={timerTotal}
        timerRunning={timerRunning}
        startTimer={startTimer}
        stopTimer={stopTimer}
        onCompleteNext={handleCompleteNextSet}
        onOpenPrograms={() => {
          setProgramsSheetMode('list');
          setIsProgramsSheetOpen(true);
        }}
        onOpenSettings={() => setIsSettingsSheetOpen(true)}
        isNativeApp={isNativeApp}
        shortcutsEnabled={iosSettings.shortcutsIslandEnabled}
        hapticsEnabled={iosSettings.hapticsEnabled}
      />

      {/* ================= MAIN APP STAGE ================= */}
      <div
        style={{
          transform: `scale(${stageScale}) translateY(${stageTranslateY}px)`,
          filter: `brightness(${stageBrightness})`,
          borderRadius: `${stageRadius}px`,
          transition:
            sheetDragRatio === 0 || sheetDragRatio === 1
              ? 'transform 0.38s var(--spring-ios), filter 0.38s var(--spring-ios), border-radius 0.38s var(--spring-ios)'
              : 'none',
        }}
        className="app-stage max-w-5xl mx-auto px-4 pt-[calc(4.1rem+env(safe-area-inset-top))] sm:pt-20"
      >
        {storageBanner && (
          <div className="mb-3 px-3 py-1.5 rounded-xl slate-pill text-[11px] font-mono text-emerald-300 text-center animate-cascade">
            {storageBanner}
          </div>
        )}

        {/* ================= HEADER ================= */}
        <header
          className="animate-cascade flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4"
          style={{ animationDelay: '0ms' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl slate-card flex items-center justify-center shrink-0">
                <span className={`font-mono font-extrabold text-[11px] tracking-tight ${currentTheme.accentText}`}>
                  {activeProgram.badge}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-bold tracking-tight text-slate-50">IRON CORE</h1>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setProgramsSheetMode('list');
                      setIsProgramsSheetOpen(true);
                    }}
                    className="px-2.5 py-0.5 text-[11px] font-medium slate-pill hover:bg-slate-800/80 text-slate-100 rounded-full flex items-center gap-1 truncate max-w-[195px] active:scale-95 transition-all"
                  >
                    <span className="truncate">{activeProgram.title}</span>
                    <span className="text-[9px] text-sky-300">▾</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate">
                  Циклов: {programs.length} · Неделя {weekObj.week}/{activeProgram.weeks.length} · Жим {bench1RM} кг
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {activeTab === 'workout' && (
                <>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                      setIsFormCheckOpen(true);
                    }}
                    className="w-9 h-9 rounded-xl slate-pill text-emerald-300 flex items-center justify-center text-xs active:scale-90 transition-transform"
                    title="AI Анализ техники (Камера GPU)"
                  >
                    📷
                  </button>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setIsCloudSheetOpen(true);
                    }}
                    className="w-9 h-9 rounded-xl slate-pill text-sky-300 flex items-center justify-center text-xs active:scale-90 transition-transform"
                    title="Облако и Co-op зал"
                  >
                    ☁️
                  </button>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                      setIsGymFocusOpen(true);
                    }}
                    className="px-2.5 h-9 rounded-xl bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/35 text-sky-300 font-mono text-[11px] font-bold flex items-center gap-1 active:scale-90 transition-transform"
                    title="Крупный режим для зала"
                  >
                    <span>⚡</span>
                    <span>Зал</span>
                  </button>
                </>
              )}
              <button
                onClick={handleShareWorkout}
                className="w-9 h-9 rounded-xl slate-pill text-slate-200 flex items-center justify-center text-xs active:scale-90 transition-transform"
                title="Поделиться тренировкой"
              >
                ↗
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIsSettingsSheetOpen(true);
                }}
                className="px-2.5 h-9 rounded-xl slate-pill text-slate-100 font-mono text-[11px] flex items-center gap-1 active:scale-90 transition-transform"
              >
                <span>iOS</span>
                <span className={currentTheme.accentText}>⚙</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="grid grid-cols-3 gap-2 flex-1 sm:flex-initial">
              {exercises.map((ex) => (
                <div
                  key={ex.id}
                  className="slate-pill rounded-xl px-3 py-1.5 transition-transform focus-within:scale-[1.03]"
                >
                  <div className="text-[10px] text-slate-400 truncate">{ex.shortName}</div>
                  <div className="flex items-baseline gap-0.5">
                    <input
                      type="number"
                      step="2.5"
                      value={ex.oneRepMax || ''}
                      onChange={(e) => handleUpdate1RM(ex.id, e.target.value)}
                      className="w-12 bg-transparent font-mono tabular text-xs font-bold text-slate-50 focus:text-sky-300 focus:outline-none"
                    />
                    <span className="text-[9px] text-slate-400 font-mono">кг</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-1 slate-well rounded-xl p-1">
              {[
                { label: '60с', sec: 60 },
                { label: '3м', sec: 180 },
                { label: '5м', sec: 300 },
              ].map((t) => (
                <button
                  key={t.sec}
                  onClick={() => startTimer(t.sec)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 font-mono text-[11px] text-slate-100 active:scale-90 transition-transform"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ================= TAB 1: АКТИВНАЯ ПРОГРАММА ================= */}
        {activeTab === 'workout' && (
          <div className="space-y-4 mt-2">
            <div
              className="animate-cascade slate-card rounded-[26px] p-3.5 space-y-3"
              style={{ animationDelay: '55ms' }}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setProgramsSheetMode('list');
                    setIsProgramsSheetOpen(true);
                  }}
                  className="flex items-center gap-2 min-w-0 text-left group"
                >
                  <span className="text-xs font-bold text-slate-50 group-hover:text-sky-300 transition-colors truncate">
                    {activeProgram.title}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-900/90 text-[10px] font-mono text-sky-300 shrink-0">
                    Сменить ▾
                  </span>
                </button>
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setProgramsSheetMode('add');
                    setIsProgramsSheetOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/30 text-sky-200 text-[11px] font-semibold shrink-0 active:scale-95 transition-transform"
                >
                  + Программа
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {activeProgram.weeks.map((w) => {
                  const active = weekObj.week === w.week;
                  return (
                    <button
                      key={w.week}
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setSelectedWeek(w.week);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl font-mono tabular text-xs font-semibold shrink-0 transition-all active:scale-95 ${
                        active
                          ? 'bg-sky-400 text-slate-950 font-bold shadow-lg shadow-sky-400/25'
                          : 'bg-slate-950/75 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      Нед {w.week}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-5 space-y-4">
                <div className="animate-cascade slate-card rounded-[26px] p-4" style={{ animationDelay: '110ms' }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-100">Тренировочный день</span>
                    <span className="text-[11px] text-sky-300 font-medium truncate max-w-[180px]">{weekObj.title}</span>
                  </div>

                  <div
                    className="relative slate-well rounded-2xl p-1 grid"
                    style={{ gridTemplateColumns: `repeat(${weekObj.days.length}, minmax(0, 1fr))` }}
                  >
                    <div
                      style={{
                        width: `${100 / weekObj.days.length}%`,
                        transform: `translateX(${selectedDayIdx * 100}%)`,
                      }}
                      className="magnetic-pill absolute top-1 bottom-1 left-0 px-1 pointer-events-none"
                    >
                      <div className="w-full h-full rounded-xl bg-slate-100 shadow-lg" />
                    </div>
                    {weekObj.days.map((d, idx) => (
                      <button
                        key={`${d.day}-${idx}`}
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setSelectedDayIdx(idx);
                        }}
                        className={`relative z-10 py-2.5 px-2 rounded-xl text-xs font-bold transition-colors truncate ${
                          selectedDayIdx === idx ? 'text-slate-950' : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        {d.day}
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-slate-400/10">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-slate-400">Авто-регуляция дня:</span>
                      <span className="font-mono tabular text-xs font-bold text-sky-300">
                        {readinessShift > 0 ? `+${readinessShift}%` : `${readinessShift}%`}
                      </span>
                    </div>
                    <div className="relative slate-well rounded-xl p-1 grid grid-cols-4">
                      <div
                        style={{
                          width: '25%',
                          transform: `translateX(${activeReadinessIdx * 100}%)`,
                        }}
                        className="magnetic-pill absolute top-1 bottom-1 left-0 px-1 pointer-events-none"
                      >
                        <div className="w-full h-full rounded-lg bg-slate-800 shadow" />
                      </div>
                      {readinessOptions.map((opt) => (
                        <button
                          key={opt.val}
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setReadinessShift(opt.val);
                          }}
                          className={`relative z-10 py-1.5 rounded-lg font-mono text-[11px] font-medium transition-colors ${
                            readinessShift === opt.val ? 'text-slate-50 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* REAL THREE.JS WEBGL 3D BARBELL VISUALIZER */}
                {activePlateTarget && (
                  <div className="animate-cascade" style={{ animationDelay: '165ms' }}>
                    <BarbellWebGL3D
                      targetWeight={activePlateTarget.weight}
                      barbellWeight={activePlateTarget.barbell}
                      title={activePlateTarget.title}
                      hapticsEnabled={iosSettings.hapticsEnabled}
                      soundEnabled={iosSettings.soundEffectsEnabled}
                    />
                  </div>
                )}
              </div>

              <div
                className="lg:col-span-7 animate-cascade"
                style={{ animationDelay: '210ms' }}
                onTouchStart={handleWorkoutTouchStart}
                onTouchEnd={handleWorkoutTouchEnd}
              >
                <div
                  key={`${activeProgram.id}-${weekObj.week}-${selectedDayIdx}`}
                  className={`slate-card rounded-[26px] overflow-hidden ${
                    dayTransitionDir === 'next' ? 'animate-day-next' : 'animate-day-prev'
                  }`}
                >
                  <div className="px-4 py-3.5 border-b border-slate-400/10 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-50">{dayObj.title}</h2>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Подходов:{' '}
                        <span className="font-mono tabular text-sky-300">
                          {completedSetsCount}/{flatDaySets.length}
                        </span>{' '}
                        · свайп для смены дня
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Тоннаж</div>
                      <div className="font-mono tabular text-sm font-bold text-slate-50">
                        <AnimatedNumber value={dayTonnage} /> кг
                      </div>
                    </div>
                  </div>

                  {dayObj.warmup && dayObj.warmup.length > 0 && (
                    <div className="px-4 py-3 bg-slate-950/55 border-b border-slate-400/10">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-sky-300 font-semibold mb-1.5">
                        Разминка перед тренировкой
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dayObj.warmup.map((wLine, wIdx) => (
                          <span
                            key={wIdx}
                            className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-400/10 text-[11px] text-slate-200"
                          >
                            {wLine}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-slate-400/10">
                    {computedDayItems.map((item, idx) => {
                      const isCurrentItem = nextPendingSet?.itemIdx === idx;
                      const allBlocksDone = item.computedBlocks.every((b) =>
                        Array.from({ length: b.sets }).every((_, sIdx) => Boolean(completedSets[`${b.blockKey}-s${sIdx}`]))
                      );

                      return (
                        <div
                          key={idx}
                          className={`p-4 transition-all duration-300 ${allBlocksDone ? 'opacity-50' : 'opacity-100'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-500">{idx + 1}.</span>
                                <span className="text-sm font-semibold text-slate-50">{item.name}</span>
                                {item.isBase && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-sky-400/15 text-sky-300 border border-sky-400/25">
                                    1ПМ {item.oneRepMax} кг
                                  </span>
                                )}
                              </div>
                              {item.note && <p className="text-[11px] text-slate-400 mt-1">{item.note}</p>}
                            </div>
                          </div>

                          <div className="mt-3 space-y-2.5">
                            {item.computedBlocks.map((b, bIdx) => (
                              <div
                                key={bIdx}
                                onClick={() => {
                                  if (b.weightKg) {
                                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                    setActivePlateTarget({
                                      weight: b.weightKg,
                                      barbell: b.barbellWeight || 20,
                                      title: `${item.name} · ${b.effectivePct}% × ${b.reps} повт.`,
                                    });
                                  }
                                }}
                                className={`p-3 rounded-2xl slate-well ${
                                  b.weightKg ? 'cursor-pointer active:scale-[0.995] transition-transform' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2.5">
                                  <div className="flex items-baseline gap-2">
                                    {b.weightKg ? (
                                      <>
                                        <span
                                          className={`font-mono tabular text-lg font-extrabold tracking-tight ${
                                            isCurrentItem ? 'text-sky-300' : 'text-slate-50'
                                          }`}
                                        >
                                          <AnimatedNumber value={b.weightKg} /> кг
                                        </span>
                                        <span className="font-mono tabular text-[11px] text-slate-400">
                                          {b.effectivePct}% × {b.reps} повт. × {b.sets}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-mono tabular text-xs text-slate-300">
                                        Подсобка: {b.reps} повт. × {b.sets} подх.
                                      </span>
                                    )}
                                  </div>
                                  {b.weightKg && <span className="text-[10px] font-mono text-sky-300/80">В 3D-сцену →</span>}
                                </div>

                                <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                                  {Array.from({ length: b.sets }).map((_, sIdx) => {
                                    const setKey = `${b.blockKey}-s${sIdx}`;
                                    const done = Boolean(completedSets[setKey]);
                                    const isNextFocus = nextPendingSet?.setKey === setKey;
                                    const showBurst = recentBurstSetKey === setKey;
                                    return (
                                      <button
                                        key={sIdx}
                                        onClick={() => toggleSet(setKey, item.isBase, b.effectivePct)}
                                        className={`liquid-set-btn h-10 min-w-[70px] px-3 rounded-xl font-mono tabular text-xs font-bold flex items-center justify-center gap-1 active:scale-90 ${
                                          done
                                            ? 'is-done text-emerald-200 border border-emerald-400/35'
                                            : isNextFocus
                                            ? 'bg-slate-900 text-slate-50 next-set-beacon'
                                            : 'bg-slate-950/90 border border-slate-400/10 text-slate-300 hover:text-white'
                                        }`}
                                      >
                                        {showBurst && <span className="set-shockwave" />}
                                        <span className="relative z-10">{done ? '✓' : `#${sIdx + 1}`}</span>
                                        <span className="relative z-10 opacity-50">·</span>
                                        <span className="relative z-10">{b.reps}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: РЕЦЕПТЫ ================= */}
        {activeTab === 'recipes' && (
          <div className="mt-2 space-y-4">
            <div
              className="animate-cascade slate-card rounded-[26px] p-4 flex items-center justify-between gap-3"
              style={{ animationDelay: '40ms' }}
            >
              <div>
                <h2 className="text-sm font-bold text-slate-50">Рецепты · «Пп головного мозга»</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Категория: <span className="text-amber-300 font-medium">{recipeCategory}</span> ({filteredRecipes.length}{' '}
                  блюд)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={foodPhotoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handleFoodPhotoUpload(e.target.files?.[0])}
                />
                <button
                  disabled={aiFoodLoading}
                  onClick={() => foodPhotoInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-bold active:scale-95 transition-transform"
                >
                  {aiFoodLoading ? 'AI...' : '📸 Фото еды'}
                </button>
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setIsFilterSheetOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl slate-pill hover:bg-slate-800 text-xs font-semibold text-slate-100 active:scale-95 transition-transform"
                >
                  Фильтры
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredRecipes.map((meal, idx) => (
                <div
                  key={meal.id}
                  style={{ animationDelay: `${80 + idx * 35}ms` }}
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setRecipePortionScale(1);
                    setActiveRecipeSheet(meal);
                  }}
                  className="animate-cascade slate-card rounded-[26px] p-4 cursor-pointer transition-transform active:scale-[0.985] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-full bg-amber-400/15 text-amber-200 border border-amber-400/25">
                        {meal.category}
                      </span>
                      {meal.video && (
                        <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-900/90 text-slate-300">
                          ▶ Видео
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-slate-50 leading-snug">{meal.name}</h3>
                    <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">{meal.ingredients}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-400/10 flex items-center justify-between gap-2">
                    <div className="font-mono tabular text-xs">
                      <span className="font-bold text-amber-300">{meal.kcal} ккал</span>
                      <span className="text-slate-400 ml-2">
                        Б {meal.p} · Ж {meal.f} · У {meal.c}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addRecipeIngredientsToShoppingList(meal);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-mono text-xs active:scale-90 transition-transform"
                        title="В список покупок"
                      >
                        🛒
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addMealToLog(meal, 1);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono text-xs font-extrabold active:scale-90 transition-transform"
                      >
                        + В рацион
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: КУХНЯ (ХОЛОДИЛЬНИК + РАЦИОН + СПИСОК ПОКУПОК) ================= */}
        {activeTab === 'fridge' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-2">
            <div className="lg:col-span-6 space-y-4 animate-cascade" style={{ animationDelay: '50ms' }}>
              <div className="slate-card rounded-[26px] p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-slate-50">Холодильник · Что есть дома?</h2>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setSelectedFridgeItems([]);
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                  >
                    Сбросить
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {FRIDGE_PRODUCTS.map((prod) => {
                    const active = selectedFridgeItems.includes(prod.id);
                    return (
                      <button
                        key={prod.id}
                        onClick={() => toggleFridgeItem(prod.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-90 ${
                          active
                            ? 'bg-teal-400 text-slate-950 font-bold shadow-md shadow-teal-400/20'
                            : 'slate-well text-slate-300 hover:text-white'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {prod.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-400/10 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    Подходящие рецепты ({fridgeMatchedRecipes.length}):
                  </div>
                  {fridgeMatchedRecipes.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setRecipePortionScale(1);
                        setActiveRecipeSheet(m);
                      }}
                      className="p-3 rounded-2xl slate-well cursor-pointer flex items-center justify-between gap-2 active:scale-[0.99] transition-transform"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-50 truncate">{m.name}</div>
                        <div className="font-mono text-[10px] text-teal-300 mt-0.5">
                          Совпадений: {m.hits} · {m.kcal} ккал (Б {m.p}г)
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addMealToLog(m, 1);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-teal-400/20 text-teal-200 font-mono text-xs font-bold shrink-0 active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Interactive Shopping List Card */}
              <div className="slate-card rounded-[26px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-50">
                    Список покупок ({shoppingList.filter((i) => !i.done).length})
                  </h3>
                  {shoppingList.length > 0 && (
                    <button
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setShoppingList((prev) => prev.filter((i) => !i.done));
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                    >
                      Убрать купленное
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Добавить продукт (напр. Творог 500 г)..."
                    value={newShoppingInput}
                    onChange={(e) => setNewShoppingInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddManualShoppingItem()}
                    className="flex-1 slate-well rounded-xl px-3 py-2 text-xs text-slate-50 focus:outline-none"
                  />
                  <button
                    onClick={handleAddManualShoppingItem}
                    className="px-3.5 py-2 rounded-xl bg-teal-400 text-slate-950 font-mono text-xs font-extrabold active:scale-90"
                  >
                    +
                  </button>
                </div>

                {shoppingList.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2">
                    Пусто. Нажми «🛒» на любом рецепте, чтобы закинуть продукты сюда.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {shoppingList.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setShoppingList((prev) =>
                            prev.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it))
                          );
                        }}
                        className={`px-3 py-2 rounded-xl slate-well text-xs flex items-center justify-between gap-2 cursor-pointer transition-opacity ${
                          item.done ? 'opacity-45 line-through' : 'opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center font-mono text-[10px] shrink-0 ${
                              item.done ? 'bg-teal-400 text-slate-950 font-bold' : 'bg-slate-800'
                            }`}
                          >
                            {item.done ? '✓' : ''}
                          </span>
                          <span className="text-slate-100 truncate">{item.text}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShoppingList((prev) => prev.filter((it) => it.id !== item.id));
                          }}
                          className="text-slate-500 hover:text-white font-mono px-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-6 space-y-4 animate-cascade" style={{ animationDelay: '110ms' }}>
              <div className="slate-card rounded-[26px] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-slate-400">Рацион за сегодня</div>
                    <div className="font-mono tabular text-2xl font-bold text-slate-50 mt-0.5">
                      <AnimatedNumber value={nutritionTotals.kcal} />{' '}
                      <span className="text-sm font-normal text-slate-400">/ {targetKcal} ккал</span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1 slate-well rounded-xl px-3 py-1.5">
                    <span className="text-[10px] text-slate-400 mr-1">Вес:</span>
                    <input
                      type="number"
                      step="0.1"
                      value={nutritionLog.bodyweight}
                      onChange={(e) =>
                        setNutritionLog((prev) => ({ ...prev, bodyweight: parseFloat(e.target.value) || 0 }))
                      }
                      className="w-12 bg-transparent font-mono tabular text-sm font-bold text-slate-50 text-right focus:outline-none"
                    />
                    <span className="text-[11px] font-mono text-slate-400">кг</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setNutritionLog((p) => ({ ...p, dayType: 'workout' }));
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                      nutritionLog.dayType === 'workout'
                        ? 'bg-teal-400 text-slate-950 font-bold'
                        : 'slate-well text-slate-300'
                    }`}
                  >
                    Тренировочный (3000)
                  </button>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setNutritionLog((p) => ({ ...p, dayType: 'rest' }));
                    }}
                    className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                      nutritionLog.dayType === 'rest'
                        ? 'bg-teal-400 text-slate-950 font-bold'
                        : 'slate-well text-slate-300'
                    }`}
                  >
                    День отдыха (2500)
                  </button>
                </div>

                <div className="w-full h-2.5 slate-well rounded-full overflow-hidden mb-5">
                  <div
                    style={{ width: `${Math.min(100, (nutritionTotals.kcal / targetKcal) * 100)}%` }}
                    className="h-full bg-gradient-to-r from-teal-400 to-sky-400 transition-all duration-300"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-2xl slate-well">
                    <div className="text-[11px] text-slate-400">Белки</div>
                    <div className="font-mono tabular text-base font-bold text-teal-300 mt-0.5">
                      <AnimatedNumber value={Math.round(nutritionTotals.p)} /> / {targetProtein} г
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl slate-well">
                    <div className="text-[11px] text-slate-400">Жиры</div>
                    <div className="font-mono tabular text-base font-bold text-slate-50 mt-0.5">
                      <AnimatedNumber value={Math.round(nutritionTotals.f)} /> г
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl slate-well">
                    <div className="text-[11px] text-slate-400">Углеводы</div>
                    <div className="font-mono tabular text-base font-bold text-slate-50 mt-0.5">
                      <AnimatedNumber value={Math.round(nutritionTotals.c)} /> г
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-400/10 space-y-1.5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-300">Съедено сегодня:</span>
                    {nutritionLog.entries.length > 0 && (
                      <button
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setNutritionLog((p) => ({ ...p, entries: [] }));
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                  {nutritionLog.entries.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3">Пока пусто. Добавь блюда из «Рецептов».</div>
                  ) : (
                    nutritionLog.entries.map((item, idx) => (
                      <div
                        key={item.uid || idx}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl slate-well text-xs"
                      >
                        <span className="text-slate-100 truncate pr-2">{item.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono tabular text-slate-300">{item.kcal} ккал</span>
                          <button
                            onClick={() => {
                              NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                              setNutritionLog((p) => ({
                                ...p,
                                entries: p.entries.filter((_, i) => i !== idx),
                              }));
                            }}
                            className="text-slate-400 hover:text-white font-mono"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: КАЛЬКУЛЯТОР 1ПМ, DOTS & БЭКАП ================= */}
        {activeTab === 'calc' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-2">
            <div
              className="lg:col-span-7 animate-cascade slate-card rounded-[26px] p-5"
              style={{ animationDelay: '50ms' }}
            >
              <h2 className="text-sm font-semibold text-slate-50">Твои 1ПМ: Жим, Присед, Становая</h2>
              <p className="text-xs text-slate-400 mt-1">
                Любое изменение мгновенно пересчитывает веса во всех программах.
              </p>
              <div className="mt-4 space-y-3">
                {exercises.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between p-3.5 rounded-2xl slate-well">
                    <div>
                      <div className="text-sm font-medium text-slate-50">{ex.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        Гриф {ex.barbellWeight} кг · Шаг 2.5 кг
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdate1RM(ex.id, ex.oneRepMax - 2.5)}
                        className="w-9 h-9 rounded-xl bg-slate-900 font-mono text-xs text-slate-200 active:scale-90 transition-transform"
                      >
                        -2.5
                      </button>
                      <div className="flex items-baseline bg-slate-950/90 border border-slate-400/15 rounded-xl px-3 py-1.5">
                        <input
                          type="number"
                          step="2.5"
                          value={ex.oneRepMax || ''}
                          onChange={(e) => handleUpdate1RM(ex.id, e.target.value)}
                          className="w-16 text-center bg-transparent font-mono tabular text-base font-bold text-violet-300 focus:outline-none"
                        />
                        <span className="text-xs text-slate-400 font-mono">кг</span>
                      </div>
                      <button
                        onClick={() => handleUpdate1RM(ex.id, ex.oneRepMax + 2.5)}
                        className="w-9 h-9 rounded-xl bg-slate-900 font-mono text-xs text-slate-200 active:scale-90 transition-transform"
                      >
                        +2.5
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-400/10">
                <div className="p-3.5 rounded-2xl slate-well">
                  <div className="text-[10px] uppercase text-slate-400">Сумма троеборья (SBD)</div>
                  <div className="font-mono tabular text-xl font-bold text-slate-50 mt-1">
                    <AnimatedNumber value={sbdTotal} /> кг
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl slate-well">
                  <div className="text-[10px] uppercase text-slate-400">Коэффициент DOTS</div>
                  <div className="font-mono tabular text-xl font-bold text-violet-300 mt-1">
                    <AnimatedNumber value={dotsScore} decimals={1} />
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4 animate-cascade" style={{ animationDelay: '110ms' }}>
              <div className="slate-card rounded-[26px] p-5">
                <h3 className="text-sm font-semibold text-slate-50">Калькулятор e1RM (Эпли / Бжицки)</h3>
                <div className="mt-3">
                  <select
                    value={calcExId}
                    onChange={(e) => setCalcExId(e.target.value as ExerciseId)}
                    className="w-full slate-well rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none"
                  >
                    {exercises.map((ex) => (
                      <option key={ex.id} value={ex.id} className="bg-slate-950">
                        {ex.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="slate-well rounded-xl p-3">
                    <label className="text-[11px] text-slate-400 block">Вес (кг)</label>
                    <input
                      type="number"
                      step="2.5"
                      value={calcWeight}
                      onChange={(e) => setCalcWeight(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 bg-transparent font-mono tabular text-lg font-bold text-slate-50 focus:outline-none"
                    />
                  </div>
                  <div className="slate-well rounded-xl p-3">
                    <label className="text-[11px] text-slate-400 block">Повторения</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={calcReps}
                      onChange={(e) => setCalcReps(parseInt(e.target.value, 10) || 1)}
                      className="w-full mt-1 bg-transparent font-mono tabular text-lg font-bold text-slate-50 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="mt-4 p-4 rounded-2xl slate-well flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-slate-400">Расчетный 1ПМ:</div>
                    <div className="font-mono tabular text-2xl font-bold text-violet-300">
                      <AnimatedNumber value={calculateE1RM(calcWeight, calcReps)} decimals={1} /> кг
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      handleUpdate1RM(calcExId, roundToStep(calculateE1RM(calcWeight, calcReps), 2.5, 20))
                    }
                    className="px-3.5 py-2.5 rounded-xl bg-violet-400 hover:bg-violet-300 text-slate-950 text-xs font-extrabold active:scale-90 transition-transform"
                  >
                    В базу 1ПМ
                  </button>
                </div>
              </div>

              <div className="slate-card rounded-[26px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">IndexedDB · Бэкап JSON:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportBackup}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-950 text-xs font-semibold active:scale-95"
                    >
                      Экспорт
                    </button>
                    <button
                      onClick={() => importJsonRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-slate-200 text-xs active:scale-95"
                    >
                      Импорт
                    </button>
                    <input
                      ref={importJsonRef}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => void handleImportBackup(e.target.files?.[0])}
                    />
                  </div>
                </div>

                {snapshots.length > 0 && (
                  <div className="pt-2.5 border-t border-slate-400/10">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                      Автоснимки базы ({snapshots.length}):
                    </div>
                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {snapshots.slice(0, 3).map((snap) => (
                        <div
                          key={snap.id}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg slate-well text-[11px]"
                        >
                          <span className="text-slate-300 truncate pr-2">{snap.reason}</span>
                          <button
                            onClick={() => void applyBackupPayload(snap.payload, 'Откат к снимку')}
                            className="text-violet-300 hover:underline font-mono shrink-0"
                          >
                            Откатить
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= BOTTOM SHEET: МЕНЕДЖЕР ПРОГРАММ ================= */}
      <BottomSheet
        isOpen={isProgramsSheetOpen}
        onClose={() => setIsProgramsSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title={programsSheetMode === 'list' ? 'Мои программы тренировок' : 'Добавить новую программу'}
        subtitle="Мульти-цикл · Автопересчет от 1ПМ"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="relative grid grid-cols-2 p-1 slate-well rounded-xl my-3">
          <div
            style={{
              width: '50%',
              transform: `translateX(${programsSheetMode === 'list' ? 0 : 100}%)`,
            }}
            className="magnetic-pill absolute top-1 bottom-1 left-0 px-1 pointer-events-none"
          >
            <div className="w-full h-full rounded-lg bg-slate-800 shadow" />
          </div>
          <button
            onClick={() => {
              NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
              setProgramsSheetMode('list');
            }}
            className={`relative z-10 py-2 rounded-lg text-xs font-semibold transition-colors ${
              programsSheetMode === 'list' ? 'text-slate-50' : 'text-slate-400'
            }`}
          >
            Список ({programs.length})
          </button>
          <button
            onClick={() => {
              NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
              setProgramsSheetMode('add');
            }}
            className={`relative z-10 py-2 rounded-lg text-xs font-semibold transition-colors ${
              programsSheetMode === 'add' ? 'text-slate-50' : 'text-slate-400'
            }`}
          >
            + Добавить новую
          </button>
        </div>

        {programsSheetMode === 'list' ? (
          <div className="space-y-2.5 mt-2">
            {programs.map((prog) => {
              const isActive = prog.id === activeProgram.id;
              const pos = programPositions[prog.id] || { week: 1, dayIdx: 0 };
              return (
                <div
                  key={prog.id}
                  onClick={() => handleSwitchProgram(prog.id)}
                  className={`p-3.5 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-3 active:scale-[0.985] ${
                    isActive ? 'bg-sky-400/15 border border-sky-400/40 shadow-lg' : 'slate-well hover:bg-slate-900/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                        isActive ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-200'
                      }`}
                    >
                      {prog.badge}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-50 truncate">{prog.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {prog.description} · сейчас Нед {pos.week}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isActive && (
                      <span className="px-2 py-0.5 rounded-full bg-sky-400 text-slate-950 font-mono text-[10px] font-extrabold">
                        АКТИВНА
                      </span>
                    )}
                    {!prog.isBuiltIn && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteProgram(prog.id);
                        }}
                        className="w-8 h-8 rounded-lg bg-slate-900 text-slate-300 hover:text-white font-mono text-xs flex items-center justify-center"
                        title="Удалить программу"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3 mt-2 text-xs">
            <div>
              <div className="text-[11px] text-slate-400 mb-1.5">Быстрые шаблоны (нажми для примера):</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROGRAM_PRESETS.map((pr, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setNewProgTitle(pr.title);
                      setNewProgBadge(pr.badge);
                      setNewProgRawText(pr.text);
                      setPdfImportStatus('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg slate-well hover:bg-slate-900 text-[11px] text-sky-300 font-medium active:scale-95"
                  >
                    ⚡ {pr.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] text-slate-400 block mb-1">Название программы:</label>
                <input
                  type="text"
                  placeholder="Напр. Русский цикл 6 нед"
                  value={newProgTitle}
                  onChange={(e) => setNewProgTitle(e.target.value)}
                  className="w-full slate-well rounded-xl px-3 py-2 text-xs text-slate-50 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Бейдж:</label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="5×5"
                  value={newProgBadge}
                  onChange={(e) => setNewProgBadge(e.target.value)}
                  className="w-full slate-well rounded-xl px-3 py-2 font-mono text-xs text-sky-300 uppercase focus:outline-none"
                />
              </div>
            </div>

            <div
              onClick={() => pdfFileInputRef.current?.click()}
              className="slate-well rounded-xl p-3 text-center cursor-pointer hover:bg-slate-900/80 transition-colors"
            >
              <input
                ref={pdfFileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => void handlePdfProgramUpload(e.target.files?.[0])}
              />
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs font-medium text-slate-100">📄 Загрузить PDF</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    progPhotoInputRef.current?.click();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-400/20 border border-sky-400/35 text-sky-200 text-[11px] font-bold"
                >
                  📸 Фото программы (AI)
                </button>
                <input
                  ref={progPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleProgramPhotoUpload(e.target.files?.[0])}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Или вставь текст в любом формате: «Жим 5х5 @ 80%» или «Жим 75х3х5»
              </div>
              {pdfImportStatus && <div className="mt-1.5 text-[11px] font-mono text-sky-300">{pdfImportStatus}</div>}
            </div>

            <div>
              <textarea
                rows={7}
                value={newProgRawText}
                onChange={(e) => setNewProgRawText(e.target.value)}
                placeholder={`Неделя 1
Пн
Присед 4х6 @ 77.5%
Жим лежа 5х5 @ 80%
Подтягивания 4х10
Ср
Становая тяга 4х4 @ 82.5%`}
                className="w-full slate-well rounded-xl p-3 font-mono text-[11px] text-slate-100 leading-relaxed focus:outline-none"
              />
            </div>

            <div className="p-3 rounded-xl slate-well flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Распознано парсером:</span>
              {parsedNewStats.wCount > 0 ? (
                <span className="font-mono text-[11px] font-bold text-sky-300">
                  {parsedNewStats.wCount} нед · {parsedNewStats.dCount} дн · {parsedNewStats.exCount} упр
                </span>
              ) : (
                <span className="font-mono text-[11px] text-slate-500">Жду текст программы...</span>
              )}
            </div>

            <button
              disabled={parsedNewStats.wCount === 0}
              onClick={() => void handleSaveNewProgram()}
              className={`w-full py-3.5 rounded-xl text-xs font-extrabold transition-all active:scale-95 ${
                parsedNewStats.wCount > 0
                  ? 'bg-sky-400 hover:bg-sky-300 text-slate-950 shadow-lg shadow-sky-400/25'
                  : 'bg-slate-900 text-slate-500 cursor-not-allowed'
              }`}
            >
              Сохранить и переключиться на программу ✓
            </button>
          </div>
        )}
      </BottomSheet>

      {/* ================= BOTTOM SHEET: КАРТОЧКА РЕЦЕПТА ================= */}
      <BottomSheet
        isOpen={Boolean(activeRecipeSheet)}
        onClose={() => setActiveRecipeSheet(null)}
        onDragProgress={setSheetDragRatio}
        title={activeRecipeSheet?.name || ''}
        subtitle={activeRecipeSheet ? `${activeRecipeSheet.category} · ${activeRecipeSheet.portionNote}` : ''}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        {activeRecipeSheet && (
          <div>
            <div className="flex items-center justify-between slate-well rounded-xl p-2 mb-3">
              <span className="text-[11px] text-slate-400 pl-2">Размер порции:</span>
              <div className="flex gap-1">
                {[0.5, 1, 1.5, 2].map((sc) => (
                  <button
                    key={sc}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setRecipePortionScale(sc);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition-all ${
                      recipePortionScale === sc ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-900 text-slate-300'
                    }`}
                  >
                    {sc}×
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 my-3">
              <div className="p-2.5 rounded-xl slate-well text-center">
                <div className="text-[10px] text-slate-400">Калории</div>
                <div className="font-mono tabular text-sm font-bold text-amber-300">
                  <AnimatedNumber value={Math.round(activeRecipeSheet.kcal * recipePortionScale)} />
                </div>
              </div>
              <div className="p-2.5 rounded-xl slate-well text-center">
                <div className="text-[10px] text-slate-400">Белки</div>
                <div className="font-mono tabular text-sm font-bold text-slate-50">
                  <AnimatedNumber value={Math.round(activeRecipeSheet.p * recipePortionScale)} /> г
                </div>
              </div>
              <div className="p-2.5 rounded-xl slate-well text-center">
                <div className="text-[10px] text-slate-400">Жиры</div>
                <div className="font-mono tabular text-sm font-bold text-slate-50">
                  <AnimatedNumber value={Math.round(activeRecipeSheet.f * recipePortionScale)} /> г
                </div>
              </div>
              <div className="p-2.5 rounded-xl slate-well text-center">
                <div className="text-[10px] text-slate-400">Углеводы</div>
                <div className="font-mono tabular text-sm font-bold text-slate-50">
                  <AnimatedNumber value={Math.round(activeRecipeSheet.c * recipePortionScale)} /> г
                </div>
              </div>
            </div>

            {activeRecipeSheet.video && (
              <div className="my-3 rounded-2xl overflow-hidden bg-slate-950">
                <video
                  src={activeRecipeSheet.video}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-60 object-contain"
                />
              </div>
            )}

            <div className="mt-3 p-3.5 rounded-2xl slate-well">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-200">Ингредиенты (отмечай тапом):</span>
                <button
                  onClick={() => addRecipeIngredientsToShoppingList(activeRecipeSheet)}
                  className="text-[11px] font-mono text-amber-300 hover:underline"
                >
                  + В список покупок 🛒
                </button>
              </div>
              <div className="space-y-1.5">
                {activeRecipeSheet.ingredients.split(',').map((ing, i) => {
                  const cleanIng = ing.trim().replace(/\.$/, '');
                  if (!cleanIng) return null;
                  const isChecked = Boolean(checkedIngredients[`${activeRecipeSheet.id}-${i}`]);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleIngredientCheck(activeRecipeSheet.id, i)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2.5 transition-all ${
                        isChecked ? 'bg-slate-950/60 text-slate-500 line-through' : 'bg-slate-900/90 text-slate-100'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center font-mono text-[10px] ${
                          isChecked ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-800'
                        }`}
                      >
                        {isChecked ? '✓' : ''}
                      </span>
                      <span>{cleanIng}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 p-3.5 rounded-2xl slate-well text-xs">
              <div className="text-[11px] font-semibold text-slate-200 mb-1">Приготовление:</div>
              <p className="text-slate-300 leading-relaxed">{activeRecipeSheet.steps}</p>
            </div>

            <button
              onClick={() => {
                addMealToLog(activeRecipeSheet, recipePortionScale);
                setActiveRecipeSheet(null);
              }}
              className="w-full mt-4 py-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold shadow-lg shadow-amber-400/20 active:scale-95 transition-transform"
            >
              + В рацион ({Math.round(activeRecipeSheet.kcal * recipePortionScale)} ккал)
            </button>
          </div>
        )}
      </BottomSheet>

      {/* ================= BOTTOM SHEET: ФИЛЬТРЫ ================= */}
      <BottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="Фильтр рецептов"
        subtitle="Пп головного мозга"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {['Все', 'Завтрак', 'Обед', 'Ужин', 'Десерты', 'Салаты', 'Выпечка'].map((cat) => (
            <button
              key={cat}
              onClick={() => {
                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                setRecipeCategory(cat);
                setIsFilterSheetOpen(false);
              }}
              className={`py-3 px-4 rounded-xl text-xs font-semibold text-left flex items-center justify-between transition-all ${
                recipeCategory === cat ? 'bg-amber-400 text-slate-950 font-bold' : 'slate-well text-slate-200'
              }`}
            >
              <span>{cat}</span>
              {recipeCategory === cat && <span>✓</span>}
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* ================= BOTTOM SHEET: НАСТРОЙКИ iOS & DYNAMIC ISLAND ================= */}
      <BottomSheet
        isOpen={isSettingsSheetOpen}
        onClose={() => setIsSettingsSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="Функции iPhone & WebGL 3D"
        subtitle={isNativeApp ? 'Режим: Native Capacitor + ActivityKit' : 'Режим: iOS PWA + Three.js WebGL'}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-3 mt-2 text-xs">
          <div className="p-3.5 rounded-2xl slate-well flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-50">Тактильный отклик (Taptic Engine)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Микровибрация iOS 18+ при кликах и подходах</div>
            </div>
            <button
              onClick={() => {
                const next = !iosSettings.hapticsEnabled;
                setIosSettings((s) => ({ ...s, hapticsEnabled: next }));
                NativeiOSBridge.haptic('medium', next);
              }}
              className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                iosSettings.hapticsEnabled ? 'bg-sky-400' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  iosSettings.hapticsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="p-3.5 rounded-2xl slate-well flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-50">Звук железа и таймера (Web Audio)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Лёгкий лязг блинов в 3D-сцене и сигнал отдыха</div>
            </div>
            <button
              onClick={() => {
                const next = !iosSettings.soundEffectsEnabled;
                setIosSettings((s) => ({ ...s, soundEffectsEnabled: next }));
                if (next) NativeiOSBridge.playPlateClank(true, 1.0);
              }}
              className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                iosSettings.soundEffectsEnabled ? 'bg-sky-400' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  iosSettings.soundEffectsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="p-3.5 rounded-2xl slate-well flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-50">Не гасить экран (Wake Lock)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Держит экран активным между подходами и на кухне</div>
            </div>
            <button
              onClick={() => {
                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                setIosSettings((s) => ({ ...s, wakeLockEnabled: !s.wakeLockEnabled }));
              }}
              className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                iosSettings.wakeLockEnabled ? 'bg-sky-400' : 'bg-slate-800'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  iosSettings.wakeLockEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="p-3.5 rounded-2xl slate-well space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-50">Фоновые Push-уведомления (Web Push)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Сигнал об окончании отдыха на экране блокировки</div>
              </div>
              <button
                onClick={async () => {
                  const res = await enableBackgroundPush();
                  setPushStatus(res.message);
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-400 text-slate-950 font-bold shrink-0 active:scale-90"
              >
                Включить
              </button>
            </div>
            {pushStatus && <div className="font-mono text-[10px] text-sky-300">{pushStatus}</div>}
          </div>

          <div className="p-3.5 rounded-2xl slate-well space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-50">Системный Dynamic Island (Команды)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Запускает родной таймер iPhone прямо в вырезе и на экране блокировки
                </div>
              </div>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIosSettings((s) => ({ ...s, shortcutsIslandEnabled: !s.shortcutsIslandEnabled }));
                }}
                className={`w-12 h-7 rounded-full p-1 transition-colors shrink-0 ${
                  iosSettings.shortcutsIslandEnabled ? 'bg-sky-400' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    iosSettings.shortcutsIslandEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {iosSettings.shortcutsIslandEnabled && (
              <div className="pt-2.5 border-t border-slate-400/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">Имя команды в iOS:</span>
                  <input
                    type="text"
                    value={iosSettings.shortcutName}
                    onChange={(e) => setIosSettings((s) => ({ ...s, shortcutName: e.target.value }))}
                    className="w-36 bg-slate-900 rounded-lg px-2 py-1 font-mono text-xs text-slate-50"
                  />
                </div>
                <button
                  onClick={() => NativeiOSBridge.triggerShortcutsDynamicIslandTimer(60, iosSettings.shortcutName)}
                  className="w-full py-2 rounded-lg bg-slate-900 text-sky-300 font-semibold"
                >
                  Проверить таймер 60с в Dynamic Island ↗
                </button>
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      
      {/* ================= BOTTOM SHEET: ОБЛАКО & CO-OP REALTIME ================= */}
      <BottomSheet
        isOpen={isCloudSheetOpen}
        onClose={() => setIsCloudSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="Облако Supabase & Co-op Зал"
        subtitle={isCloudConfigured() ? 'Подключено к Supabase Realtime' : 'Требуются ключи Supabase в Vercel'}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-3 mt-2 text-xs">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Код синхронизации / Комнаты:</label>
            <input
              type="text"
              value={syncCode}
              onChange={(e) => setSyncCode(e.target.value)}
              placeholder="max-iron"
              className="w-full slate-well rounded-xl px-3 py-2.5 font-mono text-xs text-sky-300 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                setCloudStatus('Отправка в облако...');
                const res = await pushBackupToCloud(syncCode, buildCurrentPayload());
                setCloudStatus(res.ok ? 'Сохранено в Supabase ✓' : res.error || 'Ошибка');
              }}
              className="py-2.5 rounded-xl bg-sky-400 text-slate-950 font-extrabold active:scale-95"
            >
              ☁️ Выгрузить
            </button>
            <button
              onClick={async () => {
                setCloudStatus('Загрузка из облака...');
                const res = await pullBackupFromCloud(syncCode);
                if (res.ok && res.payload) {
                  await applyBackupPayload(res.payload, 'Загрузка из Supabase');
                  setCloudStatus('Данные загружены с облака ✓');
                } else {
                  setCloudStatus(res.error || 'Ошибка');
                }
              }}
              className="py-2.5 rounded-xl slate-well text-slate-100 font-bold active:scale-95"
            >
              ⬇️ Загрузить
            </button>
          </div>

          <div className="pt-2 border-t border-slate-400/10 space-y-2">
            <button
              onClick={handleToggleLiveRoom}
              className={`w-full py-3 rounded-xl font-extrabold active:scale-95 transition-all ${
                isInLiveRoom ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 border border-sky-400/30 text-sky-300'
              }`}
            >
              {isInLiveRoom ? '🟢 В Live-зале (Отключиться)' : '🤝 Войти в Co-op зал с другом'}
            </button>

            {livePeers.length > 0 && (
              <div className="space-y-1.5">
                {livePeers.map((p, i) => (
                  <div key={i} className="p-2.5 rounded-xl slate-well flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-100">{p.name}</div>
                      <div className="text-[10px] text-slate-400">{p.exercise}</div>
                    </div>
                    <div className="font-mono text-xs text-emerald-300">
                      {p.weightKg ? `${p.weightKg} кг × ${p.reps}` : `${p.completedSets}/${p.totalSets}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cloudStatus && (
            <div className="p-2.5 rounded-xl slate-well font-mono text-[11px] text-sky-300">{cloudStatus}</div>
          )}
        </div>
      </BottomSheet>

      {/* ================= FLOATING ACTION BAR: «СЛЕДУЮЩИЙ ПОДХОД» + «ЗАЛ» ================= */}
      {activeTab === 'workout' && (
        <div className="fixed bottom-[calc(4.65rem+env(safe-area-inset-bottom))] left-0 right-0 px-4 z-40 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto">
            <div className="ios-glass-card rounded-[22px] p-2.5 flex items-center justify-between gap-2">
              {nextPendingSet ? (
                <>
                  <div className="pl-2 min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider text-sky-300 truncate font-semibold">
                      {nextPendingSet.exerciseName}
                    </div>
                    <div className="font-mono tabular text-sm font-bold text-slate-50 truncate">
                      {nextPendingSet.weightKg
                        ? `${nextPendingSet.weightKg} кг × ${nextPendingSet.reps} повт. (#${nextPendingSet.setNumber})`
                        : `${nextPendingSet.reps} повт. · Подход #${nextPendingSet.setNumber}`}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setIsGymFocusOpen(true);
                    }}
                    className="shrink-0 px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-400/15 text-sky-300 text-xs font-bold active:scale-90 transition-transform"
                    title="Открыть крупный режим зала"
                  >
                    Фокус
                  </button>
                  <button
                    onClick={handleCompleteNextSet}
                    className="shrink-0 px-3.5 py-2.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-extrabold tracking-tight shadow-lg shadow-sky-400/25 active:scale-90 transition-transform"
                  >
                    Подход ✓
                  </button>
                </>
              ) : (
                <div className="w-full py-1.5 text-center text-xs font-bold text-emerald-300">
                  Все подходы сегодняшней тренировки выполнены 🎉
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= FIXED iOS TAB BAR WITH MAGNETIC SLIDING CAPSULE ================= */}
      <nav className="fixed bottom-0 left-0 right-0 ios-blur-bar px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] z-50">
        <div className="relative max-w-xl mx-auto grid grid-cols-4">
          <div
            style={{
              width: '25%',
              transform: `translateX(${activeTabIdx * 100}%)`,
            }}
            className="magnetic-pill absolute inset-y-0 left-0 px-1 pointer-events-none"
          >
            <div className="w-full h-full rounded-2xl bg-slate-900 border border-slate-400/15 shadow-inner" />
          </div>

          {tabsList.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id !== activeTab) {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setActiveTab(tab.id);
                  }
                }}
                className={`relative z-10 py-1.5 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${
                  isActive ? 'text-slate-50 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-sm leading-none">{tab.icon}</span>
                <span className="text-[11px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
