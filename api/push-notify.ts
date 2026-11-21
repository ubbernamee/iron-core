declare const process: { env: Record<string, string | undefined> };
// @ts-ignore
import webpush from 'web-push';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const qstashToken = process.env.QSTASH_TOKEN;

  const { action, subscription, delaySec = 0, title, body } = req.body || {};

  if (action === 'register') {
    return res.status(200).json({ ok: true, registered: true });
  }

  if (!publicKey || !privateKey) {
    return res.status(503).json({ error: 'Не заданы VAPID-ключи в Vercel.' });
  }

  if (!subscription) {
    return res.status(400).json({ error: 'Нет объекта подписки.' });
  }

  // 1. Планируем отложенный пуш через Upstash QStash
  if (action === 'schedule') {
    if (!qstashToken) {
      return res.status(503).json({ error: 'Не задан QSTASH_TOKEN в Vercel.' });
    }

    const host = req.headers?.host ? `https://${req.headers.host}` : 'https://iron-core-sandy.vercel.app';
    const targetUrl = `${host}/api/push-notify`;
    const safeDelay = Math.max(1, Math.min(3600, Math.round(Number(delaySec) || 60)));

    const qRes = await fetch(`https://qstash.upstash.io/v2/publish/${targetUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        'Content-Type': 'application/json',
        'Upstash-Delay': `${safeDelay}s`,
      },
      body: JSON.stringify({
        action: 'send',
        subscription,
        title: title || 'IRON CORE · Отдых завершён!',
        body: body || 'Пора выходить на следующий подход 💪',
      }),
    });

    if (!qRes.ok) {
      const errText = await qRes.text();
      return res.status(502).json({ error: `QStash error: ${errText}` });
    }

    return res.status(200).json({ ok: true, scheduled: true, delaySec: safeDelay });
  }

  // 2. Реальная отправка пуша на устройство (вызывается QStash по таймеру)
  if (action === 'send') {
    try {
      webpush.setVapidDetails('mailto:ironcore@app.local', publicKey, privateKey);
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: title || 'IRON CORE · Отдых завершён!',
          body: body || 'Пора выходить на следующий подход 💪',
        })
      );
      return res.status(200).json({ ok: true, sent: true });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'Ошибка отправки Web Push' });
    }
  }

  return res.status(400).json({ error: 'Неизвестное действие' });
}
