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

  const channel: RealtimeChannel = sb.channel(`ironcore-gym-${roomCode.trim().toLowerCase()}`, {
    config: { presence: { key: `${myState.name}-${Math.random().toString(36).slice(2, 6)}` } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<LiveGymPeerState>();
      const list: LiveGymPeerState[] = [];
      Object.values(state).forEach((entries) => {
        entries.forEach((entry) => list.push(entry));
      });
      onPeersChange(list);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track(myState);
      }
    });

  return {
    updateMyState: (next: LiveGymPeerState) => {
      void channel.track(next);
    },
    leave: () => {
      void sb.removeChannel(channel);
    },
  };
}
