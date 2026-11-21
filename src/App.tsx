import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedNumber } from './components/AnimatedNumber';
import { HeroShowcaseV2, type HeroScheduleItem } from './components/HeroShowcaseV2';
const BarbellWebGL3D = lazy(() => import('./components/BarbellWebGL3D').then((m) => ({ default: m.BarbellWebGL3D })));
import { BottomSheet } from './components/BottomSheet';
import { DynamicIslandBar, PendingSetInfo } from './components/DynamicIslandBar';
const FormCheckVision = lazy(() => import('./components/FormCheckVision').then((m) => ({ default: m.FormCheckVision })));
const GymFocusModal = lazy(() => import('./components/GymFocusModal').then((m) => ({ default: m.GymFocusModal })));
import type { HudTelemetryTarget } from './components/HudVideoRecorder';
const HudVideoRecorder = lazy(() => import('./components/HudVideoRecorder').then((m) => ({ default: m.HudVideoRecorder })));
import {
  BoltIcon,
  CameraIcon,
  ClockIcon,
  DropletIcon,
  HeartIcon,
  SearchIcon,
  SparklesIcon,
  CartIcon,
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  Cube3DIcon,
  DownloadIcon,
  DumbbellIcon,
  FileTextIcon,
  FilterIcon,
  FlameIcon,
  FridgeIcon,
  MicIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SaladIcon,
  SaveIcon,
  SettingsIcon,
  ShareIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
  VideoIcon,
} from './components/Icons';
import { analyzeFoodPhotoAI, analyzeProgramPhotoAI } from './services/aiVision';
import {
  isCloudConfigured,
  joinLiveGymRoom,
  LiveGymPeerState,
  pullBackupFromCloud,
  pushBackupToCloud,
  syncNutritionDayToCloud,
  syncWorkoutSessionToCloud,
} from './services/cloudSync';
import { enableBackgroundPush, scheduleBackgroundPush, sendLocalRestNotification } from './services/webPush';
import { createVoiceCoach, isVoiceSupported, VoiceCoachController, VoiceCommand } from './services/voiceCoach';
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
  saveNutritionDay,
  saveWorkoutSession,
  SnapshotRecord,
} from './storage/db';
import { computeMuscleLoad } from './data/exerciseCatalog';
import {
  ACCENT_PRESETS,
  AVATAR_COLORS,
  DAILY_SUPPLEMENTS,
  FREESTYLE_QUICK_EXERCISES,
  QUICK_SNACK_PRESETS,
  RECIPE_CATEGORIES,
  calculateFemaleDOTS,
  extractCookMinutes,
  generateChefRecipe,
  generateUniqueSyncCode,
  getMealSlot,
  getPeerAvatarStyle,
  getTodayDateKey,
  loadLocalJson,
  normalizeExKey,
  scaleIngredientText,
  spawnCelebrationBurst,
  type AccentPreset,
  type BlockOverride,
  type DayOverride,
  type ExtraWorkoutItem,
  type KitchenSubTab,
  type MealSlot,
  type RecipeSortMode,
  type UserProfile,
  type VisualTheme,
} from './utils/appHelpers';
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
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = loadLocalJson<UserProfile | null>('ironcore_user_profile_v1', null);
    if (saved && saved.syncCode) return saved;
    return {
      name: 'Атлет',
      gender: 'male',
      avatarColor: 'sky',
      syncCode: generateUniqueSyncCode(),
      onboarded: false,
    };
  });
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState<boolean>(() => {
    const saved = loadLocalJson<UserProfile | null>('ironcore_user_profile_v1', null);
    return !saved || !saved.onboarded;
  });
  const [syncCode, setSyncCode] = useState<string>(() => {
    const saved = loadLocalJson<UserProfile | null>('ironcore_user_profile_v1', null);
    return saved?.syncCode || generateUniqueSyncCode();
  });
  const [coopRoomCode, setCoopRoomCode] = useState<string>(() =>
    loadLocalJson<string>('ironcore_coop_room_v1', 'gym-bros')
  );
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

  // Voice Coach (Hands-Free)
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceLastPhrase, setVoiceLastPhrase] = useState('');
  const voiceCoachRef = useRef<VoiceCoachController | null>(null);
  const voiceCommandHandlerRef = useRef<(cmd: VoiceCommand) => void>(() => {});

  // HUD Video Telemetry Recorder
  const [hudVideoTarget, setHudVideoTarget] = useState<HudTelemetryTarget | null>(null);

  // On-the-fly Workout Overrides & Accessory Weight Memory
  const [dayOverrides, setDayOverrides] = useState<Record<string, DayOverride>>(() =>
    loadLocalJson<Record<string, DayOverride>>('ironcore_day_overrides_v1', {})
  );
  const [weightMemory, setWeightMemory] = useState<Record<string, number>>(() =>
    loadLocalJson<Record<string, number>>('ironcore_weight_memory_v1', {})
  );
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);
  const [isAddingExtraEx, setIsAddingExtraEx] = useState(false);
  const [extraExName, setExtraExName] = useState('');
  const [extraExWeight, setExtraExWeight] = useState<string>('');
  const [extraExReps, setExtraExReps] = useState<number>(10);
  const [extraExSets, setExtraExSets] = useState<number>(3);

  // Freestyle Workout Mode
  const [isFreestyleMode, setIsFreestyleMode] = useState<boolean>(() =>
    loadLocalJson<boolean>('ironcore_freestyle_active_v1', false)
  );
  const [freestyleItems, setFreestyleItems] = useState<ExtraWorkoutItem[]>(() =>
    loadLocalJson<ExtraWorkoutItem[]>('ironcore_freestyle_items_v1', [
      { id: 'fs-init-1', name: 'Жим штанги лежа', note: 'Свободная тренировка', weightKg: 70, reps: 8, sets: 4 },
      { id: 'fs-init-2', name: 'Подтягивания', note: 'Свой вес / с весом', weightKg: null, reps: 10, sets: 4 },
    ])
  );
  const [fsName, setFsName] = useState('');
  const [fsWeight, setFsWeight] = useState('');
  const [fsReps, setFsReps] = useState<number>(10);
  const [fsSets, setFsSets] = useState<number>(3);
  const [isFreestyleBuilderOpen, setIsFreestyleBuilderOpen] = useState(false);

  // Visual Theme (OLED / Obsidian / Titanium) & Accent
  const [visualTheme, setVisualTheme] = useState<VisualTheme>(() =>
    loadLocalJson<VisualTheme>('ironcore_visual_theme_v1', 'ocean-glass')
  );
  const [accentPreset, setAccentPreset] = useState<AccentPreset>(() =>
    loadLocalJson<AccentPreset>('ironcore_accent_preset_v1', 'auto')
  );

  // Kitchen & Recipes Pro States
  const [kitchenSubTab, setKitchenSubTab] = useState<KitchenSubTab>('ration');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeSort, setRecipeSort] = useState<RecipeSortMode>('default');
  const [favoriteRecipes, setFavoriteRecipes] = useState<string[]>(() =>
    loadLocalJson<string[]>('ironcore_fav_recipes_v1', [])
  );
  const [waterMl, setWaterMl] = useState<number>(() => {
    const saved = loadLocalJson<{ date: string; ml: number } | null>('ironcore_water_v1', null);
    return saved && saved.date === getTodayDateKey() ? saved.ml : 0;
  });
  const [supplementsDone, setSupplementsDone] = useState<Record<string, boolean>>(() => {
    const saved = loadLocalJson<{ date: string; map: Record<string, boolean> } | null>('ironcore_supps_v1', null);
    return saved && saved.date === getTodayDateKey() ? saved.map : {};
  });
  const [isQuickAddMealOpen, setIsQuickAddMealOpen] = useState(false);
  const [quickMealName, setQuickMealName] = useState('');
  const [quickMealKcal, setQuickMealKcal] = useState('');
  const [quickMealP, setQuickMealP] = useState('');
  const [quickMealF, setQuickMealF] = useState('');
  const [quickMealC, setQuickMealC] = useState('');
  const [quickMealSlot, setQuickMealSlot] = useState<MealSlot>('Перекус');

  const [isAddRecipeSheetOpen, setIsAddRecipeSheetOpen] = useState(false);
  const [customRecName, setCustomRecName] = useState('');
  const [customRecCat, setCustomRecCat] = useState('Завтрак');
  const [customRecKcal, setCustomRecKcal] = useState('350');
  const [customRecP, setCustomRecP] = useState('28');
  const [customRecF, setCustomRecF] = useState('10');
  const [customRecC, setCustomRecC] = useState('35');
  const [customRecIng, setCustomRecIng] = useState('');
  const [customRecSteps, setCustomRecSteps] = useState('');
  const [chefRecipe, setChefRecipe] = useState<MealTemplate | null>(null);

  // Native iOS UX Redesign States
  const [isBarbellSheetOpen, setIsBarbellSheetOpen] = useState(false);
  const [isDaySelectorSheetOpen, setIsDaySelectorSheetOpen] = useState(false);
  const [isHeroCompact, setIsHeroCompact] = useState(false);
  const [expandedDoneItems, setExpandedDoneItems] = useState<Record<string, boolean>>({});
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [promptDialog, setPromptDialog] = useState<{
    title: string;
    placeholder: string;
    value: string;
    confirmLabel: string;
    onSubmit: (val: string) => void;
  } | null>(null);

  const showToast = useCallback((msg: string, ms = 3500) => {
    setStorageBanner(msg);
    setTimeout(() => setStorageBanner((prev) => (prev === msg ? '' : prev)), ms);
  }, []);

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

  // Sync CSS accent variables with active tab atmosphere or user preset
  useEffect(() => {
    const preset = ACCENT_PRESETS.find((p) => p.id === accentPreset);
    const useCustom = preset && accentPreset !== 'auto';
    document.documentElement.style.setProperty('--accent-rgb', useCustom ? preset.rgb : currentTheme.accentRgb);
    document.documentElement.style.setProperty('--accent-hex', useCustom ? preset.hex : currentTheme.accentHex);
  }, [currentTheme, accentPreset]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_visual_theme_v1', JSON.stringify(visualTheme));
      document.documentElement.setAttribute('data-theme', visualTheme);
      const bg =
        visualTheme === 'ocean-glass'
          ? '#0b395c'
          : visualTheme === 'oled'
          ? '#000000'
          : visualTheme === 'titanium'
          ? '#0b0f17'
          : '#04060b';
      document.body.style.backgroundColor = bg;
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', bg);
    } catch {}
  }, [visualTheme]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_accent_preset_v1', JSON.stringify(accentPreset));
    } catch {}
  }, [accentPreset]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_user_profile_v1', JSON.stringify(userProfile));
    } catch {}
  }, [userProfile]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_coop_room_v1', JSON.stringify(coopRoomCode));
    } catch {}
  }, [coopRoomCode]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_fav_recipes_v1', JSON.stringify(favoriteRecipes));
    } catch {}
  }, [favoriteRecipes]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_water_v1', JSON.stringify({ date: getTodayDateKey(), ml: waterMl }));
    } catch {}
  }, [waterMl]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_supps_v1', JSON.stringify({ date: getTodayDateKey(), map: supplementsDone }));
    } catch {}
  }, [supplementsDone]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_day_overrides_v1', JSON.stringify(dayOverrides));
    } catch {}
  }, [dayOverrides]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_weight_memory_v1', JSON.stringify(weightMemory));
    } catch {}
  }, [weightMemory]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_freestyle_active_v1', JSON.stringify(isFreestyleMode));
    } catch {}
  }, [isFreestyleMode]);

  useEffect(() => {
    try {
      localStorage.setItem('ironcore_freestyle_items_v1', JSON.stringify(freestyleItems));
    } catch {}
  }, [freestyleItems]);

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

  const isAnySheetOpen = isProgramsSheetOpen || Boolean(activeRecipeSheet) || isFilterSheetOpen || isSettingsSheetOpen || isCloudSheetOpen || isBarbellSheetOpen || isDaySelectorSheetOpen || Boolean(confirmDialog) || Boolean(promptDialog) || isProfileSheetOpen || isQuickAddMealOpen || isAddRecipeSheetOpen;

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
    setIsFreestyleMode(false);
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

  const handleDeleteProgram = (progId: string) => {
    const target = programs.find((p) => p.id === progId);
    if (!target || target.isBuiltIn) return;
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setConfirmDialog({
      title: 'Удалить программу?',
      message: `Программа «${target.title}» будет удалена. Перед удалением создастся автоснимок.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        await createSafetySnapshot(`Перед удалением «${target.title}»`, buildCurrentPayload());
        NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
        setPrograms((prev) => prev.filter((p) => p.id !== progId));
        if (activeProgramId === progId) setActiveProgramId('path-100kg');
        setSnapshots(await listSafetySnapshots());
        showToast(`Программа «${target.title}» удалена`);
      },
    });
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

  const progKeyPrefix = isFreestyleMode
    ? 'freestyle-'
    : activeProgram.id === 'path-100kg'
    ? ''
    : `${activeProgram.id}-`;

  const currentDayStorageKey = `${activeProgram.id}-w${weekObj.week}-d${selectedDayIdx}`;
  const currentDayOverride = dayOverrides[currentDayStorageKey];

  const computedDayItems = useMemo(() => {
    if (isFreestyleMode) {
      return freestyleItems.map((fi, itemIdx) => ({
        name: fi.name,
        exId: null as ExerciseId | null,
        blocks: [{ pct: 0, reps: fi.reps, sets: fi.sets }],
        isBase: false,
        note: fi.note || '',
        exName: fi.name,
        oneRepMax: null as number | null,
        isExtra: true,
        extraId: fi.id,
        rememberedWeight: weightMemory[normalizeExKey(fi.name)] ?? null,
        computedBlocks: [
          {
            pct: 0,
            reps: fi.reps,
            sets: fi.sets,
            effectivePct: 0,
            weightKg: fi.weightKg,
            barbellWeight: 20,
            oneRepMax: null as number | null,
            blockKey: `freestyle-w0-d0-i${itemIdx}-b0`,
          },
        ],
      }));
    }

    const baseMapped = dayObj.items.map((item, itemIdx) => {
      const itemOv = currentDayOverride?.items?.[itemIdx];
      const finalName = itemOv?.name !== undefined ? itemOv.name : item.name;
      const finalNote = itemOv?.note !== undefined ? itemOv.note : item.note;
      const ex = item.exId ? exercises.find((e) => e.id === item.exId) : null;
      const memKey = normalizeExKey(finalName);
      const rememberedWeight = weightMemory[memKey] ?? null;

      const computedBlocks = item.blocks.map((b, bIdx) => {
        const bOv = itemOv?.blocks?.[bIdx];
        const finalReps = bOv?.reps !== undefined ? bOv.reps : b.reps;
        const finalSets = bOv?.sets !== undefined ? bOv.sets : b.sets;

        if (!ex || !b.pct || b.pct <= 0) {
          const finalWeight =
            bOv?.weightKg !== undefined ? bOv.weightKg : rememberedWeight;
          return {
            ...b,
            reps: finalReps,
            sets: finalSets,
            effectivePct: 0,
            weightKg: finalWeight,
            barbellWeight: 20,
            oneRepMax: null as number | null,
            blockKey: `${progKeyPrefix}w${weekObj.week}-d${selectedDayIdx}-i${itemIdx}-b${bIdx}`,
          };
        }
        const effectivePct = Math.max(30, b.pct + readinessShift);
        const rawKg = (ex.oneRepMax * effectivePct) / 100;
        const calcWeight = roundToStep(rawKg, ex.step, ex.barbellWeight);
        const finalWeight = bOv?.weightKg !== undefined ? bOv.weightKg : calcWeight;
        return {
          ...b,
          reps: finalReps,
          sets: finalSets,
          effectivePct,
          weightKg: finalWeight,
          barbellWeight: ex.barbellWeight,
          oneRepMax: ex.oneRepMax,
          blockKey: `${progKeyPrefix}w${weekObj.week}-d${selectedDayIdx}-i${itemIdx}-b${bIdx}`,
        };
      });
      return {
        ...item,
        name: finalName,
        note: finalNote,
        exName: ex ? ex.name : finalName,
        oneRepMax: ex ? ex.oneRepMax : null,
        isExtra: false,
        extraId: undefined as string | undefined,
        rememberedWeight,
        computedBlocks,
      };
    });

    const extraList = currentDayOverride?.extraItems || [];
    const extraMapped = extraList.map((ei, eIdx) => {
      const itemIdx = baseMapped.length + eIdx;
      return {
        name: ei.name,
        exId: null as ExerciseId | null,
        blocks: [{ pct: 0, reps: ei.reps, sets: ei.sets }],
        isBase: false,
        note: ei.note || 'Добавлено на сегодня',
        exName: ei.name,
        oneRepMax: null as number | null,
        isExtra: true,
        extraId: ei.id,
        rememberedWeight: weightMemory[normalizeExKey(ei.name)] ?? null,
        computedBlocks: [
          {
            pct: 0,
            reps: ei.reps,
            sets: ei.sets,
            effectivePct: 0,
            weightKg: ei.weightKg,
            barbellWeight: 20,
            oneRepMax: null as number | null,
            blockKey: `${progKeyPrefix}w${weekObj.week}-d${selectedDayIdx}-i${itemIdx}-b0`,
          },
        ],
      };
    });

    return [...baseMapped, ...extraMapped];
  }, [
    isFreestyleMode,
    freestyleItems,
    dayObj,
    exercises,
    readinessShift,
    progKeyPrefix,
    weekObj.week,
    selectedDayIdx,
    currentDayOverride,
    weightMemory,
  ]);

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
      void scheduleBackgroundPush(sec, 'IRON CORE · Отдых завершён!', 'Пора выходить на следующий подход 💪');
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

  const getSupersetPartnerSetKey = useCallback(
    (setKey: string): string | null => {
      const match = setKey.match(/^(.*-i(\d+)-b(\d+))-s(\d+)$/);
      if (!match) return null;

      const itemIdx = Number(match[2]);
      const bIdx = Number(match[3]);
      const sIdx = Number(match[4]);

      const currentItem = computedDayItems[itemIdx];
      if (!currentItem) return null;

      const isSupersetText = (txt?: string | null) =>
        Boolean(txt && /суперсет|superset/i.test(txt));

      const currentIsSuperset =
        isSupersetText(currentItem.name) ||
        isSupersetText(currentItem.note) ||
        currentItem.computedBlocks.length > 1;

      if (!currentIsSuperset) return null;

      if (currentItem.computedBlocks.length >= 2) {
        const partnerBIdx = bIdx === 0 ? 1 : bIdx === 1 ? 0 : -1;
        if (partnerBIdx !== -1) {
          const partnerBlock = currentItem.computedBlocks[partnerBIdx];
          if (partnerBlock && sIdx < partnerBlock.sets) {
            return `${partnerBlock.blockKey}-s${sIdx}`;
          }
        }
      }

      const neighborOffsets = [1, -1];
      for (const offset of neighborOffsets) {
        const neighborIdx = itemIdx + offset;
        const neighborItem = computedDayItems[neighborIdx];
        if (!neighborItem) continue;
        const neighborIsSuperset =
          isSupersetText(neighborItem.name) || isSupersetText(neighborItem.note);
        if (!neighborIsSuperset) continue;

        const targetBlock = neighborItem.computedBlocks[0];
        if (targetBlock && sIdx < targetBlock.sets) {
          return `${targetBlock.blockKey}-s${sIdx}`;
        }
      }

      return null;
    },
    [computedDayItems]
  );

  const applySetCompletion = (
    targetSet: PendingSetInfo,
    outcome?: 'easy' | 'solid' | 'hard'
  ) => {
    const partnerKey = getSupersetPartnerSetKey(targetSet.setKey);
    const keysToMark = partnerKey ? [targetSet.setKey, partnerKey] : [targetSet.setKey];
    const newlyCompletedCount = keysToMark.filter((k) => !completedSets[k]).length;
    const willCompleteAll = completedSetsCount + newlyCompletedCount >= flatDaySets.length;

    NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
    triggerSetShockwave(targetSet.setKey, willCompleteAll);

    setCompletedSets((prev) => {
      const next = { ...prev };
      for (const k of keysToMark) next[k] = true;
      return next;
    });

    if (targetSet.isBase) {
      const baseRest = targetSet.effectivePct >= 88 ? 300 : 180;
      if (outcome === 'hard') startTimer(baseRest + 60);
      else if (outcome === 'easy') startTimer(Math.max(90, baseRest - 30));
      else startTimer(baseRest);
    } else {
      startTimer(outcome === 'hard' ? 90 : 60);
    }
  };

  const handleCompleteNextSet = () => {
    if (!nextPendingSet) return;
    applySetCompletion(nextPendingSet);
  };

  const handleCompleteSetWithOutcome = (outcome: 'easy' | 'solid' | 'hard') => {
    if (!nextPendingSet) return;
    applySetCompletion(nextPendingSet, outcome);
  };

  const toggleSet = (setKey: string, isBase: boolean, effectivePct = 0) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const nextVal = !completedSets[setKey];
    const partnerKey = getSupersetPartnerSetKey(setKey);
    const keysToToggle = partnerKey ? [setKey, partnerKey] : [setKey];

    setCompletedSets((prev) => {
      const next = { ...prev };
      for (const k of keysToToggle) next[k] = nextVal;
      return next;
    });

    if (nextVal) {
      const newlyCompletedCount = keysToToggle.filter((k) => !completedSets[k]).length;
      const willCompleteAll = completedSetsCount + newlyCompletedCount >= flatDaySets.length;
      triggerSetShockwave(setKey, willCompleteAll);
      if (isBase) startTimer(effectivePct >= 88 ? 300 : 180);
      else startTimer(60);
    }
  };

  voiceCommandHandlerRef.current = (cmd: VoiceCommand) => {
    const speak = (msg: string) => {
      if (iosSettings.soundEffectsEnabled) {
        voiceCoachRef.current?.speak(msg);
      }
    };

    if (cmd.type === 'stop_voice') {
      speak('Голосовой режим выключен');
      voiceCoachRef.current?.stop();
      return;
    }

    if (cmd.type === 'complete_set') {
      if (!nextPendingSet) {
        speak('Все подходы на сегодня уже выполнены');
        return;
      }
      applySetCompletion(nextPendingSet, cmd.outcome);
      const restSec = nextPendingSet.isBase
        ? nextPendingSet.effectivePct >= 88
          ? 300
          : 180
        : 60;
      const restMin = Math.round(restSec / 60);
      speak(`Подход засчитан. Отдых ${restMin} ${restMin === 1 ? 'минута' : 'минуты'}`);
      return;
    }

    if (cmd.type === 'start_timer') {
      startTimer(cmd.seconds);
      speak(`Таймер на ${Math.round(cmd.seconds / 60)} мин запущен`);
      return;
    }

    if (cmd.type === 'stop_timer') {
      stopTimer();
      speak('Таймер остановлен');
      return;
    }

    if (cmd.type === 'check_timer') {
      if (!timerRunning || timerSec <= 0) {
        speak('Таймер отдыха сейчас не запущен');
      } else {
        const m = Math.floor(timerSec / 60);
        const s = timerSec % 60;
        speak(`Осталось ${m > 0 ? `${m} мин ` : ''}${s} сек`);
      }
      return;
    }

    if (cmd.type === 'whats_next') {
      if (!nextPendingSet) {
        speak('Тренировка завершена');
      } else if (nextPendingSet.weightKg) {
        speak(
          `${nextPendingSet.exerciseName}. ${nextPendingSet.weightKg} килограмм на ${nextPendingSet.reps} повторений. Подход ${nextPendingSet.setNumber}`
        );
      } else {
        speak(
          `${nextPendingSet.exerciseName}. ${nextPendingSet.reps} повторений. Подход ${nextPendingSet.setNumber}`
        );
      }
      return;
    }

    if (cmd.type === 'readiness') {
      setReadinessShift((r) => {
        const next = Math.max(-10, Math.min(10, r + cmd.delta));
        speak(`Регуляция дня ${next > 0 ? `плюс ${next}` : next} процентов`);
        return next;
      });
    }
  };

  useEffect(() => {
    return () => {
      voiceCoachRef.current?.stop();
    };
  }, []);

  const handleToggleVoiceCoach = () => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    if (voiceActive) {
      voiceCoachRef.current?.stop();
      setVoiceLastPhrase('');
      return;
    }
    if (!isVoiceSupported()) {
      setStorageBanner('Голосовой ввод не поддерживается этим браузером');
      setTimeout(() => setStorageBanner(''), 3500);
      return;
    }
    if (!voiceCoachRef.current) {
      voiceCoachRef.current = createVoiceCoach({
        onCommand: (cmd) => voiceCommandHandlerRef.current(cmd),
        onTranscript: (phrase) => setVoiceLastPhrase(phrase),
        onStateChange: (active) => setVoiceActive(active),
        onError: (msg) => {
          setStorageBanner(msg);
          setTimeout(() => setStorageBanner(''), 4000);
        },
      });
    }
    voiceCoachRef.current.start();
    if (iosSettings.soundEffectsEnabled) {
      voiceCoachRef.current.speak('Голосовой режим включён');
    }
  };

  // --- On-the-fly Workout Editing & Freestyle Handlers ---
  const rememberWeightForName = (name: string, kg: number | null) => {
    if (kg !== null && kg > 0) {
      const k = normalizeExKey(name);
      if (k) {
        setWeightMemory((prev) => ({ ...prev, [k]: kg }));
      }
    }
  };

  const handleUpdateItemOverride = (
    itemIdx: number,
    isExtra: boolean,
    extraId: string | undefined,
    patch: { name?: string; note?: string }
  ) => {
    if (isFreestyleMode && extraId) {
      setFreestyleItems((prev) =>
        prev.map((it) => (it.id === extraId ? { ...it, ...patch } : it))
      );
      return;
    }
    if (isExtra && extraId) {
      setDayOverrides((prev) => {
        const cur = prev[currentDayStorageKey] || {};
        return {
          ...prev,
          [currentDayStorageKey]: {
            ...cur,
            extraItems: (cur.extraItems || []).map((it) =>
              it.id === extraId ? { ...it, ...patch } : it
            ),
          },
        };
      });
      return;
    }
    setDayOverrides((prev) => {
      const cur = prev[currentDayStorageKey] || {};
      const itemsMap = { ...(cur.items || {}) };
      itemsMap[itemIdx] = { ...(itemsMap[itemIdx] || {}), ...patch };
      return {
        ...prev,
        [currentDayStorageKey]: { ...cur, items: itemsMap },
      };
    });
  };

  const handleUpdateBlockOverride = (
    itemIdx: number,
    bIdx: number,
    isExtra: boolean,
    extraId: string | undefined,
    exName: string,
    patch: BlockOverride
  ) => {
    if (patch.weightKg !== undefined) {
      rememberWeightForName(exName, patch.weightKg);
    }
    if (isFreestyleMode && extraId) {
      setFreestyleItems((prev) =>
        prev.map((it) =>
          it.id === extraId
            ? {
                ...it,
                weightKg: patch.weightKg !== undefined ? patch.weightKg : it.weightKg,
                reps: patch.reps !== undefined ? Math.max(1, patch.reps) : it.reps,
                sets: patch.sets !== undefined ? Math.max(1, Math.min(12, patch.sets)) : it.sets,
              }
            : it
        )
      );
      return;
    }
    if (isExtra && extraId) {
      setDayOverrides((prev) => {
        const cur = prev[currentDayStorageKey] || {};
        return {
          ...prev,
          [currentDayStorageKey]: {
            ...cur,
            extraItems: (cur.extraItems || []).map((it) =>
              it.id === extraId
                ? {
                    ...it,
                    weightKg: patch.weightKg !== undefined ? patch.weightKg : it.weightKg,
                    reps: patch.reps !== undefined ? Math.max(1, patch.reps) : it.reps,
                    sets: patch.sets !== undefined ? Math.max(1, Math.min(12, patch.sets)) : it.sets,
                  }
                : it
            ),
          },
        };
      });
      return;
    }
    setDayOverrides((prev) => {
      const cur = prev[currentDayStorageKey] || {};
      const itemsMap = { ...(cur.items || {}) };
      const itemOv = { ...(itemsMap[itemIdx] || {}) };
      const blocksMap = { ...(itemOv.blocks || {}) };
      const curBlock = blocksMap[bIdx] || {};
      blocksMap[bIdx] = {
        ...curBlock,
        ...patch,
        sets: patch.sets !== undefined ? Math.max(1, Math.min(12, patch.sets)) : curBlock.sets,
        reps: patch.reps !== undefined ? Math.max(1, patch.reps) : curBlock.reps,
      };
      itemOv.blocks = blocksMap;
      itemsMap[itemIdx] = itemOv;
      return {
        ...prev,
        [currentDayStorageKey]: { ...cur, items: itemsMap },
      };
    });
  };

  const handleResetDayOverrides = () => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setDayOverrides((prev) => {
      const next = { ...prev };
      delete next[currentDayStorageKey];
      return next;
    });
    setEditingItemIdx(null);
  };

  const handleAddExtraExerciseToday = () => {
    const clean = extraExName.trim();
    if (!clean) return;
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const parsedW = parseFloat(extraExWeight);
    const weightVal = !Number.isNaN(parsedW) && parsedW > 0 ? parsedW : null;
    rememberWeightForName(clean, weightVal);
    const newItem: ExtraWorkoutItem = {
      id: `extra-${Date.now()}`,
      name: clean,
      weightKg: weightVal,
      reps: Math.max(1, extraExReps),
      sets: Math.max(1, Math.min(12, extraExSets)),
    };
    setDayOverrides((prev) => {
      const cur = prev[currentDayStorageKey] || {};
      return {
        ...prev,
        [currentDayStorageKey]: {
          ...cur,
          extraItems: [...(cur.extraItems || []), newItem],
        },
      };
    });
    setExtraExName('');
    setExtraExWeight('');
    setExtraExReps(10);
    setExtraExSets(3);
    setIsAddingExtraEx(false);
  };

  const handleRemoveExtraExercise = (extraId: string) => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    if (isFreestyleMode) {
      setFreestyleItems((prev) => prev.filter((it) => it.id !== extraId));
      setEditingItemIdx(null);
      return;
    }
    setDayOverrides((prev) => {
      const cur = prev[currentDayStorageKey] || {};
      return {
        ...prev,
        [currentDayStorageKey]: {
          ...cur,
          extraItems: (cur.extraItems || []).filter((it) => it.id !== extraId),
        },
      };
    });
    setEditingItemIdx(null);
  };

  const handleAddFreestyleExercise = (presetName?: string) => {
    const clean = (presetName || fsName).trim();
    if (!clean) return;
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const parsedW = parseFloat(fsWeight);
    const memW = weightMemory[normalizeExKey(clean)] ?? null;
    const weightVal = !Number.isNaN(parsedW) && parsedW > 0 ? parsedW : presetName ? memW : null;
    rememberWeightForName(clean, weightVal);
    const newItem: ExtraWorkoutItem = {
      id: `fs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      weightKg: weightVal,
      reps: Math.max(1, fsReps),
      sets: Math.max(1, Math.min(12, fsSets)),
    };
    setFreestyleItems((prev) => [...prev, newItem]);
    if (!presetName) {
      setFsName('');
      setFsWeight('');
    }
  };

  const handleSaveFreestyleAsProgram = () => {
    if (freestyleItems.length === 0) return;
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setPromptDialog({
      title: 'Сохранить как программу',
      placeholder: 'Название тренировки',
      value: `Свободная · ${new Date().toLocaleDateString('ru-RU')}`,
      confirmLabel: 'Сохранить',
      onSubmit: async (rawTitle: string) => {
        const cleanTitle = rawTitle.trim();
        if (!cleanTitle) return;
        setPromptDialog(null);
        const id = `prog-fs-${Date.now()}`;
        const newProg: TrainingProgram = {
          id,
          title: cleanTitle,
          badge: 'FREE',
          description: `Свободный шаблон · ${freestyleItems.length} упр.`,
          isBuiltIn: false,
          weeks: [
            {
              week: 1,
              title: 'Свободный цикл',
              days: [
                {
                  day: 'День 1',
                  title: cleanTitle,
                  items: freestyleItems.map((fi) => ({
                    name: fi.name,
                    exId: null,
                    blocks: [{ pct: 0, reps: fi.reps, sets: fi.sets }],
                    isBase: false,
                    note: fi.weightKg ? `Ориентир: ${fi.weightKg} кг` : fi.note || '',
                  })),
                },
              ],
            },
          ],
        };
        await createSafetySnapshot(`Сохранение свободной «${cleanTitle}»`, buildCurrentPayload());
        setPrograms((prev) => [...prev, newProg]);
        setProgramPositions((prev) => ({ ...prev, [id]: { week: 1, dayIdx: 0 } }));
        setActiveProgramId(id);
        setIsFreestyleMode(false);
        setIsFreestyleBuilderOpen(false);
        setSnapshots(await listSafetySnapshots());
        showToast(`Программа «${cleanTitle}» сохранена ✓`);
        NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
      },
    });
  };

  const openHudRecorder = (custom?: Partial<HudTelemetryTarget>) => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    setHudVideoTarget({
      exerciseName: custom?.exerciseName || nextPendingSet?.exerciseName || computedDayItems[0]?.name || 'Тренировка',
      weightKg: custom?.weightKg !== undefined ? custom.weightKg : nextPendingSet?.weightKg ?? null,
      reps: custom?.reps || nextPendingSet?.reps || 1,
      setNumber: custom?.setNumber || nextPendingSet?.setNumber || 1,
      effectivePct: custom?.effectivePct ?? nextPendingSet?.effectivePct ?? 0,
      programTitle: isFreestyleMode ? 'FREESTYLE' : activeProgram.title,
    });
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

  const toggleFavoriteRecipe = (id: string) => {
    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
    setFavoriteRecipes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filteredRecipes = useMemo(() => {
    let list = [...mealTemplates];
    if (recipeCategory === 'Избранное') {
      list = list.filter((m) => favoriteRecipes.includes(m.id));
    } else if (recipeCategory !== 'Все') {
      list = list.filter((m) => m.category === recipeCategory);
    }

    const q = recipeSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.ingredients.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q)
      );
    }

    if (recipeSort === 'protein') {
      list.sort((a, b) => b.p - a.p);
    } else if (recipeSort === 'light') {
      list = list.filter((m) => m.kcal <= 420).sort((a, b) => a.kcal - b.kcal);
    } else if (recipeSort === 'video') {
      list = list.filter((m) => Boolean(m.video));
    } else {
      list.sort((a, b) => {
        const aFav = favoriteRecipes.includes(a.id) ? 1 : 0;
        const bFav = favoriteRecipes.includes(b.id) ? 1 : 0;
        return bFav - aFav;
      });
    }
    return list;
  }, [mealTemplates, recipeCategory, favoriteRecipes, recipeSearch, recipeSort]);

  const handleAddQuickMeal = (preset?: { name: string; kcal: number; p: number; f: number; c: number; slot: MealSlot }) => {
    const name = preset ? preset.name : quickMealName.trim();
    const kcal = preset ? preset.kcal : parseInt(quickMealKcal, 10) || 0;
    const p = preset ? preset.p : parseInt(quickMealP, 10) || 0;
    const f = preset ? preset.f : parseInt(quickMealF, 10) || 0;
    const c = preset ? preset.c : parseInt(quickMealC, 10) || 0;
    const slot = preset ? preset.slot : quickMealSlot;
    if (!name || kcal <= 0) return;

    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const entry: MealTemplate = {
      id: `quick-${Date.now()}`,
      category: slot,
      name,
      kcal,
      p,
      f,
      c,
      portionNote: 'Быстрая запись',
      video: '',
      ingredients: '',
      steps: '',
      uid: Date.now() + Math.random(),
    };
    setNutritionLog((prev) => ({ ...prev, entries: [...prev.entries, entry] }));
    if (!preset) {
      setQuickMealName('');
      setQuickMealKcal('');
      setQuickMealP('');
      setQuickMealF('');
      setQuickMealC('');
      setIsQuickAddMealOpen(false);
    }
    showToast(`Добавлено: ${name} (${kcal} ккал) ✓`, 2500);
  };

  const handleSaveCustomRecipe = () => {
    const cleanName = customRecName.trim();
    if (!cleanName) return;
    NativeiOSBridge.haptic('heavy', iosSettings.hapticsEnabled);
    const newRec: MealTemplate = {
      id: `custom-${Date.now()}`,
      category: customRecCat,
      name: cleanName,
      kcal: parseInt(customRecKcal, 10) || 0,
      p: parseInt(customRecP, 10) || 0,
      f: parseInt(customRecF, 10) || 0,
      c: parseInt(customRecC, 10) || 0,
      portionNote: 'Свой рецепт',
      video: '',
      ingredients: customRecIng.trim() || 'Ингредиенты не указаны',
      steps: customRecSteps.trim() || 'Приготовить по вкусу.',
    };
    setMealTemplates((prev) => [newRec, ...prev]);
    setFavoriteRecipes((prev) => (prev.includes(newRec.id) ? prev : [newRec.id, ...prev]));
    setCustomRecName('');
    setCustomRecIng('');
    setCustomRecSteps('');
    setIsAddRecipeSheetOpen(false);
    showToast(`Рецепт «${cleanName}» сохранён ✓`);
  };

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

  const heroScheduleItems = useMemo<HeroScheduleItem[]>(() => {
    const squat1RM = exercises.find((e) => e.id === 'squat')?.oneRepMax || 0;
    const deadlift1RM = exercises.find((e) => e.id === 'deadlift')?.oneRepMax || 0;
    const benchVal = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;
    const remainKcal = Math.max(0, targetKcal - Math.round(nutritionTotals.kcal));
    const remainProt = Math.max(0, Math.round((nutritionLog.bodyweight || 78) * 2.0) - Math.round(nutritionTotals.p));

    return [
      {
        id: 'ic-lift-1pm',
        day: isFreestyleMode ? 'Свободный зал' : `${activeProgram.title} · Нед ${weekObj.week}`,
        title: `Ж ${benchVal || 0} · П ${squat1RM || 0} · Т ${deadlift1RM || 0} кг`,
        timeOrMetric: `${completedSetsCount}/${flatDaySets.length}`,
      },
      {
        id: 'ic-kcal-day',
        day: 'КБЖУ сегодня',
        title: `${Math.round(nutritionTotals.kcal)} / ${targetKcal} ккал · Б ${Math.round(nutritionTotals.p)}г`,
        timeOrMetric: remainKcal > 0 ? `-${remainKcal} ккал · Б ${remainProt}г` : 'Цель ✓',
      },
    ];
  }, [
    exercises,
    targetKcal,
    nutritionTotals.kcal,
    nutritionTotals.p,
    nutritionLog.bodyweight,
    isFreestyleMode,
    activeProgram.title,
    weekObj.week,
    completedSetsCount,
    flatDaySets.length,
  ]);

  // Auto-persist daily workout session with muscle workload breakdown (IndexedDB v3 + optional Cloud)
  useEffect(() => {
    if (!isHydrated || completedSetsCount === 0) return;
    const timer = window.setTimeout(() => {
      const today = getTodayDateKey();
      const loggedExercises = computedDayItems
        .map((item) => {
          const doneSets = item.computedBlocks.flatMap((b) =>
            Array.from({ length: b.sets })
              .map((_, sIdx) => ({ key: `${b.blockKey}-s${sIdx}`, weightKg: b.weightKg, reps: b.reps }))
              .filter((s) => Boolean(completedSets[s.key]))
              .map(({ weightKg, reps }) => ({ weightKg, reps }))
          );
          return { name: item.name, sets: doneSets };
        })
        .filter((e) => e.sets.length > 0);

      const sessionRecord = {
        id: `${today}-${isFreestyleMode ? 'freestyle' : activeProgram.id}-w${weekObj.week}-d${selectedDayIdx}`,
        date: today,
        programId: isFreestyleMode ? 'freestyle' : activeProgram.id,
        programTitle: isFreestyleMode ? 'Свободная тренировка' : activeProgram.title,
        week: weekObj.week,
        dayTitle: isFreestyleMode ? 'Свободный зал' : dayObj.title,
        tonnageKg: dayTonnage,
        completedSets: completedSetsCount,
        totalSets: flatDaySets.length,
        exercises: loggedExercises,
        muscleLoad: computeMuscleLoad(loggedExercises),
        updatedAt: new Date().toISOString(),
      };
      void saveWorkoutSession(sessionRecord);
      if (isCloudConfigured()) {
        void syncWorkoutSessionToCloud(sessionRecord);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [
    isHydrated,
    completedSetsCount,
    completedSets,
    computedDayItems,
    isFreestyleMode,
    activeProgram.id,
    activeProgram.title,
    weekObj.week,
    selectedDayIdx,
    dayObj.title,
    dayTonnage,
    flatDaySets.length,
  ]);

  // Auto-persist daily nutrition log into IndexedDB v3 (+ optional Cloud)
  useEffect(() => {
    if (!isHydrated) return;
    const timer = window.setTimeout(() => {
      const today = getTodayDateKey();
      const dayRecord = {
        date: today,
        bodyweight: nutritionLog.bodyweight,
        dayType: nutritionLog.dayType,
        kcal: Math.round(nutritionTotals.kcal),
        p: Math.round(nutritionTotals.p),
        f: Math.round(nutritionTotals.f),
        c: Math.round(nutritionTotals.c),
        waterMl,
        entries: nutritionLog.entries,
        updatedAt: new Date().toISOString(),
      };
      void saveNutritionDay(dayRecord);
      if (isCloudConfigured()) {
        void syncNutritionDayToCloud(dayRecord);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isHydrated, nutritionLog, nutritionTotals, waterMl]);
  const targetProtein = Math.round((nutritionLog.bodyweight || 78) * 2.0);
  const bench1RM = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;

  const sbdTotal = useMemo(() => {
    const s = exercises.find((e) => e.id === 'squat')?.oneRepMax || 0;
    const b = exercises.find((e) => e.id === 'bench')?.oneRepMax || 0;
    const d = exercises.find((e) => e.id === 'deadlift')?.oneRepMax || 0;
    return Number((s + b + d).toFixed(1));
  }, [exercises]);

  const dotsScore = useMemo(
    () =>
      userProfile.gender === 'female'
        ? calculateFemaleDOTS(sbdTotal, nutritionLog.bodyweight)
        : calculateDOTS(sbdTotal, nutritionLog.bodyweight),
    [sbdTotal, nutritionLog.bodyweight, userProfile.gender]
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
    const roomCode = (coopRoomCode || 'gym-bros').trim();
    const room = joinLiveGymRoom(
      roomCode,
      {
        name: userProfile.name.trim() || 'Атлет',
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
    setCloudStatus(`В комнате «${roomCode}» в реальном времени ✓`);
  };

  // Keep Co-op Live Room state synced on every set/weight/exercise change
  useEffect(() => {
    if (!isInLiveRoom || !liveRoomRef.current) return;
    liveRoomRef.current.updateMyState({
      name: userProfile.name.trim() || 'Атлет',
      exercise: nextPendingSet?.exerciseName || 'Тренировка завершена',
      weightKg: nextPendingSet?.weightKg ?? null,
      reps: nextPendingSet?.reps || 0,
      completedSets: completedSetsCount,
      totalSets: flatDaySets.length,
      updatedAt: Date.now(),
    });
  }, [
    isInLiveRoom,
    userProfile.name,
    nextPendingSet?.exerciseName,
    nextPendingSet?.weightKg,
    nextPendingSet?.reps,
    completedSetsCount,
    flatDaySets.length,
  ]);

  const handleShareWorkout = async () => {
    NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
    const titleText = isFreestyleMode ? 'Свободная тренировка' : `${activeProgram.title} · ${dayObj.title}`;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-ctx');

      // Background
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1350);
      if (visualTheme === 'oled') {
        bgGrad.addColorStop(0, '#000000');
        bgGrad.addColorStop(1, '#050810');
      } else {
        bgGrad.addColorStop(0, '#020617');
        bgGrad.addColorStop(0.55, '#0B1325');
        bgGrad.addColorStop(1, '#020617');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1350);

      // Subtle glow orb
      const presetObj = ACCENT_PRESETS.find((p) => p.id === accentPreset);
      const accentHex = presetObj && accentPreset !== 'auto' ? presetObj.hex : '#38BDF8';
      const orb = ctx.createRadialGradient(880, 180, 20, 880, 180, 480);
      orb.addColorStop(0, `${accentHex}33`);
      orb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = orb;
      ctx.fillRect(0, 0, 1080, 1350);

      // Outer border
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(42, 42, 996, 1266, 44);
      ctx.stroke();

      // Header
      ctx.fillStyle = accentHex;
      ctx.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('IRON CORE // WORKOUT SUMMARY', 90, 128);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = '24px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toLocaleDateString('ru-RU'), 990, 128);
      ctx.textAlign = 'left';

      // Program & Day Title
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 46px system-ui, -apple-system, sans-serif';
      const shortTitle = titleText.length > 34 ? `${titleText.slice(0, 34)}…` : titleText;
      ctx.fillText(shortTitle, 90, 205);

      // Stats Cards Row
      const topSet = flatDaySets
        .filter((s) => s.weightKg && s.weightKg > 0)
        .sort((a, b) => (b.weightKg || 0) - (a.weightKg || 0))[0];
      const pctDone = flatDaySets.length > 0 ? Math.round((completedSetsCount / flatDaySets.length) * 100) : 0;

      const drawStatBox = (x: number, y: number, w: number, h: number, label: string, val: string, color: string) => {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 28);
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
        ctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(label, x + 28, y + 48);

        ctx.fillStyle = color;
        ctx.font = 'bold 46px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(val, x + 28, y + 112);
      };

      drawStatBox(90, 250, 435, 148, 'ТОННАЖ ДНЯ', `${dayTonnage} КГ`, '#F8FAFC');
      drawStatBox(555, 250, 435, 148, 'ВЫПОЛНЕНО', `${completedSetsCount}/${flatDaySets.length} (${pctDone}%)`, accentHex);

      // Progress bar
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(90, 426, 900, 18, 9);
      ctx.fill();
      ctx.fillStyle = accentHex;
      ctx.beginPath();
      ctx.roundRect(90, 426, Math.max(18, (900 * pctDone) / 100), 18, 9);
      ctx.fill();

      // Top Set Highlight
      if (topSet && topSet.weightKg) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.beginPath();
        ctx.roundRect(90, 474, 900, 96, 24);
        ctx.fill();
        ctx.fillStyle = accentHex;
        ctx.beginPath();
        ctx.roundRect(90, 474, 10, 96, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.9)';
        ctx.font = 'bold 20px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText('ТОП-ПОДХОД', 124, 512);
        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
        ctx.fillText(
          `${topSet.exerciseName.slice(0, 26)} · ${topSet.weightKg} кг × ${topSet.reps}`,
          124,
          550
        );
      }

      // Exercise List
      let curY = topSet && topSet.weightKg ? 625 : 515;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = 'bold 22px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('УПРАЖНЕНИЯ', 90, curY);
      curY += 44;

      computedDayItems.slice(0, 7).forEach((it, i) => {
        const desc = it.computedBlocks
          .map((b) => (b.weightKg ? `${b.weightKg} кг × ${b.reps} × ${b.sets}` : `${b.reps} × ${b.sets}`))
          .join('  |  ');

        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.beginPath();
        ctx.roundRect(90, curY - 34, 900, 74, 18);
        ctx.fill();

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 26px system-ui, -apple-system, sans-serif';
        const nm = `${i + 1}. ${it.name}`;
        ctx.fillText(nm.length > 32 ? `${nm.slice(0, 32)}…` : nm, 116, curY + 10);

        ctx.textAlign = 'right';
        ctx.fillStyle = accentHex;
        ctx.font = 'bold 24px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(desc.slice(0, 28), 964, curY + 10);
        ctx.textAlign = 'left';

        curY += 88;
      });

      // Footer
      ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.font = '20px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('iron-core-sandy.vercel.app', 90, 1265);
      ctx.textAlign = 'right';
      ctx.fillStyle = accentHex;
      ctx.font = 'bold 22px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText('IRON CORE PWA', 990, 1265);
      ctx.textAlign = 'left';

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const file = new File([blob], `ironcore_summary_${Date.now()}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `IRON CORE · ${titleText}`,
              text: `Тоннаж: ${dayTonnage} кг (${completedSetsCount}/${flatDaySets.length} подх.)`,
            });
            showToast('Карточка итогов отправлена ✓');
            return;
          } catch {}
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        showToast('PNG-карточка итогов сохранена ✓');
        return;
      }
    } catch {}

    // Text fallback
    const lines = [
      `IRON CORE // ${titleText}`,
      `Тоннаж: ${dayTonnage} кг (${completedSetsCount}/${flatDaySets.length} подх.)`,
      ...computedDayItems.map((it, i) => {
        const desc = it.computedBlocks
          .map((b) => (b.weightKg ? `${b.weightKg}кг×${b.reps}×${b.sets}` : `${b.reps}×${b.sets}`))
          .join(', ');
        return `${i + 1}. ${it.name}: ${desc}`;
      }),
    ].join('\n');
    await NativeiOSBridge.shareText(`IRON CORE · ${titleText}`, lines);
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
      showToast('Бэкап и все программы восстановлены ✓', 4000);
    } catch {
      showToast('Ошибка чтения JSON файла', 4000);
    }
  };

  const stageScale = isAnySheetOpen ? 0.952 + 0.048 * sheetDragRatio : 1;
  const stageTranslateY = isAnySheetOpen ? 8 * (1 - sheetDragRatio) : 0;
  const stageBrightness = isAnySheetOpen ? 0.65 + 0.35 * sheetDragRatio : 1;
  const stageRadius = isAnySheetOpen ? Math.round(28 * (1 - sheetDragRatio)) : 0;

  const tabsList: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'workout', label: 'Тренировка', icon: <DumbbellIcon className="w-[18px] h-[18px]" /> },
    { id: 'recipes', label: 'Рецепты', icon: <SaladIcon className="w-[18px] h-[18px]" /> },
    { id: 'fridge', label: 'Кухня', icon: <FridgeIcon className="w-[18px] h-[18px]" /> },
    { id: 'calc', label: '1ПМ', icon: <BoltIcon className="w-[18px] h-[18px]" /> },
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
    <div className="ic-app-shell min-h-screen relative transition-colors duration-300">
      {/* ================= LIVING MIDNIGHT OBSIDIAN AURORA ================= */}
      {visualTheme !== 'oled' && visualTheme !== 'ocean-glass' && (
        <LivingAuroraBackdrop activeTab={activeTab} timerRunning={timerRunning} />
      )}

      {/* ================= PWA SMART UPDATE PROMPT ================= */}
      <PwaUpdateBanner hapticsEnabled={iosSettings.hapticsEnabled} />

      {/* ================= FULL-SCREEN GYM FOCUS MODE (LAZY) ================= */}
      {isGymFocusOpen && (
        <Suspense fallback={null}>
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
        </Suspense>
      )}

      {/* ================= MEDIAPIPE GPU FORM CHECK (LAZY) ================= */}
      {isFormCheckOpen && (
        <Suspense fallback={null}>
          <FormCheckVision
            isOpen={isFormCheckOpen}
            onClose={() => setIsFormCheckOpen(false)}
            hapticsEnabled={iosSettings.hapticsEnabled}
          />
        </Suspense>
      )}

      {/* ================= HUD VIDEO TELEMETRY RECORDER (LAZY) ================= */}
      {Boolean(hudVideoTarget) && (
        <Suspense fallback={null}>
          <HudVideoRecorder
            isOpen={Boolean(hudVideoTarget)}
            onClose={() => setHudVideoTarget(null)}
            target={
              hudVideoTarget || {
                exerciseName: 'IRON CORE',
                weightKg: null,
                reps: 1,
                setNumber: 1,
                effectivePct: 0,
                programTitle: activeProgram.title,
              }
            }
            hapticsEnabled={iosSettings.hapticsEnabled}
          />
        </Suspense>
      )}

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
        className="app-stage max-w-5xl mx-auto px-4 pt-[calc(4.1rem+env(safe-area-inset-top))] sm:pt-20 pb-48"
      >
        {storageBanner && (
          <div className="mb-3 px-3 py-1.5 rounded-xl slate-pill text-[11px] font-mono text-emerald-300 text-center animate-cascade">
            {storageBanner}
          </div>
        )}

        {/* ================= HEADER (ULTRA-CLEAN iOS ERGONOMICS) ================= */}
        <header
          className="animate-cascade space-y-2.5 pb-3"
          style={{ animationDelay: '0ms' }}
        >
          {/* Row 1: Brand + Cloud & Settings (SVG Icons) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl slate-card flex items-center justify-center shrink-0">
                <span className={`font-mono font-extrabold text-[10px] tracking-tight ${currentTheme.accentText}`}>
                  {isFreestyleMode ? 'FREE' : activeProgram.badge}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-sm font-extrabold tracking-tight text-slate-50 whitespace-nowrap">
                    IRON CORE
                  </h1>
                  {!isFreestyleMode && activeTab === 'workout' && readinessShift !== 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-sky-400/15 border border-sky-400/30 font-mono text-[10px] font-bold text-sky-300">
                      {readinessShift > 0 ? `+${readinessShift}%` : `${readinessShift}%`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {activeTab === 'workout'
                    ? isFreestyleMode
                      ? 'Свободный режим'
                      : `${activeProgram.title} · Нед ${weekObj.week}/${activeProgram.weeks.length}`
                    : activeTab === 'recipes'
                    ? 'Рецепты и КБЖУ'
                    : activeTab === 'fridge'
                    ? 'Холодильник, рацион и покупки'
                    : 'Силовые показатели и бэкап'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIsProfileSheetOpen(true);
                }}
                className={`w-9 h-9 rounded-xl font-mono text-xs font-extrabold flex items-center justify-center active:scale-90 transition-transform shadow-sm ${
                  (AVATAR_COLORS.find((c) => c.id === userProfile.avatarColor) || AVATAR_COLORS[0]).bg
                } ${(AVATAR_COLORS.find((c) => c.id === userProfile.avatarColor) || AVATAR_COLORS[0]).text}`}
                title={`Профиль: ${userProfile.name}`}
              >
                {(userProfile.name.trim().charAt(0) || 'А').toUpperCase()}
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIsCloudSheetOpen(true);
                }}
                className={`w-9 h-9 rounded-xl slate-pill flex items-center justify-center active:scale-90 transition-transform ${
                  isInLiveRoom ? 'text-emerald-300 border border-emerald-400/40' : 'text-sky-300'
                }`}
                title="Облако и Co-op зал"
              >
                <CloudIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIsSettingsSheetOpen(true);
                }}
                className="w-9 h-9 rounded-xl slate-pill text-slate-200 flex items-center justify-center active:scale-90 transition-transform"
                title="Настройки iOS и уведомлений"
              >
                <SettingsIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Row 2 (Workout tab only): Compact Navigator Pill + Freestyle Toggle */}
          {activeTab === 'workout' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  if (isFreestyleMode) {
                    setIsFreestyleBuilderOpen((v) => !v);
                  } else {
                    setIsDaySelectorSheetOpen(true);
                  }
                }}
                className="flex-1 min-w-0 slate-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2 active:scale-[0.985] transition-transform"
              >
                <div className="min-w-0 text-left">
                  <div className="text-xs font-bold text-slate-50 truncate">
                    {isFreestyleMode
                      ? 'Свободная тренировка'
                      : `${activeProgram.title} · Нед ${weekObj.week} · ${dayObj.day}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] font-mono text-sky-300 shrink-0">
                  <span>{isFreestyleMode ? (isFreestyleBuilderOpen ? 'Скрыть' : '+ Упр.') : 'План'}</span>
                  <ChevronDownIcon
                    className={`w-3.5 h-3.5 transition-transform ${
                      isFreestyleMode && isFreestyleBuilderOpen ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              <button
                onClick={() => {
                  NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                  setIsFreestyleMode((f) => {
                    const next = !f;
                    setIsFreestyleBuilderOpen(next && freestyleItems.length === 0);
                    return next;
                  });
                  setEditingItemIdx(null);
                  setOpenMenuIdx(null);
                }}
                className={`shrink-0 px-3 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all ${
                  isFreestyleMode
                    ? 'bg-emerald-400 text-slate-950 border-emerald-300 shadow-lg shadow-emerald-400/20'
                    : 'slate-pill text-emerald-300 border-slate-400/15'
                }`}
                title="Свободная тренировка"
              >
                <FlameIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Свободная</span>
              </button>
            </div>
          )}

          {/* Row 3 (Workout tab only): Ultra-slim Secondary Tools Strip (No duplicates) */}
          {activeTab === 'workout' && (
            <div className="grid grid-cols-4 gap-1.5">
              <button
                onClick={() => openHudRecorder()}
                className="py-2 px-2 rounded-xl bg-rose-500/12 hover:bg-rose-500/20 border border-rose-400/25 text-rose-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <VideoIcon className="w-3.5 h-3.5 shrink-0" />
                <span>HUD</span>
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                  setIsBarbellSheetOpen(true);
                }}
                className="py-2 px-2 rounded-xl slate-pill text-sky-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <Cube3DIcon className="w-3.5 h-3.5 shrink-0" />
                <span>3D гриф</span>
              </button>
              <button
                onClick={() => {
                  NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                  setIsFormCheckOpen(true);
                }}
                className="py-2 px-2 rounded-xl slate-pill text-emerald-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <CameraIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Техника</span>
              </button>
              <button
                onClick={handleShareWorkout}
                className="py-2 px-2 rounded-xl slate-pill text-slate-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <ShareIcon className="w-3.5 h-3.5 shrink-0" />
                <span>Итоги</span>
              </button>
            </div>
          )}
        </header>

        {/* ================= LIVE CO-OP PEER BANNER ON MAIN SCREEN ================= */}
        {isInLiveRoom && livePeers.length > 0 && (
          <div className="max-w-3xl mx-auto mb-3 animate-cascade">
            <button
              onClick={() => {
                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                setIsCloudSheetOpen(true);
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-between gap-2 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {(() => {
                  const av = getPeerAvatarStyle(livePeers[0].name);
                  return (
                    <span className={`w-7 h-7 rounded-lg ${av.bg} ${av.text} font-mono text-xs font-extrabold flex items-center justify-center shrink-0`}>
                      {av.initial}
                    </span>
                  );
                })()}
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-emerald-200 truncate">
                    {livePeers[0].name} · {livePeers[0].exercise}
                  </div>
                  <div className="font-mono text-[10px] text-emerald-300/80">
                    {livePeers[0].weightKg
                      ? `${livePeers[0].weightKg} кг × ${livePeers[0].reps}`
                      : 'Без доп. веса'}{' '}
                    · {livePeers[0].completedSets}/{livePeers[0].totalSets} подх.
                    {livePeers.length > 1 ? ` · +${livePeers.length - 1} в зале` : ''}
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-400/15 font-mono text-[10px] font-bold text-emerald-300 shrink-0">
                LIVE
              </span>
            </button>
          </div>
        )}

        {/* ================= TAB 1: АКТИВНАЯ ПРОГРАММА (ZERO-SCROLL FOCUS) ================= */}
        {activeTab === 'workout' && (
          <div className="max-w-3xl mx-auto space-y-3 mt-1">
            <div className="animate-cascade" style={{ animationDelay: '20ms' }}>
              {isHeroCompact ? (
                <div className="slate-card rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2 text-xs">
                    <span className="font-bold text-slate-50 truncate">IRON CORE</span>
                    <span className="opacity-50">·</span>
                    <span className="font-mono text-[11px] text-slate-200 truncate">
                      {completedSetsCount}/{flatDaySets.length} подх. · {dayTonnage} кг · {Math.round(nutritionTotals.kcal)} ккал
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsHeroCompact(false)}
                    className="px-2.5 py-1 rounded-lg bg-white/15 text-[11px] font-semibold text-white shrink-0 active:scale-95"
                  >
                    Сводка
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <HeroShowcaseV2
                    brandName="IRON CORE"
                    headlineLine1="Твой личный центр"
                    headlineLine2="силы и питания"
                    description={
                      nextPendingSet
                        ? `Следующий подход: ${nextPendingSet.exerciseName}${
                            nextPendingSet.weightKg ? ` · ${nextPendingSet.weightKg} кг × ${nextPendingSet.reps}` : ` · ${nextPendingSet.reps} повт.`
                          }`
                        : 'Все подходы на сегодня закрыты — можно перейти в 3D, камеру или кухню.'
                    }
                    primaryCtaLabel={nextPendingSet ? 'В фокус-режим' : 'План и дни'}
                    secondaryCtaLabel="КБЖУ и кухня"
                    scheduleTitle="Сводка дня"
                    scheduleBadge={isFreestyleMode ? 'FREE' : `НЕД ${weekObj.week}`}
                    scheduleItems={heroScheduleItems}
                    features={[
                      `${dayTonnage} кг тоннаж дня`,
                      `${Math.round(nutritionTotals.kcal)} / ${targetKcal} ккал`,
                      `${completedSetsCount} из ${flatDaySets.length} подходов`,
                    ]}
                    onStartWorkout={() => {
                      if (nextPendingSet) {
                        setIsGymFocusOpen(true);
                      } else {
                        setIsDaySelectorSheetOpen(true);
                      }
                    }}
                    onOpenNutrition={() => setActiveTab('fridge')}
                    onOpen3DOrCamera={() => setIsBarbellSheetOpen(true)}
                    onNavigateTab={(tab) => {
                      if (tab === 'workouts') setActiveTab('workout');
                      if (tab === 'kitchen') setActiveTab('fridge');
                      if (tab === '3d-camera') setIsBarbellSheetOpen(true);
                    }}
                  />
                  <div className="flex justify-end px-1">
                    <button
                      type="button"
                      onClick={() => setIsHeroCompact(true)}
                      className="text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                    >
                      Свернуть баннер ↑
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Collapsible Freestyle Builder */}
            {isFreestyleMode && isFreestyleBuilderOpen && (
              <div className="animate-cascade slate-card rounded-[24px] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300">Добавить в свободную тренировку</span>
                  <button
                    onClick={() => setIsFreestyleBuilderOpen(false)}
                    className="text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    Готово
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Название упражнения (напр. Жим гантелей)"
                    value={fsName}
                    onChange={(e) => setFsName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFreestyleExercise()}
                    className="w-full slate-well rounded-xl px-3 py-2 text-xs text-slate-50 focus:outline-none"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="slate-well rounded-xl px-2.5 py-1.5">
                      <span className="text-[10px] text-slate-400 block">Вес (кг)</span>
                      <input
                        type="number"
                        step="2.5"
                        placeholder="0"
                        value={fsWeight}
                        onChange={(e) => setFsWeight(e.target.value)}
                        className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                      />
                    </div>
                    <div className="slate-well rounded-xl px-2.5 py-1.5">
                      <span className="text-[10px] text-slate-400 block">Повторы</span>
                      <input
                        type="number"
                        min="1"
                        value={fsReps}
                        onChange={(e) => setFsReps(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                      />
                    </div>
                    <div className="slate-well rounded-xl px-2.5 py-1.5">
                      <span className="text-[10px] text-slate-400 block">Подходы</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={fsSets}
                        onChange={(e) => setFsSets(parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddFreestyleExercise()}
                    className="w-full py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                  >
                    <PlusIcon className="w-3.5 h-3.5" />
                    <span>Добавить упражнение</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-400/10">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">
                    Быстро в 1 тап:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FREESTYLE_QUICK_EXERCISES.map((exTitle) => (
                      <button
                        key={exTitle}
                        onClick={() => handleAddFreestyleExercise(exTitle)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-400/10 text-[11px] text-slate-200 active:scale-95"
                      >
                        + {exTitle}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-400/10">
                  <button
                    disabled={freestyleItems.length === 0}
                    onClick={handleSaveFreestyleAsProgram}
                    className="py-2 rounded-xl bg-sky-400/15 border border-sky-400/30 text-sky-200 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95"
                  >
                    <SaveIcon className="w-3.5 h-3.5" />
                    <span>В программы</span>
                  </button>
                  <button
                    disabled={freestyleItems.length === 0}
                    onClick={() => {
                      setConfirmDialog({
                        title: 'Очистить тренировку?',
                        message: 'Все упражнения текущей свободной тренировки будут удалены.',
                        confirmLabel: 'Очистить',
                        danger: true,
                        onConfirm: () => {
                          setConfirmDialog(null);
                          setFreestyleItems([]);
                          showToast('Свободная тренировка очищена');
                        },
                      });
                    }}
                    className="py-2 rounded-xl bg-slate-900 text-slate-400 hover:text-rose-300 text-[11px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                    <span>Очистить</span>
                  </button>
                </div>
              </div>
            )}

            {/* Main Workout Card */}
            <div
              className="animate-cascade"
              style={{ animationDelay: '60ms' }}
              onTouchStart={handleWorkoutTouchStart}
              onTouchEnd={handleWorkoutTouchEnd}
            >
              <div
                key={`${isFreestyleMode ? 'free' : activeProgram.id}-${weekObj.week}-${selectedDayIdx}`}
                className={`slate-card rounded-[26px] overflow-hidden ${
                  dayTransitionDir === 'next' ? 'animate-day-next' : 'animate-day-prev'
                }`}
              >
                {/* Day Header + Glowing Progress Bar */}
                <div className="px-4 pt-3.5 pb-3 border-b border-slate-400/10 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-bold text-slate-50 truncate">
                          {isFreestyleMode ? 'Свободная тренировка' : dayObj.title}
                        </h2>
                        {!isFreestyleMode && currentDayOverride && (
                          <button
                            onClick={handleResetDayOverrides}
                            className="px-2 py-0.5 rounded-md bg-amber-400/15 text-amber-300 font-mono text-[10px] inline-flex items-center gap-1 hover:underline"
                            title="Вернуть исходный план дня"
                          >
                            <RotateCcwIcon className="w-3 h-3" />
                            <span>Сброс</span>
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Подходов:{' '}
                        <span className="font-mono tabular text-sky-300 font-semibold">
                          {completedSetsCount}/{flatDaySets.length}
                        </span>
                        {!isFreestyleMode && ' · свайп для смены дня'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">Тоннаж</div>
                      <div className="font-mono tabular text-sm font-bold text-slate-50">
                        <AnimatedNumber value={dayTonnage} /> кг
                      </div>
                    </div>
                  </div>

                  {/* Glowing Workout Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-950/90 overflow-hidden">
                    <div
                      style={{
                        width: `${flatDaySets.length > 0 ? Math.round((completedSetsCount / flatDaySets.length) * 100) : 0}%`,
                      }}
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 shadow-[0_0_12px_rgba(56,189,248,0.65)] transition-all duration-500"
                    />
                  </div>
                </div>

                {!isFreestyleMode && dayObj.warmup && dayObj.warmup.length > 0 && (
                  <div className="px-4 py-2.5 bg-slate-950/55 border-b border-slate-400/10">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-sky-300 font-semibold mb-1.5">
                      Разминка
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
                  {computedDayItems.length === 0 && (
                    <div className="p-8 text-center space-y-3">
                      <p className="text-xs text-slate-400">Пока нет упражнений в тренировке.</p>
                      {isFreestyleMode && (
                        <button
                          onClick={() => setIsFreestyleBuilderOpen(true)}
                          className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          <span>Добавить первое упражнение</span>
                        </button>
                      )}
                    </div>
                  )}

                  {computedDayItems.map((item, idx) => {
                    const isCurrentItem = nextPendingSet?.itemIdx === idx;
                    const isEditingThis = editingItemIdx === idx;
                    const isMenuOpen = openMenuIdx === idx;
                    const itemCollapseKey = `${currentDayStorageKey}-${item.extraId || idx}`;
                    const allBlocksDone =
                      item.computedBlocks.length > 0 &&
                      item.computedBlocks.every((b) =>
                        Array.from({ length: b.sets }).every((_, sIdx) => Boolean(completedSets[`${b.blockKey}-s${sIdx}`]))
                      );

                    const totalItemSets = item.computedBlocks.reduce((acc, b) => acc + b.sets, 0);
                    const itemTonnage = Math.round(
                      item.computedBlocks.reduce(
                        (acc, b) => acc + (b.weightKg ? b.weightKg * b.reps * b.sets : 0),
                        0
                      )
                    );

                    // Auto-collapse completed exercise into 1 sleek line
                    if (allBlocksDone && !expandedDoneItems[itemCollapseKey] && !isEditingThis) {
                      return (
                        <button
                          key={item.extraId || idx}
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setExpandedDoneItems((prev) => ({ ...prev, [itemCollapseKey]: true }));
                          }}
                          className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-slate-900/40 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
                              <CheckIcon className="w-3 h-3" />
                            </span>
                            <span className="text-xs font-medium text-slate-400 line-through truncate">
                              {idx + 1}. {item.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-slate-500">
                            <span>
                              {totalItemSets} подх.{itemTonnage > 0 ? ` · ${itemTonnage} кг` : ''}
                            </span>
                            <ChevronDownIcon className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    }

                    return (
                      <div
                        key={item.extraId || idx}
                        className={`p-4 transition-all duration-300 ${
                          isCurrentItem
                            ? 'bg-sky-400/[0.045] ring-1 ring-inset ring-sky-400/35 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.95)]'
                            : !allBlocksDone && nextPendingSet
                            ? 'opacity-70 hover:opacity-100'
                            : 'opacity-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {isEditingThis ? (
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) =>
                                  handleUpdateItemOverride(idx, item.isExtra, item.extraId, {
                                    name: e.target.value,
                                  })
                                }
                                className="w-full slate-well rounded-xl px-2.5 py-1.5 text-sm font-semibold text-sky-200 focus:outline-none"
                              />
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-slate-500">{idx + 1}.</span>
                                <span className="text-sm font-semibold text-slate-50">{item.name}</span>
                                {item.isBase && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-sky-400/15 text-sky-300 border border-sky-400/25">
                                    1ПМ {item.oneRepMax} кг
                                  </span>
                                )}
                                {!item.isBase && item.rememberedWeight && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-400/10 text-emerald-300">
                                    прошл. {item.rememberedWeight} кг
                                  </span>
                                )}
                              </div>
                            )}
                            {item.note && !isEditingThis && (
                              <p className="text-[11px] text-slate-400 mt-0.5">{item.note}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {allBlocksDone && (
                              <button
                                onClick={() => {
                                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                  setExpandedDoneItems((prev) => ({ ...prev, [itemCollapseKey]: false }));
                                }}
                                className="px-2 h-8 rounded-lg bg-slate-900/80 text-[10px] font-mono text-emerald-300"
                              >
                                Свернуть
                              </button>
                            )}
                            {isEditingThis ? (
                              <button
                                onClick={() => {
                                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                  setEditingItemIdx(null);
                                }}
                                className="px-2.5 h-8 rounded-lg bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1 active:scale-90"
                              >
                                <CheckIcon className="w-3.5 h-3.5" />
                                <span>Готово</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                  setOpenMenuIdx(isMenuOpen ? null : idx);
                                }}
                                className={`w-8 h-8 rounded-lg border flex items-center justify-center active:scale-90 transition-colors ${
                                  isMenuOpen
                                    ? 'bg-slate-800 border-sky-400/40 text-sky-300'
                                    : 'bg-slate-900/70 border-slate-400/10 text-slate-400 hover:text-slate-100'
                                }`}
                                title="Действия"
                              >
                                <MoreHorizontalIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Compact ••• Action Strip */}
                        {isMenuOpen && !isEditingThis && (
                          <div className="mt-2.5 p-1.5 rounded-xl bg-slate-950/85 border border-slate-400/15 flex items-center flex-wrap gap-1.5 animate-cascade">
                            <button
                              onClick={() => {
                                setOpenMenuIdx(null);
                                setEditingItemIdx(idx);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-100 text-[11px] font-semibold inline-flex items-center gap-1.5"
                            >
                              <PencilIcon className="w-3.5 h-3.5 text-sky-300" />
                              <span>Изменить</span>
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenuIdx(null);
                                const firstB = item.computedBlocks[0];
                                openHudRecorder({
                                  exerciseName: item.name,
                                  weightKg: firstB?.weightKg ?? null,
                                  reps: firstB?.reps || 1,
                                  setNumber: 1,
                                  effectivePct: firstB?.effectivePct || 0,
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-rose-200 text-[11px] font-semibold inline-flex items-center gap-1.5"
                            >
                              <VideoIcon className="w-3.5 h-3.5" />
                              <span>HUD-видео</span>
                            </button>
                            {item.computedBlocks.some((b) => b.weightKg && b.weightKg >= 20) && (
                              <button
                                onClick={() => {
                                  setOpenMenuIdx(null);
                                  const wBlock = item.computedBlocks.find((b) => b.weightKg && b.weightKg >= 20);
                                  if (wBlock && wBlock.weightKg) {
                                    setActivePlateTarget({
                                      weight: wBlock.weightKg,
                                      barbell: wBlock.barbellWeight || 20,
                                      title: `${item.name} · ${wBlock.effectivePct > 0 ? `${wBlock.effectivePct}% × ` : ''}${wBlock.reps} повт.`,
                                    });
                                    setIsBarbellSheetOpen(true);
                                  }
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-sky-300 text-[11px] font-semibold inline-flex items-center gap-1.5"
                              >
                                <Cube3DIcon className="w-3.5 h-3.5" />
                                <span>3D гриф</span>
                              </button>
                            )}
                            {item.isExtra && item.extraId && (
                              <button
                                onClick={() => {
                                  setOpenMenuIdx(null);
                                  handleRemoveExtraExercise(item.extraId!);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-[11px] font-semibold inline-flex items-center gap-1.5 ml-auto"
                              >
                                <TrashIcon className="w-3.5 h-3.5" />
                                <span>Удалить</span>
                              </button>
                            )}
                          </div>
                        )}

                        <div className="mt-3 space-y-2.5">
                          {item.computedBlocks.map((b, bIdx) => (
                            <div
                              key={bIdx}
                              onClick={() => {
                                if (b.weightKg && b.weightKg >= 20) {
                                  NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                  setActivePlateTarget({
                                    weight: b.weightKg,
                                    barbell: b.barbellWeight || 20,
                                    title: `${item.name} · ${b.effectivePct > 0 ? `${b.effectivePct}% × ` : ''}${b.reps} повт.`,
                                  });
                                  setIsBarbellSheetOpen(true);
                                }
                              }}
                              className={`p-3 rounded-2xl slate-well ${
                                b.weightKg && b.weightKg >= 20
                                  ? 'cursor-pointer active:scale-[0.995] transition-transform'
                                  : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-2.5">
                                <div className="flex items-baseline gap-2 flex-wrap">
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
                                        {b.effectivePct > 0 ? `${b.effectivePct}% × ` : ''}
                                        {b.reps} повт. × {b.sets}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="font-mono tabular text-xs text-slate-300">
                                      {b.reps} повт. × {b.sets} подх.
                                    </span>
                                  )}
                                </div>

                                {b.weightKg && b.weightKg >= 20 && (
                                  <span className="text-[10px] font-mono text-sky-300/80 inline-flex items-center gap-1 shrink-0">
                                    <Cube3DIcon className="w-3 h-3" />
                                    <span>3D</span>
                                  </span>
                                )}
                              </div>

                              {isEditingThis && (
                                <div
                                  className="grid grid-cols-3 gap-2 mb-2.5 p-2 rounded-xl bg-slate-950/75 border border-sky-400/20"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div>
                                    <span className="text-[10px] text-slate-400 block">Вес (кг)</span>
                                    <input
                                      type="number"
                                      step="2.5"
                                      value={b.weightKg ?? ''}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        handleUpdateBlockOverride(idx, bIdx, item.isExtra, item.extraId, item.name, {
                                          weightKg: Number.isNaN(v) || v <= 0 ? null : v,
                                        });
                                      }}
                                      className="w-full bg-transparent font-mono text-xs font-bold text-sky-300 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block">Повторы</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={b.reps}
                                      onChange={(e) =>
                                        handleUpdateBlockOverride(idx, bIdx, item.isExtra, item.extraId, item.name, {
                                          reps: parseInt(e.target.value, 10) || 1,
                                        })
                                      }
                                      className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-slate-400 block">Подходы</span>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <button
                                        onClick={() =>
                                          handleUpdateBlockOverride(idx, bIdx, item.isExtra, item.extraId, item.name, {
                                            sets: b.sets - 1,
                                          })
                                        }
                                        className="w-6 h-6 rounded bg-slate-800 text-slate-200 font-mono text-xs font-bold"
                                      >
                                        -
                                      </button>
                                      <span className="font-mono text-xs font-bold text-slate-50">{b.sets}</span>
                                      <button
                                        onClick={() =>
                                          handleUpdateBlockOverride(idx, bIdx, item.isExtra, item.extraId, item.name, {
                                            sets: b.sets + 1,
                                          })
                                        }
                                        className="w-6 h-6 rounded bg-slate-800 text-slate-200 font-mono text-xs font-bold"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-1.5 items-center" onClick={(e) => e.stopPropagation()}>
                                {Array.from({ length: b.sets }).map((_, sIdx) => {
                                  const setKey = `${b.blockKey}-s${sIdx}`;
                                  const done = Boolean(completedSets[setKey]);
                                  const isNextFocus = nextPendingSet?.setKey === setKey;
                                  const showBurst = recentBurstSetKey === setKey;
                                  return (
                                    <button
                                      key={sIdx}
                                      onClick={() => toggleSet(setKey, item.isBase, b.effectivePct)}
                                      className={`liquid-set-btn h-11 min-w-[72px] px-3 rounded-xl font-mono tabular text-xs font-bold flex items-center justify-center gap-1 active:scale-90 ${
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
                                <button
                                  onClick={() => {
                                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                    handleUpdateBlockOverride(idx, bIdx, item.isExtra, item.extraId, item.name, {
                                      sets: b.sets + 1,
                                    });
                                  }}
                                  className="h-11 w-9 rounded-xl bg-slate-900/70 hover:bg-slate-800 border border-dashed border-slate-400/20 text-slate-400 hover:text-sky-300 flex items-center justify-center active:scale-90"
                                  title="Добавить подход"
                                >
                                  <PlusIcon className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {!isFreestyleMode && (
                    <div className="p-4">
                      {isAddingExtraEx ? (
                        <div className="p-3 rounded-2xl slate-well space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-sky-300">+ Упражнение на сегодня</span>
                            <button
                              onClick={() => setIsAddingExtraEx(false)}
                              className="text-[11px] text-slate-400"
                            >
                              Отмена
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Напр. Разгибания на трицепс"
                            value={extraExName}
                            onChange={(e) => setExtraExName(e.target.value)}
                            className="w-full bg-slate-950/80 border border-slate-400/15 rounded-xl px-3 py-2 text-xs text-slate-50 focus:outline-none"
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-950/80 rounded-xl px-2.5 py-1.5">
                              <span className="text-[10px] text-slate-400 block">Вес (кг)</span>
                              <input
                                type="number"
                                step="2.5"
                                placeholder="0"
                                value={extraExWeight}
                                onChange={(e) => setExtraExWeight(e.target.value)}
                                className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                              />
                            </div>
                            <div className="bg-slate-950/80 rounded-xl px-2.5 py-1.5">
                              <span className="text-[10px] text-slate-400 block">Повторы</span>
                              <input
                                type="number"
                                min="1"
                                value={extraExReps}
                                onChange={(e) => setExtraExReps(parseInt(e.target.value, 10) || 1)}
                                className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                              />
                            </div>
                            <div className="bg-slate-950/80 rounded-xl px-2.5 py-1.5">
                              <span className="text-[10px] text-slate-400 block">Подходы</span>
                              <input
                                type="number"
                                min="1"
                                max="12"
                                value={extraExSets}
                                onChange={(e) => setExtraExSets(parseInt(e.target.value, 10) || 1)}
                                className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleAddExtraExerciseToday}
                            className="w-full py-2.5 rounded-xl bg-sky-400 text-slate-950 text-xs font-extrabold active:scale-95"
                          >
                            Добавить в сегодняшний день
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setIsAddingExtraEx(true);
                          }}
                          className="w-full py-2.5 rounded-xl border border-dashed border-slate-400/20 hover:border-sky-400/40 text-xs font-semibold text-slate-400 hover:text-sky-300 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          <span>Добавить упражнение на сегодня</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: РЕЦЕПТЫ (ПОИСК + ИЗБРАННОЕ + БЖУ-БАЛАНС) ================= */}
        {activeTab === 'recipes' && (
          <div className="mt-1 space-y-3.5">
            {/* Search & Action Header */}
            <div
              className="animate-cascade slate-card rounded-[24px] p-3.5 space-y-3"
              style={{ animationDelay: '35ms' }}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 relative flex items-center slate-well rounded-xl px-3 py-2">
                  <SearchIcon className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                  <input
                    type="text"
                    placeholder="Поиск рецепта или ингредиента..."
                    value={recipeSearch}
                    onChange={(e) => setRecipeSearch(e.target.value)}
                    className="w-full bg-transparent text-xs text-slate-50 placeholder:text-slate-500 focus:outline-none"
                  />
                  {recipeSearch && (
                    <button
                      onClick={() => setRecipeSearch('')}
                      className="text-slate-400 hover:text-white font-mono text-xs px-1"
                    >
                      ×
                    </button>
                  )}
                </div>

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
                  className="h-9 px-3 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 active:scale-95 transition-transform"
                  title="Распознать еду по фото (AI)"
                >
                  <CameraIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{aiFoodLoading ? 'AI...' : 'Фото'}</span>
                </button>
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setIsAddRecipeSheetOpen(true);
                  }}
                  className="h-9 px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 shrink-0 active:scale-95 transition-transform"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>Свой</span>
                </button>
              </div>

              {/* Live Horizontal Category Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {RECIPE_CATEGORIES.map((cat) => {
                  const active = recipeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setRecipeCategory(cat);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all active:scale-95 inline-flex items-center gap-1 ${
                        active
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-md shadow-amber-400/20'
                          : 'bg-slate-950/75 text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {cat === 'Избранное' && <HeartIcon className="w-3 h-3" filled={active} />}
                      <span>{cat}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick Sort Pills */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-400/10">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'default', label: 'Все' },
                      { id: 'protein', label: 'Топ белок' },
                      { id: 'light', label: 'До 420 ккал' },
                      { id: 'video', label: 'С видео' },
                    ] as { id: RecipeSortMode; label: string }[]
                  ).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setRecipeSort(s.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold shrink-0 transition-colors ${
                        recipeSort === s.id
                          ? 'bg-slate-800 text-amber-300 border border-amber-400/30'
                          : 'bg-slate-950/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[10px] text-slate-500 shrink-0">{filteredRecipes.length} шт</span>
              </div>
            </div>

            {filteredRecipes.length === 0 ? (
              <div className="slate-card rounded-[24px] p-8 text-center text-xs text-slate-400">
                Ничего не найдено. Попробуй сбросить фильтр или добавь свой рецепт.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredRecipes.map((meal, idx) => {
                  const isFav = favoriteRecipes.includes(meal.id);
                  const totalMacros = Math.max(1, meal.p + meal.f + meal.c);
                  const pW = Math.round((meal.p / totalMacros) * 100);
                  const fW = Math.round((meal.f / totalMacros) * 100);
                  const cW = Math.max(0, 100 - pW - fW);

                  return (
                    <div
                      key={meal.id}
                      style={{ animationDelay: `${60 + Math.min(idx, 8) * 30}ms` }}
                      onClick={() => {
                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                        setRecipePortionScale(1);
                        setActiveRecipeSheet(meal);
                      }}
                      className="animate-cascade slate-card rounded-[26px] p-4 cursor-pointer transition-transform active:scale-[0.985] flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase rounded-full bg-amber-400/15 text-amber-200 border border-amber-400/25">
                              {meal.category}
                            </span>
                            {meal.video && (
                              <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-900/90 text-slate-300 inline-flex items-center gap-1">
                                <PlayIcon className="w-2.5 h-2.5" />
                                <span>Видео</span>
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavoriteRecipe(meal.id);
                            }}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-colors ${
                              isFav ? 'text-rose-400 bg-rose-500/15' : 'text-slate-500 hover:text-slate-200 bg-slate-900/70'
                            }`}
                            title="В избранное"
                          >
                            <HeartIcon className="w-4 h-4" filled={isFav} />
                          </button>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-50 leading-snug">{meal.name}</h3>
                        <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">{meal.ingredients}</p>
                      </div>

                      <div className="mt-3.5 space-y-2.5">
                        {/* 3-color Macro Balance Strip */}
                        <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-slate-950/80">
                          <div style={{ width: `${pW}%` }} className="bg-teal-400" title={`Белки ${meal.p}г`} />
                          <div style={{ width: `${fW}%` }} className="bg-amber-400" title={`Жиры ${meal.f}г`} />
                          <div style={{ width: `${cW}%` }} className="bg-sky-400" title={`Углеводы ${meal.c}г`} />
                        </div>

                        <div className="pt-2 border-t border-slate-400/10 flex items-center justify-between gap-2">
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
                              className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 flex items-center justify-center active:scale-90 transition-transform"
                              title="В список покупок"
                            >
                              <CartIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                addMealToLog(meal, 1);
                                showToast(`+ ${meal.name} в рацион ✓`, 2200);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-mono text-xs font-extrabold active:scale-90 transition-transform"
                            >
                              + В рацион
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: КУХНЯ (СЕГМЕНТЫ: РАЦИОН / ХОЛОДИЛЬНИК / ПОКУПКИ) ================= */}
        {activeTab === 'fridge' && (() => {
          const remainKcal = Math.max(0, targetKcal - Math.round(nutritionTotals.kcal));
          const remainProt = Math.max(0, targetProtein - Math.round(nutritionTotals.p));
          const waterTargetMl = Math.max(2000, Math.round((nutritionLog.bodyweight || 78) * 35 / 50) * 50);
          const waterPct = Math.min(100, Math.round((waterMl / waterTargetMl) * 100));

          const sniperPicks =
            remainKcal >= 80
              ? [...mealTemplates]
                  .filter((m) => m.kcal <= remainKcal + 120)
                  .sort((a, b) => {
                    const aScore = Math.abs(remainKcal - a.kcal) - (remainProt > 15 ? a.p * 4 : 0);
                    const bScore = Math.abs(remainKcal - b.kcal) - (remainProt > 15 ? b.p * 4 : 0);
                    return aScore - bScore;
                  })
                  .slice(0, 2)
              : [];

          const kitchenSubTabs: { id: KitchenSubTab; label: string; badge?: number }[] = [
            { id: 'ration', label: 'Рацион' },
            { id: 'fridge', label: 'Холодильник', badge: fridgeMatchedRecipes.length },
            { id: 'shopping', label: 'Покупки', badge: shoppingList.filter((i) => !i.done).length },
          ];
          const activeSubIdx = Math.max(0, kitchenSubTabs.findIndex((t) => t.id === kitchenSubTab));

          const groupedEntries: Record<MealSlot, { item: MealTemplate; origIdx: number }[]> = {
            Завтрак: [],
            Обед: [],
            Ужин: [],
            Перекус: [],
          };
          nutritionLog.entries.forEach((item, origIdx) => {
            groupedEntries[getMealSlot(item.category)].push({ item, origIdx });
          });

          return (
            <div className="max-w-3xl mx-auto space-y-4 mt-1">
              {/* iOS Segmented Control */}
              <div className="animate-cascade slate-card rounded-2xl p-1.5" style={{ animationDelay: '30ms' }}>
                <div className="relative grid grid-cols-3">
                  <div
                    style={{
                      width: '33.3333%',
                      transform: `translateX(${activeSubIdx * 100}%)`,
                    }}
                    className="magnetic-pill absolute inset-y-0 left-0 px-0.5 pointer-events-none"
                  >
                    <div className="w-full h-full rounded-xl bg-teal-400 shadow-lg shadow-teal-400/25" />
                  </div>
                  {kitchenSubTabs.map((st) => {
                    const active = kitchenSubTab === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setKitchenSubTab(st.id);
                        }}
                        className={`relative z-10 py-2 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                          active ? 'text-slate-950' : 'text-slate-400 hover:text-slate-100'
                        }`}
                      >
                        <span>{st.label}</span>
                        {st.badge !== undefined && st.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full font-mono text-[10px] ${
                              active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-teal-300'
                            }`}
                          >
                            {st.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SUB-TAB 1: РАЦИОН (КОЛЬЦА КБЖУ + СНАЙПЕР + ВОДА/БАДЫ + ПРИЁМЫ ПИЩИ) */}
              {kitchenSubTab === 'ration' && (
                <div className="space-y-4 animate-cascade" style={{ animationDelay: '50ms' }}>
                  <div className="slate-card rounded-[26px] p-4 sm:p-5 space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-400">Рацион за сегодня</div>
                        <div className="font-mono tabular text-2xl font-bold text-slate-50 mt-0.5">
                          <AnimatedNumber value={nutritionTotals.kcal} />{' '}
                          <span className="text-sm font-normal text-slate-400">/ {targetKcal} ккал</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setIsQuickAddMealOpen(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 shadow-md shadow-teal-400/20 active:scale-95 transition-transform"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                        <span>Быстро</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setNutritionLog((p) => ({ ...p, dayType: 'workout' }));
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                          nutritionLog.dayType === 'workout'
                            ? 'bg-teal-400/20 border border-teal-400/40 text-teal-200 font-bold'
                            : 'slate-well text-slate-400'
                        }`}
                      >
                        Тренировочный (3000)
                      </button>
                      <button
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setNutritionLog((p) => ({ ...p, dayType: 'rest' }));
                        }}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                          nutritionLog.dayType === 'rest'
                            ? 'bg-teal-400/20 border border-teal-400/40 text-teal-200 font-bold'
                            : 'slate-well text-slate-400'
                        }`}
                      >
                        День отдыха (2500)
                      </button>
                    </div>

                    {/* Apple Activity Rings: Калории / Белки / Углеводы */}
                    {(() => {
                      const targetCarbs = Math.round((targetKcal * 0.45) / 4);
                      const kcalPct = Math.min(1, nutritionTotals.kcal / Math.max(1, targetKcal));
                      const protPct = Math.min(1, nutritionTotals.p / Math.max(1, targetProtein));
                      const carbPct = Math.min(1, nutritionTotals.c / Math.max(1, targetCarbs));
                      const r1 = 50;
                      const r2 = 38;
                      const r3 = 26;
                      const c1 = 2 * Math.PI * r1;
                      const c2 = 2 * Math.PI * r2;
                      const c3 = 2 * Math.PI * r3;
                      return (
                        <div className="flex items-center justify-between gap-4 p-3.5 rounded-2xl slate-well">
                          <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
                            <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                              <circle cx="60" cy="60" r={r1} fill="none" stroke="rgba(251,113,133,0.16)" strokeWidth="8.5" />
                              <circle
                                cx="60"
                                cy="60"
                                r={r1}
                                fill="none"
                                stroke="#FB7185"
                                strokeWidth="8.5"
                                strokeLinecap="round"
                                strokeDasharray={c1}
                                strokeDashoffset={c1 * (1 - kcalPct)}
                                className="transition-all duration-700"
                              />
                              <circle cx="60" cy="60" r={r2} fill="none" stroke="rgba(45,212,191,0.16)" strokeWidth="8.5" />
                              <circle
                                cx="60"
                                cy="60"
                                r={r2}
                                fill="none"
                                stroke="#2DD4BF"
                                strokeWidth="8.5"
                                strokeLinecap="round"
                                strokeDasharray={c2}
                                strokeDashoffset={c2 * (1 - protPct)}
                                className="transition-all duration-700"
                              />
                              <circle cx="60" cy="60" r={r3} fill="none" stroke="rgba(56,189,248,0.16)" strokeWidth="8.5" />
                              <circle
                                cx="60"
                                cy="60"
                                r={r3}
                                fill="none"
                                stroke="#38BDF8"
                                strokeWidth="8.5"
                                strokeLinecap="round"
                                strokeDasharray={c3}
                                strokeDashoffset={c3 * (1 - carbPct)}
                                className="transition-all duration-700"
                              />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="font-mono tabular text-sm font-extrabold text-slate-50">
                                {Math.round(kcalPct * 100)}%
                              </span>
                              <span className="text-[9px] uppercase tracking-wider text-slate-400">цель</span>
                            </div>
                          </div>

                          <div className="flex-1 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-slate-300">
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                                Калории
                              </span>
                              <span className="font-mono tabular font-bold text-rose-300">
                                {Math.round(nutritionTotals.kcal)} / {targetKcal}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-slate-300">
                                <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                                Белки
                              </span>
                              <span className="font-mono tabular font-bold text-teal-300">
                                {Math.round(nutritionTotals.p)} / {targetProtein} г
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-slate-300">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                                Углеводы
                              </span>
                              <span className="font-mono tabular font-bold text-sky-300">
                                {Math.round(nutritionTotals.c)} / {targetCarbs} г
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-400/10">
                              <span className="text-slate-400 text-[11px]">Жиры</span>
                              <span className="font-mono tabular text-[11px] font-bold text-amber-300">
                                {Math.round(nutritionTotals.f)} г
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Снайпер КБЖУ */}
                    {sniperPicks.length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-sky-400/[0.06] border border-sky-400/20 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-sky-300 inline-flex items-center gap-1.5">
                            <SparklesIcon className="w-3.5 h-3.5" />
                            <span>Снайпер КБЖУ · Добить норму</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ост. {remainKcal} ккал · Б {remainProt}г
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {sniperPicks.map((pick) => (
                            <div
                              key={pick.id}
                              onClick={() => {
                                setRecipePortionScale(1);
                                setActiveRecipeSheet(pick);
                              }}
                              className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-slate-900 flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-100 truncate">{pick.name}</div>
                                <div className="font-mono text-[10px] text-sky-300">
                                  {pick.kcal} ккал · Б {pick.p}г · У {pick.c}г
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addMealToLog(pick, 1);
                                  showToast(`+ ${pick.name} ✓`, 2000);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-sky-400/20 text-sky-200 font-mono text-xs font-bold shrink-0 active:scale-90"
                              >
                                +
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Вода и БАДы (Креатин / Витамины) */}
                  <div className="slate-card rounded-[26px] p-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-sky-400/15 text-sky-300 flex items-center justify-center">
                          <DropletIcon className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="text-xs font-bold text-slate-50">Вода за сегодня</div>
                          <div className="font-mono text-[11px] text-sky-300">
                            {(waterMl / 1000).toFixed(2)} / {(waterTargetMl / 1000).toFixed(2)} л ({waterPct}%)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setWaterMl((w) => Math.max(0, w - 250));
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-900 text-slate-400 font-mono text-xs font-bold active:scale-90"
                        >
                          -250
                        </button>
                        <button
                          onClick={() => {
                            NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                            setWaterMl((w) => w + 250);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-sky-400/20 border border-sky-400/35 text-sky-200 font-mono text-xs font-bold active:scale-90"
                        >
                          +250
                        </button>
                        <button
                          onClick={() => {
                            NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                            setWaterMl((w) => w + 500);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-sky-400 text-slate-950 font-mono text-xs font-extrabold active:scale-90"
                        >
                          +500
                        </button>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-slate-950/90 overflow-hidden">
                      <div
                        style={{ width: `${waterPct}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 transition-all duration-500"
                      />
                    </div>

                    <div className="pt-2 border-t border-slate-400/10">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">
                        Ежедневные БАДы:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {DAILY_SUPPLEMENTS.map((sup) => {
                          const done = Boolean(supplementsDone[sup.id]);
                          return (
                            <button
                              key={sup.id}
                              onClick={() => {
                                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                setSupplementsDone((prev) => ({ ...prev, [sup.id]: !prev[sup.id] }));
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 inline-flex items-center gap-1.5 ${
                                done
                                  ? 'bg-emerald-400/20 border border-emerald-400/40 text-emerald-200'
                                  : 'slate-well text-slate-400 hover:text-slate-100'
                              }`}
                            >
                              {done && <CheckIcon className="w-3 h-3" />}
                              <span>{sup.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Съедено сегодня (сгруппировано по приёмам пищи) */}
                  <div className="slate-card rounded-[26px] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-50">Приёмы пищи</h3>
                      {nutritionLog.entries.length > 0 && (
                        <button
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setNutritionLog((p) => ({ ...p, entries: [] }));
                          }}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                        >
                          Очистить день
                        </button>
                      )}
                    </div>

                    {nutritionLog.entries.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        Пока пусто. Нажми «+ Быстро» или добавь блюдо из «Рецептов».
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {(['Завтрак', 'Обед', 'Ужин', 'Перекус'] as MealSlot[]).map((slot) => {
                          const slotItems = groupedEntries[slot];
                          if (slotItems.length === 0) return null;
                          const slotKcal = slotItems.reduce((s, x) => s + (Number(x.item.kcal) || 0), 0);
                          return (
                            <div key={slot} className="space-y-1.5">
                              <div className="flex items-center justify-between px-1">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                                  {slot}
                                </span>
                                <span className="font-mono text-[11px] text-slate-400">{slotKcal} ккал</span>
                              </div>
                              {slotItems.map(({ item, origIdx }) => (
                                <div
                                  key={item.uid || origIdx}
                                  className="flex items-center justify-between px-3 py-2.5 rounded-xl slate-well text-xs"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="text-slate-100 truncate font-medium">{item.name}</div>
                                    <div className="font-mono text-[10px] text-slate-400">
                                      Б {item.p} · Ж {item.f} · У {item.c}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono tabular text-slate-200 font-bold">{item.kcal} ккал</span>
                                    <button
                                      onClick={() => {
                                        NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                                        setNutritionLog((p) => ({
                                          ...p,
                                          entries: p.entries.filter((_, i) => i !== origIdx),
                                        }));
                                      }}
                                      className="text-slate-400 hover:text-rose-300 font-mono text-sm px-1"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: ХОЛОДИЛЬНИК + AI-ШЕФ */}
              {kitchenSubTab === 'fridge' && (
                <div className="space-y-4 animate-cascade" style={{ animationDelay: '50ms' }}>
                  <div className="slate-card rounded-[26px] p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-slate-50">Что есть в холодильнике?</h2>
                      <button
                        onClick={() => {
                          NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                          setSelectedFridgeItems([]);
                          setChefRecipe(null);
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 underline"
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
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

                    {/* AI-Chef Generator Button */}
                    <button
                      onClick={() => {
                        NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
                        const generated = generateChefRecipe(selectedFridgeItems, remainKcal, remainProt);
                        setChefRecipe(generated);
                      }}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-teal-400 to-sky-400 text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-teal-400/20 active:scale-95 transition-transform"
                    >
                      <SparklesIcon className="w-4 h-4" />
                      <span>AI-Шеф: придумать блюдо из выбранного</span>
                    </button>

                    {chefRecipe && (
                      <div className="p-3.5 rounded-2xl bg-teal-400/10 border border-teal-400/35 space-y-2.5 animate-cascade">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-mono uppercase text-teal-300 font-bold">
                              AI-Шеф · {chefRecipe.kcal} ккал (Б {chefRecipe.p} · Ж {chefRecipe.f} · У {chefRecipe.c})
                            </div>
                            <div className="text-sm font-bold text-slate-50 mt-0.5">{chefRecipe.name}</div>
                          </div>
                          <button
                            onClick={() => setChefRecipe(null)}
                            className="text-slate-400 hover:text-white font-mono px-1"
                          >
                            ×
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-300">{chefRecipe.ingredients}</p>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{chefRecipe.steps}</p>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => {
                              setMealTemplates((prev) => [chefRecipe, ...prev]);
                              showToast('Рецепт от AI-Шефа сохранён в базу ✓');
                            }}
                            className="py-2 rounded-xl bg-slate-900 text-teal-200 text-xs font-bold active:scale-95"
                          >
                            Сохранить в рецепты
                          </button>
                          <button
                            onClick={() => {
                              addMealToLog(chefRecipe, 1);
                              showToast(`+ ${chefRecipe.name} в рацион ✓`);
                            }}
                            className="py-2 rounded-xl bg-teal-400 text-slate-950 text-xs font-extrabold active:scale-95"
                          >
                            + В рацион
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-400/10 space-y-2">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                        Подходящие рецепты из базы ({fridgeMatchedRecipes.length}):
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
                              showToast(`+ ${m.name} ✓`, 2000);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-teal-400/20 text-teal-200 font-mono text-xs font-bold shrink-0 active:scale-90"
                          >
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* SUB-TAB 3: СПИСОК ПОКУПОК */}
              {kitchenSubTab === 'shopping' && (
                <div className="slate-card rounded-[26px] p-4 space-y-3 animate-cascade" style={{ animationDelay: '50ms' }}>
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
                      className="flex-1 slate-well rounded-xl px-3 py-2.5 text-xs text-slate-50 focus:outline-none"
                    />
                    <button
                      onClick={handleAddManualShoppingItem}
                      className="px-4 py-2.5 rounded-xl bg-teal-400 text-slate-950 font-mono text-xs font-extrabold active:scale-90"
                    >
                      +
                    </button>
                  </div>

                  {shoppingList.length === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center">
                      Список пуст. Нажми на иконку корзины на любом рецепте, чтобы закинуть продукты сюда.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {shoppingList.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                            setShoppingList((prev) =>
                              prev.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it))
                            );
                          }}
                          className={`px-3 py-2.5 rounded-xl slate-well text-xs flex items-center justify-between gap-2 cursor-pointer transition-opacity ${
                            item.done ? 'opacity-45 line-through' : 'opacity-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
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
              )}
            </div>
          );
        })()}

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
                        <TrashIcon className="w-3.5 h-3.5" />
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
                    {pr.label}
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
                <span className="text-xs font-medium text-slate-100 inline-flex items-center gap-1.5"><FileTextIcon className="w-3.5 h-3.5 text-sky-300" /><span>Загрузить PDF</span></span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    progPhotoInputRef.current?.click();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-400/20 border border-sky-400/35 text-sky-200 text-[11px] font-bold"
                >
                  <span className="inline-flex items-center gap-1"><CameraIcon className="w-3.5 h-3.5" /><span>Фото (AI)</span></span>
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
                  + В список покупок
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
                      <span>{scaleIngredientText(cleanIng, recipePortionScale)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 p-3.5 rounded-2xl slate-well text-xs space-y-2.5">
              <div className="text-[11px] font-semibold text-slate-200">Приготовление:</div>
              <p className="text-slate-300 leading-relaxed">{activeRecipeSheet.steps}</p>
              {(() => {
                const mins = extractCookMinutes(activeRecipeSheet.steps);
                if (mins.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {mins.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          startTimer(m * 60);
                          showToast(`Кухонный таймер на ${m} мин запущен ✓`);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/35 text-amber-200 font-mono text-[11px] font-bold inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <ClockIcon className="w-3.5 h-3.5" />
                        <span>Таймер {m} мин</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
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
          {/* Theme & OLED Mode */}
          <div className="p-3.5 rounded-2xl slate-well space-y-2.5">
            <div>
              <div className="font-semibold text-slate-50">Тема оформления</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Pure Black OLED экономит батарею на iPhone</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'ocean-glass', label: 'Ocean Glass' },
                  { id: 'obsidian', label: 'Obsidian' },
                  { id: 'oled', label: 'Pure OLED' },
                  { id: 'titanium', label: 'Titanium' },
                ] as { id: VisualTheme; label: string }[]
              ).map((th) => (
                <button
                  key={th.id}
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setVisualTheme(th.id);
                  }}
                  className={`py-2 rounded-xl font-mono text-[11px] font-bold transition-all active:scale-95 ${
                    visualTheme === th.id
                      ? 'bg-sky-400 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:text-white'
                  }`}
                >
                  {th.label}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-400/10 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">Акцент:</span>
              <div className="flex items-center gap-1.5">
                {ACCENT_PRESETS.map((ap) => (
                  <button
                    key={ap.id}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setAccentPreset(ap.id);
                    }}
                    title={ap.label}
                    style={ap.id !== 'auto' ? { backgroundColor: ap.hex } : undefined}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-mono font-bold transition-transform active:scale-90 ${
                      ap.id === 'auto' ? 'bg-slate-800 text-slate-200 border border-slate-400/30' : ''
                    } ${accentPreset === ap.id ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-110' : 'opacity-75'}`}
                  >
                    {ap.id === 'auto' ? 'A' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

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
        subtitle={isCloudConfigured() ? `Профиль: ${userProfile.name} · Realtime` : 'Требуются ключи Supabase в Vercel'}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-3.5 mt-2 text-xs">
          <div className="p-3 rounded-2xl slate-well space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-slate-400">Личный код облака (для бэкапа):</label>
              <button
                onClick={() => {
                  const nextCode = generateUniqueSyncCode();
                  setSyncCode(nextCode);
                  setUserProfile((p) => ({ ...p, syncCode: nextCode }));
                  setCloudStatus(`Новый личный код: ${nextCode}`);
                }}
                className="text-[10px] font-mono text-sky-300 hover:underline"
              >
                Сгенерировать
              </button>
            </div>
            <input
              type="text"
              value={syncCode}
              onChange={(e) => {
                setSyncCode(e.target.value);
                setUserProfile((p) => ({ ...p, syncCode: e.target.value }));
              }}
              placeholder="iron-xxxxxx"
              className="w-full bg-slate-950/80 border border-slate-400/15 rounded-xl px-3 py-2 font-mono text-xs text-sky-300 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={async () => {
                  setCloudStatus('Отправка в облако...');
                  const res = await pushBackupToCloud(syncCode, buildCurrentPayload());
                  setCloudStatus(res.ok ? 'Сохранено в Supabase ✓' : res.error || 'Ошибка');
                }}
                className="py-2.5 rounded-xl bg-sky-400 text-slate-950 font-extrabold active:scale-95"
              >
                <span className="inline-flex items-center justify-center gap-1.5"><UploadIcon className="w-3.5 h-3.5" /><span>Выгрузить</span></span>
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
                className="py-2.5 rounded-xl bg-slate-900 text-slate-100 font-bold active:scale-95"
              >
                <span className="inline-flex items-center justify-center gap-1.5"><DownloadIcon className="w-3.5 h-3.5" /><span>Загрузить</span></span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-2xl slate-well space-y-2.5">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Код общей Co-op комнаты (с друзьями):</label>
              <input
                type="text"
                disabled={isInLiveRoom}
                value={coopRoomCode}
                onChange={(e) => setCoopRoomCode(e.target.value)}
                placeholder="gym-bros"
                className="w-full bg-slate-950/80 border border-slate-400/15 rounded-xl px-3 py-2 font-mono text-xs text-emerald-300 focus:outline-none disabled:opacity-50"
              />
            </div>

            <button
              onClick={handleToggleLiveRoom}
              className={`w-full py-3 rounded-xl font-extrabold active:scale-95 transition-all ${
                isInLiveRoom ? 'bg-emerald-400 text-slate-950' : 'bg-slate-900 border border-emerald-400/35 text-emerald-300'
              }`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <UsersIcon className="w-4 h-4" />
                <span>{isInLiveRoom ? 'В Live-зале (Отключиться)' : 'Войти в Co-op зал с другом'}</span>
              </span>
            </button>

            {livePeers.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {livePeers.map((p, i) => {
                  const av = getPeerAvatarStyle(p.name);
                  return (
                    <div key={i} className="p-2.5 rounded-xl bg-slate-950/75 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-7 h-7 rounded-lg ${av.bg} ${av.text} font-mono text-xs font-extrabold flex items-center justify-center shrink-0`}>
                          {av.initial}
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-100 truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{p.exercise}</div>
                        </div>
                      </div>
                      <div className="font-mono text-xs text-emerald-300 shrink-0">
                        {p.weightKg ? `${p.weightKg} кг × ${p.reps}` : `${p.completedSets}/${p.totalSets}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {cloudStatus && (
            <div className="p-2.5 rounded-xl slate-well font-mono text-[11px] text-sky-300">{cloudStatus}</div>
          )}
        </div>
      </BottomSheet>

      {/* ================= BOTTOM SHEET: НАВИГАТОР ТРЕНИРОВКИ (НЕДЕЛИ / ДНИ / РЕГУЛЯЦИЯ) ================= */}
      <BottomSheet
        isOpen={isDaySelectorSheetOpen}
        onClose={() => setIsDaySelectorSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title={activeProgram.title}
        subtitle={`Неделя ${weekObj.week} из ${activeProgram.weeks.length} · ${weekObj.title}`}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                setIsDaySelectorSheetOpen(false);
                setProgramsSheetMode('list');
                setIsProgramsSheetOpen(true);
              }}
              className="flex-1 py-2.5 px-3 rounded-xl slate-well text-xs font-bold text-slate-100 active:scale-95 transition-transform"
            >
              Сменить программу ({programs.length})
            </button>
            <button
              onClick={() => {
                NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                setIsDaySelectorSheetOpen(false);
                setProgramsSheetMode('add');
                setIsProgramsSheetOpen(true);
              }}
              className="py-2.5 px-3.5 rounded-xl bg-sky-400/15 border border-sky-400/30 text-sky-200 text-xs font-bold inline-flex items-center gap-1 active:scale-95 transition-transform"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>Новая</span>
            </button>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-2">Неделя цикла:</div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {activeProgram.weeks.map((w) => {
                const active = weekObj.week === w.week;
                return (
                  <button
                    key={w.week}
                    onClick={() => {
                      NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                      setSelectedWeek(w.week);
                    }}
                    className={`px-3.5 py-2 rounded-xl font-mono tabular text-xs font-semibold shrink-0 transition-all active:scale-95 ${
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

          <div>
            <div className="text-[11px] text-slate-400 mb-2">Тренировочный день:</div>
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
          </div>

          <div className="pt-2 border-t border-slate-400/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-slate-400">Авто-регуляция дня (сдвиг %):</span>
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
                  className={`relative z-10 py-2 rounded-lg font-mono text-[11px] font-medium transition-colors ${
                    readinessShift === opt.val ? 'text-slate-50 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setIsDaySelectorSheetOpen(false)}
            className="w-full py-3 rounded-xl bg-sky-400 text-slate-950 text-xs font-extrabold active:scale-95 transition-transform"
          >
            Готово
          </button>
        </div>
      </BottomSheet>

      {/* ================= BOTTOM SHEET: 3D WEBGL ШТАНГА ================= */}
      <BottomSheet
        isOpen={isBarbellSheetOpen}
        onClose={() => setIsBarbellSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="3D-сборка штанги"
        subtitle={activePlateTarget ? activePlateTarget.title : 'Выбери рабочий вес'}
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="mt-2">
          {activePlateTarget ? (
            <Suspense
              fallback={
                <div className="p-8 text-center text-xs font-mono text-slate-400 slate-well rounded-2xl">
                  Загрузка 3D WebGL-сцены...
                </div>
              }
            >
              <BarbellWebGL3D
                targetWeight={activePlateTarget.weight}
                barbellWeight={activePlateTarget.barbell}
                title={activePlateTarget.title}
                hapticsEnabled={iosSettings.hapticsEnabled}
                soundEnabled={iosSettings.soundEffectsEnabled}
              />
            </Suspense>
          ) : (
            <div className="p-6 text-center text-xs text-slate-400 slate-well rounded-2xl">
              В сегодняшнем дне нет упражнений со штангой от 20 кг.
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ================= NATIVE iOS CONFIRMATION SHEET ================= */}
      <BottomSheet
        isOpen={Boolean(confirmDialog)}
        onClose={() => setConfirmDialog(null)}
        onDragProgress={setSheetDragRatio}
        title={confirmDialog?.title || ''}
        subtitle="Подтверждение действия"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        {confirmDialog && (
          <div className="space-y-4 mt-2">
            <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setConfirmDialog(null)}
                className="py-3 rounded-xl slate-well text-xs font-bold text-slate-200 active:scale-95"
              >
                Отмена
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className={`py-3 rounded-xl text-xs font-extrabold active:scale-95 ${
                  confirmDialog.danger
                    ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                    : 'bg-sky-400 text-slate-950'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ================= NATIVE iOS PROMPT SHEET ================= */}
      <BottomSheet
        isOpen={Boolean(promptDialog)}
        onClose={() => setPromptDialog(null)}
        onDragProgress={setSheetDragRatio}
        title={promptDialog?.title || ''}
        subtitle="Введи название"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        {promptDialog && (
          <div className="space-y-3 mt-2">
            <input
              type="text"
              autoFocus
              placeholder={promptDialog.placeholder}
              value={promptDialog.value}
              onChange={(e) =>
                setPromptDialog((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') promptDialog.onSubmit(promptDialog.value);
              }}
              className="w-full slate-well rounded-xl px-3.5 py-3 text-sm text-slate-50 focus:outline-none"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => setPromptDialog(null)}
                className="py-3 rounded-xl slate-well text-xs font-bold text-slate-200 active:scale-95"
              >
                Отмена
              </button>
              <button
                onClick={() => promptDialog.onSubmit(promptDialog.value)}
                className="py-3 rounded-xl bg-sky-400 text-slate-950 text-xs font-extrabold active:scale-95"
              >
                {promptDialog.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* ================= BOTTOM SHEET: БЫСТРЫЙ ПРОФИЛЬ АТЛЕТА ================= */}
      <BottomSheet
        isOpen={isProfileSheetOpen}
        onClose={() => {
          setUserProfile((p) => ({ ...p, onboarded: true }));
          setIsProfileSheetOpen(false);
        }}
        onDragProgress={setSheetDragRatio}
        title={userProfile.onboarded ? 'Профиль атлета' : 'Добро пожаловать в IRON CORE'}
        subtitle="Без регистрации · данные хранятся на твоём устройстве"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-4 mt-2 text-xs">
          {/* Avatar Preview + Name */}
          <div className="flex items-center gap-3 p-3 rounded-2xl slate-well">
            <div
              className={`w-14 h-14 rounded-2xl font-mono text-xl font-extrabold flex items-center justify-center shrink-0 shadow-lg ${
                (AVATAR_COLORS.find((c) => c.id === userProfile.avatarColor) || AVATAR_COLORS[0]).bg
              } ${(AVATAR_COLORS.find((c) => c.id === userProfile.avatarColor) || AVATAR_COLORS[0]).text}`}
            >
              {(userProfile.name.trim().charAt(0) || 'А').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[10px] uppercase tracking-wider text-slate-400 block mb-1">
                Имя или ник (для Co-op зала)
              </label>
              <input
                type="text"
                value={userProfile.name}
                onChange={(e) => setUserProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Например: Максим"
                className="w-full bg-slate-950/80 border border-slate-400/15 rounded-xl px-3 py-2 text-sm font-bold text-slate-50 focus:outline-none"
              />
            </div>
          </div>

          {/* Gender (for DOTS) & Bodyweight */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 rounded-2xl slate-well space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Пол (для DOTS)</span>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setUserProfile((p) => ({ ...p, gender: 'male' }));
                  }}
                  className={`py-2 rounded-xl font-bold text-[11px] transition-all ${
                    userProfile.gender === 'male' ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  Муж
                </button>
                <button
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setUserProfile((p) => ({ ...p, gender: 'female' }));
                  }}
                  className={`py-2 rounded-xl font-bold text-[11px] transition-all ${
                    userProfile.gender === 'female' ? 'bg-rose-400 text-slate-950' : 'bg-slate-900 text-slate-300'
                  }`}
                >
                  Жен
                </button>
              </div>
            </div>

            <div className="p-3 rounded-2xl slate-well space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Вес тела (кг)</span>
              <div className="flex items-baseline gap-1 bg-slate-950/80 border border-slate-400/15 rounded-xl px-3 py-1.5">
                <input
                  type="number"
                  step="0.1"
                  value={nutritionLog.bodyweight || ''}
                  onChange={(e) =>
                    setNutritionLog((prev) => ({
                      ...prev,
                      bodyweight: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full bg-transparent font-mono tabular text-sm font-bold text-slate-50 focus:outline-none"
                />
                <span className="font-mono text-[11px] text-slate-400">кг</span>
              </div>
            </div>
          </div>

          {/* Avatar Color Picker */}
          <div className="p-3 rounded-2xl slate-well flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">Цвет аватара:</span>
            <div className="flex items-center gap-2">
              {AVATAR_COLORS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => {
                    NativeiOSBridge.haptic('light', iosSettings.hapticsEnabled);
                    setUserProfile((p) => ({ ...p, avatarColor: col.id }));
                  }}
                  style={{ backgroundColor: col.hex }}
                  className={`w-7 h-7 rounded-full transition-transform active:scale-90 ${
                    userProfile.avatarColor === col.id
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-110'
                      : 'opacity-70'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Personal Cloud Code */}
          <div className="p-3 rounded-2xl slate-well flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Твой личный код облака</div>
              <div className="font-mono text-xs font-bold text-sky-300 mt-0.5">{syncCode}</div>
            </div>
            <button
              onClick={() => {
                if (navigator.clipboard) {
                  void navigator.clipboard.writeText(syncCode);
                  showToast(`Код ${syncCode} скопирован ✓`);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] font-bold active:scale-90"
            >
              Копировать
            </button>
          </div>

          <button
            onClick={() => {
              NativeiOSBridge.haptic('medium', iosSettings.hapticsEnabled);
              const cleanName = userProfile.name.trim() || 'Атлет';
              setUserProfile((p) => ({ ...p, name: cleanName, onboarded: true }));
              setIsProfileSheetOpen(false);
              showToast(`Профиль «${cleanName}» сохранён ✓`);
            }}
            className="w-full py-3.5 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-extrabold shadow-lg shadow-sky-400/25 active:scale-95 transition-transform"
          >
            {userProfile.onboarded ? 'Сохранить профиль ✓' : 'Начать тренировки ✓'}
          </button>
        </div>
      </BottomSheet>

      {/* ================= BOTTOM SHEET: БЫСТРАЯ ЗАПИСЬ КБЖУ ================= */}
      <BottomSheet
        isOpen={isQuickAddMealOpen}
        onClose={() => setIsQuickAddMealOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="Быстрая запись КБЖУ"
        subtitle="Перекус, протеин или своё блюдо за 3 секунды"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-3.5 mt-2 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">В 1 тап:</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SNACK_PRESETS.map((pr, idx) => (
                <button
                  key={idx}
                  onClick={() => handleAddQuickMeal(pr)}
                  className="px-2.5 py-1.5 rounded-xl slate-well hover:bg-slate-800 text-[11px] text-teal-200 font-semibold active:scale-95"
                >
                  + {pr.name} · {pr.kcal}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-400/10 space-y-2.5">
            <input
              type="text"
              placeholder="Название (напр. Банановые панкейки)"
              value={quickMealName}
              onChange={(e) => setQuickMealName(e.target.value)}
              className="w-full slate-well rounded-xl px-3 py-2.5 text-xs text-slate-50 focus:outline-none"
            />

            <div className="grid grid-cols-4 gap-1.5">
              {(['Завтрак', 'Обед', 'Ужин', 'Перекус'] as MealSlot[]).map((sl) => (
                <button
                  key={sl}
                  onClick={() => setQuickMealSlot(sl)}
                  className={`py-2 rounded-xl text-[11px] font-bold transition-all ${
                    quickMealSlot === sl ? 'bg-teal-400 text-slate-950' : 'slate-well text-slate-300'
                  }`}
                >
                  {sl}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div className="slate-well rounded-xl p-2">
                <span className="text-[10px] text-slate-400 block">Ккал</span>
                <input
                  type="number"
                  placeholder="250"
                  value={quickMealKcal}
                  onChange={(e) => setQuickMealKcal(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-rose-300 focus:outline-none"
                />
              </div>
              <div className="slate-well rounded-xl p-2">
                <span className="text-[10px] text-slate-400 block">Белки</span>
                <input
                  type="number"
                  placeholder="20"
                  value={quickMealP}
                  onChange={(e) => setQuickMealP(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-teal-300 focus:outline-none"
                />
              </div>
              <div className="slate-well rounded-xl p-2">
                <span className="text-[10px] text-slate-400 block">Жиры</span>
                <input
                  type="number"
                  placeholder="8"
                  value={quickMealF}
                  onChange={(e) => setQuickMealF(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-amber-300 focus:outline-none"
                />
              </div>
              <div className="slate-well rounded-xl p-2">
                <span className="text-[10px] text-slate-400 block">Углев.</span>
                <input
                  type="number"
                  placeholder="25"
                  value={quickMealC}
                  onChange={(e) => setQuickMealC(e.target.value)}
                  className="w-full bg-transparent font-mono text-xs font-bold text-sky-300 focus:outline-none"
                />
              </div>
            </div>

            <button
              disabled={!quickMealName.trim() || !(parseInt(quickMealKcal, 10) > 0)}
              onClick={() => handleAddQuickMeal()}
              className="w-full py-3 rounded-xl bg-teal-400 disabled:bg-slate-900 disabled:text-slate-500 text-slate-950 text-xs font-extrabold active:scale-95 transition-all"
            >
              Добавить в рацион ✓
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ================= BOTTOM SHEET: ДОБАВИТЬ СВОЙ РЕЦЕПТ ================= */}
      <BottomSheet
        isOpen={isAddRecipeSheetOpen}
        onClose={() => setIsAddRecipeSheetOpen(false)}
        onDragProgress={setSheetDragRatio}
        title="Новый свой рецепт"
        subtitle="Сохранится в твою базу рецептов"
        hapticsEnabled={iosSettings.hapticsEnabled}
      >
        <div className="space-y-3 mt-2 text-xs">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 block mb-1">Название блюда:</label>
              <input
                type="text"
                placeholder="Напр. Банановые панкейки"
                value={customRecName}
                onChange={(e) => setCustomRecName(e.target.value)}
                className="w-full slate-well rounded-xl px-3 py-2 text-xs text-slate-50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Категория:</label>
              <select
                value={customRecCat}
                onChange={(e) => setCustomRecCat(e.target.value)}
                className="w-full slate-well rounded-xl px-2.5 py-2 text-xs text-slate-100 focus:outline-none"
              >
                {['Завтрак', 'Обед', 'Ужин', 'Десерты', 'Салаты', 'Выпечка'].map((c) => (
                  <option key={c} value={c} className="bg-slate-950">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="slate-well rounded-xl p-2">
              <span className="text-[10px] text-slate-400 block">Ккал</span>
              <input
                type="number"
                value={customRecKcal}
                onChange={(e) => setCustomRecKcal(e.target.value)}
                className="w-full bg-transparent font-mono text-xs font-bold text-amber-300 focus:outline-none"
              />
            </div>
            <div className="slate-well rounded-xl p-2">
              <span className="text-[10px] text-slate-400 block">Белки</span>
              <input
                type="number"
                value={customRecP}
                onChange={(e) => setCustomRecP(e.target.value)}
                className="w-full bg-transparent font-mono text-xs font-bold text-teal-300 focus:outline-none"
              />
            </div>
            <div className="slate-well rounded-xl p-2">
              <span className="text-[10px] text-slate-400 block">Жиры</span>
              <input
                type="number"
                value={customRecF}
                onChange={(e) => setCustomRecF(e.target.value)}
                className="w-full bg-transparent font-mono text-xs font-bold text-slate-50 focus:outline-none"
              />
            </div>
            <div className="slate-well rounded-xl p-2">
              <span className="text-[10px] text-slate-400 block">Углев.</span>
              <input
                type="number"
                value={customRecC}
                onChange={(e) => setCustomRecC(e.target.value)}
                className="w-full bg-transparent font-mono text-xs font-bold text-sky-300 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Ингредиенты (через запятую):</label>
            <textarea
              rows={2}
              placeholder="Банан — 100 г, яйцо — 2 шт., овсянка — 40 г"
              value={customRecIng}
              onChange={(e) => setCustomRecIng(e.target.value)}
              className="w-full slate-well rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Приготовление:</label>
            <textarea
              rows={2}
              placeholder="Смешать и жарить по 3 минуты с каждой стороны."
              value={customRecSteps}
              onChange={(e) => setCustomRecSteps(e.target.value)}
              className="w-full slate-well rounded-xl p-2.5 text-xs text-slate-100 focus:outline-none"
            />
          </div>

          <button
            disabled={!customRecName.trim()}
            onClick={handleSaveCustomRecipe}
            className="w-full py-3.5 rounded-xl bg-amber-400 disabled:bg-slate-900 disabled:text-slate-500 text-slate-950 text-xs font-extrabold active:scale-95 transition-all"
          >
            Сохранить рецепт ✓
          </button>
        </div>
      </BottomSheet>

      {/* ================= FLOATING ACTION BAR: «СЛЕДУЮЩИЙ ПОДХОД» + «ЗАЛ» ================= */}
      {activeTab === 'workout' && (
        <div className="fixed bottom-[calc(4.65rem+env(safe-area-inset-bottom))] left-0 right-0 px-4 z-40 pointer-events-none">
          <div className="max-w-xl mx-auto pointer-events-auto space-y-1.5">
            {voiceActive && (
              <div className="px-3 py-1.5 rounded-2xl bg-rose-500/20 border border-rose-400/40 backdrop-blur-md flex items-center justify-between gap-2 text-[11px] font-mono text-rose-200">
                <span className="truncate">
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <MicIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{voiceLastPhrase ? `«${voiceLastPhrase}»` : 'Слушаю: «Готово», «Легко», «Какой вес», «Таймер 3»'}</span>
                  </span>
                </span>
                <button
                  onClick={handleToggleVoiceCoach}
                  className="shrink-0 text-rose-100 underline"
                >
                  Стоп
                </button>
              </div>
            )}

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
                    onClick={handleToggleVoiceCoach}
                    className={`shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center text-sm active:scale-90 transition-all ${
                      voiceActive
                        ? 'bg-rose-500/25 border-rose-400/60 text-rose-200 animate-pulse'
                        : 'bg-slate-900 hover:bg-slate-800 border-slate-400/15 text-slate-200'
                    }`}
                    title="Голосовой помощник"
                  >
                    <MicIcon className="w-4 h-4" />
                  </button>
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
                  Все подходы сегодняшней тренировки выполнены ✓
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
                <span className="flex items-center justify-center">{tab.icon}</span>
                <span className="text-[11px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
