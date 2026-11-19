import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  DEFAULT_EXERCISES,
  DEFAULT_MEAL_TEMPLATES,
  DEFAULT_PROGRAMS,
} from '../data/programs';
import {
  ExerciseConfig,
  FullBackupPayload,
  MealTemplate,
  NutritionLog,
  SessionState,
  TrainingProgram,
} from '../types';

export const CURRENT_SCHEMA_VERSION = 2;
const DB_NAME = 'ironcore-db';
const DB_VERSION = 2;

export interface SnapshotRecord {
  id?: number;
  createdAt: string;
  reason: string;
  payload: FullBackupPayload;
}

interface IronCoreDB extends DBSchema {
  kv: {
    key: string;
    value: unknown;
  };
  snapshots: {
    key: number;
    value: SnapshotRecord;
    indexes: { 'by-date': string };
  };
}

let dbPromise: Promise<IDBPDatabase<IronCoreDB>> | null = null;

export function getIronCoreDB(): Promise<IDBPDatabase<IronCoreDB>> {
  if (!dbPromise) {
    dbPromise = openDB<IronCoreDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', {
            keyPath: 'id',
            autoIncrement: true,
          });
          snapStore.createIndex('by-date', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

function readLegacyJson<T>(keys: string[]): T | null {
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw) as T;
    } catch {}
  }
  return null;
}

export function mergeBuiltInPrograms(stored: TrainingProgram[]): TrainingProgram[] {
  const existingIds = new Set(stored.map((p) => p.id));
  const merged = [...stored];
  for (const bp of DEFAULT_PROGRAMS) {
    if (!existingIds.has(bp.id)) {
      merged.push(bp);
    }
  }
  return merged;
}

export interface HydratedStore {
  programs: TrainingProgram[];
  exercises: ExerciseConfig[];
  completedSets: Record<string, boolean>;
  mealTemplates: MealTemplate[];
  nutritionLog: NutritionLog;
  session: Partial<SessionState>;
  migratedFromLocalStorage: boolean;
}

export async function hydrateFromIndexedDB(): Promise<HydratedStore> {
  const db = await getIronCoreDB();
  const schemaVersion = (await db.get('kv', 'schemaVersion')) as number | undefined;

  let migrated = false;

  // One-time seamless migration from legacy localStorage keys (v5–v8)
  if (!schemaVersion) {
    const legacyPrograms = readLegacyJson<TrainingProgram[]>(['ironcore_v6_programs']);
    const legacyExercises = readLegacyJson<ExerciseConfig[]>(['ironcore_v5_ex', 'ironcore_ios_v5_ex']);
    const legacyCompleted = readLegacyJson<Record<string, boolean>>(['ironcore_v5_done', 'ironcore_ios_v5_done']);
    const legacyMeals = readLegacyJson<MealTemplate[]>(['ironcore_v5_meals']);
    const legacyNutr = readLegacyJson<NutritionLog>(['ironcore_v5_nutr', 'ironcore_ios_v5_nutr']);
    const legacySession = readLegacyJson<Partial<SessionState>>([
      'ironcore_v8_session',
      'ironcore_v7_session',
      'ironcore_v6_session',
      'ironcore_v5_session',
    ]);

    const initialPrograms = mergeBuiltInPrograms(
      Array.isArray(legacyPrograms) && legacyPrograms.length > 0 ? legacyPrograms : DEFAULT_PROGRAMS
    );
    const initialExercises =
      Array.isArray(legacyExercises) && legacyExercises.length > 0 ? legacyExercises : DEFAULT_EXERCISES;
    const initialCompleted = legacyCompleted && typeof legacyCompleted === 'object' ? legacyCompleted : {};
    const initialMeals =
      Array.isArray(legacyMeals) && legacyMeals.length > 0 ? legacyMeals : DEFAULT_MEAL_TEMPLATES;
    const initialNutr: NutritionLog = legacyNutr || {
      bodyweight: 78.0,
      dayType: 'workout',
      entries: [DEFAULT_MEAL_TEMPLATES[0]],
    };
    const initialSession: Partial<SessionState> = legacySession || {};

    const tx = db.transaction(['kv', 'snapshots'], 'readwrite');
    await Promise.all([
      tx.objectStore('kv').put(CURRENT_SCHEMA_VERSION, 'schemaVersion'),
      tx.objectStore('kv').put(initialPrograms, 'programs'),
      tx.objectStore('kv').put(initialExercises, 'exercises'),
      tx.objectStore('kv').put(initialCompleted, 'completedSets'),
      tx.objectStore('kv').put(initialMeals, 'mealTemplates'),
      tx.objectStore('kv').put(initialNutr, 'nutritionLog'),
      tx.objectStore('kv').put(initialSession, 'session'),
      tx.objectStore('snapshots').add({
        createdAt: new Date().toISOString(),
        reason: legacyPrograms || legacyExercises || legacyCompleted ? 'Миграция из localStorage' : 'Инициализация базы v9',
        payload: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          programs: initialPrograms,
          activeProgramId: initialSession.activeProgramId || 'path-100kg',
          programPositions: initialSession.programPositions || { 'path-100kg': { week: 1, dayIdx: 0 } },
          exercises: initialExercises,
          completedSets: initialCompleted,
          mealTemplates: initialMeals,
          nutritionLog: initialNutr,
          iosSettings: initialSession.iosSettings || {
            hapticsEnabled: true,
            wakeLockEnabled: true,
            shortcutsIslandEnabled: false,
            shortcutName: 'IronCoreTimer',
          },
        },
      }),
      tx.done,
    ]);

    migrated = Boolean(legacyPrograms || legacyExercises || legacyCompleted);
    return {
      programs: initialPrograms,
      exercises: initialExercises,
      completedSets: initialCompleted,
      mealTemplates: initialMeals,
      nutritionLog: initialNutr,
      session: initialSession,
      migratedFromLocalStorage: migrated,
    };
  }

  // Read existing IndexedDB state & ensure any newly added built-in programs are merged
  const [rawPrograms, rawExercises, rawCompleted, rawMeals, rawNutr, rawSession] = await Promise.all([
    db.get('kv', 'programs') as Promise<TrainingProgram[] | undefined>,
    db.get('kv', 'exercises') as Promise<ExerciseConfig[] | undefined>,
    db.get('kv', 'completedSets') as Promise<Record<string, boolean> | undefined>,
    db.get('kv', 'mealTemplates') as Promise<MealTemplate[] | undefined>,
    db.get('kv', 'nutritionLog') as Promise<NutritionLog | undefined>,
    db.get('kv', 'session') as Promise<Partial<SessionState> | undefined>,
  ]);

  const programs = mergeBuiltInPrograms(
    Array.isArray(rawPrograms) && rawPrograms.length > 0 ? rawPrograms : DEFAULT_PROGRAMS
  );
  if (rawPrograms && programs.length !== rawPrograms.length) {
    await db.put('kv', programs, 'programs');
  }

  return {
    programs,
    exercises: Array.isArray(rawExercises) && rawExercises.length > 0 ? rawExercises : DEFAULT_EXERCISES,
    completedSets: rawCompleted || {},
    mealTemplates: Array.isArray(rawMeals) && rawMeals.length > 0 ? rawMeals : DEFAULT_MEAL_TEMPLATES,
    nutritionLog: rawNutr || { bodyweight: 78.0, dayType: 'workout', entries: [] },
    session: rawSession || {},
    migratedFromLocalStorage: false,
  };
}

export async function saveKV<T>(key: string, value: T): Promise<void> {
  const db = await getIronCoreDB();
  await db.put('kv', value, key);
}

export async function createSafetySnapshot(reason: string, payload: FullBackupPayload): Promise<void> {
  const db = await getIronCoreDB();
  const tx = db.transaction('snapshots', 'readwrite');
  await tx.store.add({
    createdAt: new Date().toISOString(),
    reason,
    payload: { ...payload, schemaVersion: CURRENT_SCHEMA_VERSION },
  });
  // Keep latest 10 snapshots so storage stays lean
  const allKeys = await tx.store.getAllKeys();
  if (allKeys.length > 10) {
    const toDelete = allKeys.slice(0, allKeys.length - 10);
    for (const k of toDelete) {
      await tx.store.delete(k);
    }
  }
  await tx.done;
}

export async function listSafetySnapshots(): Promise<SnapshotRecord[]> {
  const db = await getIronCoreDB();
  const all = await db.getAll('snapshots');
  return all.reverse();
}
