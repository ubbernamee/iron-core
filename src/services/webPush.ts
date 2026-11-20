const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function enableBackgroundPush(): Promise<{ ok: boolean; message: string }> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { ok: false, message: 'Браузер не поддерживает Web Push (на iPhone открой с экрана «Домой»).' };
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return { ok: false, message: 'Доступ к уведомлениям отклонён.' };
  }

  if (!VAPID_PUBLIC_KEY) {
    return {
      ok: true,
      message: 'Локальные уведомления включены. Для фоновых пушей добавь VITE_VAPID_PUBLIC_KEY в Vercel.',
    };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', subscription: sub }),
    });
    return { ok: true, message: 'Фоновые Push-уведомления активированы ✓' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Ошибка подписки Push' };
  }
}

export function sendLocalRestNotification(title: string, body: string): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icon.svg' });
    }
  } catch {}
  export async function scheduleBackgroundPush(
  delaySec: number,
  title: string,
  body: string
): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;

    await fetch('/api/push-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'schedule',
        subscription: sub,
        delaySec,
        title,
        body,
      }),
    });
  } catch {}
}
}
