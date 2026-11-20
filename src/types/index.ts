export type ExerciseId = 'bench' | 'squat' | 'deadlift';

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
}
