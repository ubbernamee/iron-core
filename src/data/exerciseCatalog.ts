import { ExerciseCatalogEntry, LoggedExerciseEntry, MuscleGroupId } from '../types';

export const EXERCISE_CATALOG: ExerciseCatalogEntry[] = [
  {
    id: 'bench',
    name: 'Жим штанги лежа',
    aliases: ['жим лежа', 'жим штанги', 'bench', 'жим'],
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    secondaryMuscles: ['core'],
    muscleWeights: { chest: 1.0, triceps: 0.65, front_delts: 0.55, core: 0.15 },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'incline_bench',
    name: 'Жим на наклонной скамье',
    aliases: ['наклон', '30°', '45°', 'incline', 'жим гантелей'],
    primaryMuscles: ['chest', 'front_delts'],
    secondaryMuscles: ['triceps'],
    muscleWeights: { chest: 0.9, front_delts: 0.75, triceps: 0.55 },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'squat',
    name: 'Приседания со штангой',
    aliases: ['присед', 'приседания', 'squat'],
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'lower_back', 'core'],
    muscleWeights: { quads: 1.0, glutes: 0.85, hamstrings: 0.45, lower_back: 0.45, core: 0.5 },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'deadlift',
    name: 'Становая тяга',
    aliases: ['становая', 'мертвая тяга', 'deadlift', 'румынская'],
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    secondaryMuscles: ['upper_back', 'lats', 'quads', 'core'],
    muscleWeights: {
      lower_back: 1.0,
      hamstrings: 0.9,
      glutes: 0.9,
      upper_back: 0.65,
      lats: 0.5,
      quads: 0.35,
      core: 0.5,
    },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'pullups',
    name: 'Подтягивания',
    aliases: ['подтягивания', 'тяга верхнего блока', 'pullup', 'lat pulldown'],
    primaryMuscles: ['lats', 'upper_back'],
    secondaryMuscles: ['biceps', 'rear_delts', 'core'],
    muscleWeights: { lats: 1.0, upper_back: 0.7, biceps: 0.6, rear_delts: 0.35, core: 0.25 },
    equipment: 'bodyweight',
    isCompound: true,
  },
  {
    id: 'rows',
    name: 'Тяга в наклоне / горизонтальный блок',
    aliases: ['тяга штанги', 'тяга гантели', 'тяга блока', 'row', 'тяга к поясу'],
    primaryMuscles: ['upper_back', 'lats'],
    secondaryMuscles: ['rear_delts', 'biceps', 'lower_back'],
    muscleWeights: { upper_back: 1.0, lats: 0.8, rear_delts: 0.55, biceps: 0.5, lower_back: 0.3 },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'dips',
    name: 'Отжимания на брусьях',
    aliases: ['брусья', 'брусьях', 'dips'],
    primaryMuscles: ['chest', 'triceps'],
    secondaryMuscles: ['front_delts'],
    muscleWeights: { triceps: 0.95, chest: 0.85, front_delts: 0.5 },
    equipment: 'bodyweight',
    isCompound: true,
  },
  {
    id: 'ohp',
    name: 'Армейский жим / жим стоя',
    aliases: ['армейский', 'жим стоя', 'жим сидя', 'плечи жим', 'ohp'],
    primaryMuscles: ['front_delts', 'side_delts'],
    secondaryMuscles: ['triceps', 'core'],
    muscleWeights: { front_delts: 1.0, side_delts: 0.65, triceps: 0.6, core: 0.35 },
    equipment: 'barbell',
    isCompound: true,
  },
  {
    id: 'lateral_raise',
    name: 'Махи гантелей в сторону',
    aliases: ['махи', 'разведения на плечи', 'дельты', 'lateral'],
    primaryMuscles: ['side_delts'],
    secondaryMuscles: ['front_delts', 'upper_back'],
    muscleWeights: { side_delts: 1.0, front_delts: 0.25, upper_back: 0.2 },
    equipment: 'dumbbell',
    isCompound: false,
  },
  {
    id: 'triceps_ext',
    name: 'Разгибания на трицепс',
    aliases: ['трицепс', 'французский', 'жим тейта', 'tricep'],
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
    muscleWeights: { triceps: 1.0 },
    equipment: 'cable',
    isCompound: false,
  },
  {
    id: 'biceps_curl',
    name: 'Сгибания на бицепс',
    aliases: ['бицепс', 'молотки', 'curl', 'bicep'],
    primaryMuscles: ['biceps'],
    secondaryMuscles: [],
    muscleWeights: { biceps: 1.0 },
    equipment: 'dumbbell',
    isCompound: false,
  },
  {
    id: 'core_abs',
    name: 'Пресс / Кор',
    aliases: ['пресс', 'скручивания', 'планка', 'подъем ног', 'abs', 'core'],
    primaryMuscles: ['core'],
    secondaryMuscles: [],
    muscleWeights: { core: 1.0 },
    equipment: 'bodyweight',
    isCompound: false,
  },
];

export function matchCatalogExercise(name: string): ExerciseCatalogEntry | null {
  const lower = name.toLowerCase();
  for (const entry of EXERCISE_CATALOG) {
    if (lower.includes(entry.name.toLowerCase())) return entry;
    if (entry.aliases.some((alias) => lower.includes(alias.toLowerCase()))) return entry;
  }
  return null;
}

/**
 * Computes normalized muscle workload (0..100) for a list of logged exercises.
 * Ready to feed directly into a future 3D WebGL/Canvas anatomy workload visualizer.
 */
export function computeMuscleLoad(
  exercises: LoggedExerciseEntry[]
): Partial<Record<MuscleGroupId, number>> {
  const raw: Partial<Record<MuscleGroupId, number>> = {};

  for (const ex of exercises) {
    const entry = matchCatalogExercise(ex.name);
    if (!entry || ex.sets.length === 0) continue;

    const stimulus = ex.sets.reduce((sum, s) => {
      const loadFactor = s.weightKg && s.weightKg > 0 ? Math.min(2.2, 0.7 + s.weightKg / 120) : 0.85;
      const repFactor = Math.min(1.6, 0.5 + s.reps / 12);
      return sum + loadFactor * repFactor;
    }, 0);

    for (const [muscle, weight] of Object.entries(entry.muscleWeights) as [MuscleGroupId, number][]) {
      raw[muscle] = (raw[muscle] || 0) + stimulus * weight;
    }
  }

  const maxVal = Math.max(1, ...Object.values(raw).map((v) => v || 0));
  const normalized: Partial<Record<MuscleGroupId, number>> = {};
  for (const [muscle, val] of Object.entries(raw) as [MuscleGroupId, number][]) {
    normalized[muscle] = Math.min(100, Math.round((val / maxVal) * 100));
  }
  return normalized;
}


export const MUSCLE_LABELS_RU: Record<MuscleGroupId, string> = {
  chest: 'Грудные',
  front_delts: 'Передние дельты',
  side_delts: 'Средние дельты',
  rear_delts: 'Задние дельты',
  triceps: 'Трицепс',
  biceps: 'Бицепс',
  lats: 'Широчайшие',
  upper_back: 'Верх спины',
  lower_back: 'Поясница',
  quads: 'Квадрицепсы',
  hamstrings: 'Бицепс бедра',
  glutes: 'Ягодичные',
  calves: 'Икры',
  core: 'Кор и пресс',
};
