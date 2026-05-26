// api/admin-auth.js — Vérification admin sécurisée (CommonJS)
// Le mot de passe est UNIQUEMENT dans les variables d'environnement Vercel

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false });

  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'ADMIN_PASSWORD non configuré sur Vercel' });

  if (password === ADMIN_PASSWORD) {
    // Générer un token temporaire (valable 8h)
    const token = Buffer.from(ADMIN_PASSWORD + ':' + Date.now()).toString('base64');
    return res.status(200).json({ ok: true, token });
  } else {
    return res.status(401).json({ ok: false });
  }
};
