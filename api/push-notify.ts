export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { action, subscription } = req.body || {};
  if (action === 'register' && subscription) {
    return res.status(200).json({ ok: true, registered: true });
  }
  return res.status(200).json({ ok: true });
}
