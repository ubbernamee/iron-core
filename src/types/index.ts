export type BaseExerciseId = 'bench' | 'squat' | 'deadlift';
export type ExerciseId = BaseExerciseId | (string & {});

export type MuscleGroupId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'triceps'
  | 'biceps'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export interface ExerciseCatalogEntry {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: MuscleGroupId[];
  secondaryMuscles: MuscleGroupId[];
  /** Relative load coefficients (0..1) per muscle group for 3D workload heatmap */
  muscleWeights: Partial<Record<MuscleGroupId, number>>;
  equipment: 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';
  isCompound: boolean;
}

export interface OneRMHistoryPoint {
  date: string;
  weight: number;
}

export interface ExerciseConfig {
  id: ExerciseId;
  name: string;
  shortName: string;
  aliases: string[];
  oneRepMax: number;
  barbellWeight: number;
  step: number;
  history: OneRMHistoryPoint[];
}

export interface SetBlock {
  pct: number;
  reps: number;
  sets: number;
}

export interface WorkoutItem {
  name: string;
  exId: ExerciseId | null;
  blocks: SetBlock[];
  isBase: boolean;
  note: string;
}

export interface WorkoutDay {
  day: string;
  title: string;
  warmup?: string[];
  items: WorkoutItem[];
}

export interface WorkoutWeek {
  week: number;
  title: string;
  days: WorkoutDay[];
}

export interface TrainingProgram {
  id: string;
  title: string;
  badge: string;
  description: string;
  isBuiltIn: boolean;
  weeks: WorkoutWeek[];
}

export interface LoggedSetEntry {
  weightKg: number | null;
  reps: number;
  rpe?: number;
}

export interface LoggedExerciseEntry {
  name: string;
  catalogId?: string;
  sets: LoggedSetEntry[];
}

export interface WorkoutSessionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  programId: string;
  programTitle: string;
  week: number;
  dayTitle: string;
  tonnageKg: number;
  completedSets: number;
  totalSets: number;
  exercises: LoggedExerciseEntry[];
  muscleLoad: Partial<Record<MuscleGroupId, number>>;
  updatedAt: string;
}

export interface MealTemplate {
  id: string;
  category: string;
  name: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  portionNote: string;
  video?: string;
  ingredients: string;
  steps: string;
  uid?: number;
}

export interface NutritionLog {
  bodyweight: number;
  dayType: 'workout' | 'rest';
  entries: MealTemplate[];
}

export interface NutritionDayRecord {
  date: string; // YYYY-MM-DD
  bodyweight: number;
  dayType: 'workout' | 'rest';
  kcal: number;
  p: number;
  f: number;
  c: number;
  waterMl: number;
  entries: MealTemplate[];
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  text: string;
  recipeName?: string;
  done: boolean;
}

export interface PlateSpec {
  weight: number;
  color: string;
  edge: string;
  height: number;
  width: number;
  label: string;
}

export interface IOSSettings {
  hapticsEnabled: boolean;
  wakeLockEnabled: boolean;
  shortcutsIslandEnabled: boolean;
  shortcutName: string;
  soundEffectsEnabled: boolean;
}

export interface ProgramPosition {
  week: number;
  dayIdx: number;
}

export type TabId = 'workout' | 'recipes' | 'fridge' | 'calc';

export interface SessionState {
  activeTab: TabId;
  activeProgramId: string;
  programPositions: Record<string, ProgramPosition>;
  readinessShift: number;
  recipeCategory: string;
  checkedIngredients: Record<string, boolean>;
  selectedFridgeItems: string[];
  shoppingList: ShoppingItem[];
  timerEndTime: number | null;
  timerTotal: number;
  iosSettings: IOSSettings;
}

export interface FullBackupPayload {
  schemaVersion?: number;
  exportedAt?: string;
  programs: TrainingProgram[];
  activeProgramId: string;
  programPositions: Record<string, ProgramPosition>;
  exercises: ExerciseConfig[];
  completedSets: Record<string, boolean>;
  mealTemplates: MealTemplate[];
  nutritionLog: NutritionLog;
  shoppingList?: ShoppingItem[];
  iosSettings: IOSSettings;
  workoutSessions?: WorkoutSessionRecord[];
  nutritionDays?: NutritionDayRecord[];
  dayOverrides?: Record<string, unknown>;
  weightMemory?: Record<string, number>;
  freestyleItems?: unknown[];
  isFreestyleMode?: boolean;
  userProfile?: unknown;
  favoriteRecipes?: string[];
  waterMl?: number;
  supplementsDone?: Record<string, boolean>;
  visualTheme?: string;
  accentPreset?: string;
  coopRoomCode?: string;
}
