import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { FullBackupPayload, NutritionDayRecord, WorkoutSessionRecord } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

/**
 * Ensures an authenticated Supabase session (using Anonymous Auth when enabled)
 * so RLS-protected tables (workout_sessions, nutrition_days) work seamlessly
 * without forcing a signup screen.
 */
export async function ensureCloudAuthSession(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data: existing } = await sb.auth.getSession();
    if (existing.session?.user?.id) {
      return existing.session.user.id;
    }
    const { data: anon, error } = await sb.auth.signInAnonymously();
    if (error || !anon.user?.id) return null;
    return anon.user.id;
  } catch {
    return null;
  }
}

export async function syncWorkoutSessionToCloud(
  session: WorkoutSessionRecord
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase не настроен.' };
  const userId = await ensureCloudAuthSession();
  if (!userId) return { ok: false, error: 'Анонимная авторизация Supabase отключена.' };

  const { error } = await sb.from('workout_sessions').upsert({
    id: session.id,
    user_id: userId,
    session_date: session.date,
    program_id: session.programId,
    program_title: session.programTitle,
    week: session.week,
    day_title: session.dayTitle,
    tonnage_kg: session.tonnageKg,
    completed_sets: session.completedSets,
    total_sets: session.totalSets,
    exercises: session.exercises,
    muscle_load: session.muscleLoad,
    updated_at: session.updatedAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function syncNutritionDayToCloud(
  day: NutritionDayRecord
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase не настроен.' };
  const userId = await ensureCloudAuthSession();
  if (!userId) return { ok: false, error: 'Анонимная авторизация Supabase отключена.' };

  const { error } = await sb.from('nutrition_days').upsert({
    user_id: userId,
    day_date: day.date,
    bodyweight: day.bodyweight,
    day_type: day.dayType,
    kcal: day.kcal,
    protein: day.p,
    fat: day.f,
    carbs: day.c,
    water_ml: day.waterMl,
    entries: day.entries,
    updated_at: day.updatedAt,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pushBackupToCloud(
  syncCode: string,
  payload: FullBackupPayload
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel.' };
  const cleanCode = syncCode.trim().toLowerCase();
  if (!cleanCode) return { ok: false, error: 'Укажи код синхронизации (например, max-iron).' };

  const userId = await ensureCloudAuthSession();
  const row: Record<string, unknown> = {
    sync_code: cleanCode,
    payload,
    updated_at: new Date().toISOString(),
  };
  if (userId) row.user_id = userId;

  const { error } = await sb.from('ironcore_backups').upsert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pullBackupFromCloud(
  syncCode: string
): Promise<{ ok: boolean; payload?: FullBackupPayload; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Supabase не настроен в переменных окружения.' };
  const cleanCode = syncCode.trim().toLowerCase();
  if (!cleanCode) return { ok: false, error: 'Укажи код синхронизации.' };

  const { data, error } = await sb
    .from('ironcore_backups')
    .select('payload')
    .eq('sync_code', cleanCode)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data?.payload) return { ok: false, error: 'Сохранений с таким кодом пока нет.' };
  return { ok: true, payload: data.payload as FullBackupPayload };
}

export interface LiveGymPeerState {
  name: string;
  exercise: string;
  weightKg: number | null;
  reps: number;
  completedSets: number;
  totalSets: number;
  tonnageKg?: number;
  updatedAt: number;
}

export interface LiveGymReaction {
  from: string;
  emoji: string;
  label: string;
  at: number;
}

export function joinLiveGymRoom(
  roomCode: string,
  myState: LiveGymPeerState,
  onPeersChange: (peers: LiveGymPeerState[]) => void,
  onReaction?: (reaction: LiveGymReaction) => void
): {
  updateMyState: (next: LiveGymPeerState) => void;
  sendReaction: (emoji: string, label: string) => void;
  leave: () => void;
} | null {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const myKey = `${myState.name}-${Math.random().toString(36).slice(2, 6)}`;
  let latestState: LiveGymPeerState = myState;
  let isSubscribed = false;
  const peersMap = new Map<string, LiveGymPeerState>();

  const emitPeers = () => {
    onPeersChange(Array.from(peersMap.values()));
  };

  const channel: RealtimeChannel = sb.channel(`ironcore-gym-${roomCode.trim().toLowerCase()}`, {
    config: {
      presence: { key: myKey },
      broadcast: { self: true },
    },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<LiveGymPeerState>();
      const activeKeys = new Set<string>();
      Object.entries(state).forEach(([key, entries]) => {
        activeKeys.add(key);
        const latest = entries[entries.length - 1];
        if (latest) {
          const prev = peersMap.get(key);
          if (!prev || (latest.updatedAt || 0) >= (prev.updatedAt || 0)) {
            peersMap.set(key, latest);
          }
        }
      });
      for (const key of Array.from(peersMap.keys())) {
        if (!activeKeys.has(key)) peersMap.delete(key);
      }
      emitPeers();
    })
    .on('broadcast', { event: 'peer-update' }, ({ payload }) => {
      if (payload?.key && payload?.state) {
        peersMap.set(payload.key, payload.state as LiveGymPeerState);
        emitPeers();
      }
    })
    .on('broadcast', { event: 'gym-reaction' }, ({ payload }) => {
      if (payload?.from && payload?.key !== myKey) {
        onReaction?.({
          from: String(payload.from),
          emoji: String(payload.emoji || '🔥'),
          label: String(payload.label || ''),
          at: Number(payload.at) || Date.now(),
        });
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        isSubscribed = true;
        await channel.track(latestState);
      }
    });

  return {
    updateMyState: (next: LiveGymPeerState) => {
      latestState = next;
      peersMap.set(myKey, next);
      emitPeers();
      if (isSubscribed) {
        void channel.send({
          type: 'broadcast',
          event: 'peer-update',
          payload: { key: myKey, state: next },
        });
        void channel.track(next);
      }
    },
    sendReaction: (emoji: string, label: string) => {
      if (isSubscribed) {
        void channel.send({
          type: 'broadcast',
          event: 'gym-reaction',
          payload: { key: myKey, from: latestState.name, emoji, label, at: Date.now() },
        });
      }
    },
    leave: () => {
      isSubscribed = false;
      void sb.removeChannel(channel);
    },
  };
}


// ================= OFFLINE SYNC QUEUE FOR GYM BASEMENTS (iOS PWA) =================
type QueuedCloudItem =
  | { kind: 'workout'; data: WorkoutSessionRecord }
  | { kind: 'nutrition'; data: NutritionDayRecord };

const OFFLINE_QUEUE_KEY = 'ironcore_cloud_offline_queue_v1';

function readOfflineQueue(): QueuedCloudItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(items: QueuedCloudItem[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items.slice(-40)));
  } catch {}
}

export function enqueueOfflineCloudItem(item: QueuedCloudItem): void {
  const queue = readOfflineQueue();
  const deduped = queue.filter((q) => {
    if (q.kind !== item.kind) return true;
    if (q.kind === 'workout' && item.kind === 'workout') return q.data.id !== item.data.id;
    if (q.kind === 'nutrition' && item.kind === 'nutrition') return q.data.date !== item.data.date;
    return true;
  });
  deduped.push(item);
  writeOfflineQueue(deduped);
}

export async function flushOfflineCloudQueue(): Promise<number> {
  if (!isCloudConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const queue = readOfflineQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedCloudItem[] = [];
  let flushed = 0;

  for (const item of queue) {
    const res =
      item.kind === 'workout'
        ? await syncWorkoutSessionToCloud(item.data)
        : await syncNutritionDayToCloud(item.data);
    if (res.ok) flushed++;
    else remaining.push(item);
  }

  writeOfflineQueue(remaining);
  return flushed;
}

export async function syncWorkoutSessionReliable(session: WorkoutSessionRecord): Promise<void> {
  if (!isCloudConfigured()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineCloudItem({ kind: 'workout', data: session });
    return;
  }
  const res = await syncWorkoutSessionToCloud(session);
  if (!res.ok) {
    enqueueOfflineCloudItem({ kind: 'workout', data: session });
  }
}

export async function syncNutritionDayReliable(day: NutritionDayRecord): Promise<void> {
  if (!isCloudConfigured()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineCloudItem({ kind: 'nutrition', data: day });
    return;
  }
  const res = await syncNutritionDayToCloud(day);
  if (!res.ok) {
    enqueueOfflineCloudItem({ kind: 'nutrition', data: day });
  }
}

let offlineListenerBound = false;
export function initOfflineCloudSync(): void {
  if (typeof window === 'undefined' || offlineListenerBound) return;
  offlineListenerBound = true;
  window.addEventListener('online', () => {
    void flushOfflineCloudQueue();
  });
  void flushOfflineCloudQueue();
}
