import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { FullBackupPayload } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return client;
}

export async function pushBackupToCloud(syncCode: string, payload: FullBackupPayload): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabaseClient();
  if (!sb) return { ok: false, error: 'Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в Vercel.' };
  const cleanCode = syncCode.trim().toLowerCase();
  if (!cleanCode) return { ok: false, error: 'Укажи код синхронизации (например, max-iron).' };

  const { error } = await sb.from('ironcore_backups').upsert({
    sync_code: cleanCode,
    payload,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function pullBackupFromCloud(syncCode: string): Promise<{ ok: boolean; payload?: FullBackupPayload; error?: string }> {
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
  updatedAt: number;
}

export function joinLiveGymRoom(
  roomCode: string,
  myState: LiveGymPeerState,
  onPeersChange: (peers: LiveGymPeerState[]) => void
): { updateMyState: (next: LiveGymPeerState) => void; leave: () => void } | null {
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
    leave: () => {
      isSubscribed = false;
      void sb.removeChannel(channel);
    },
  };
}
