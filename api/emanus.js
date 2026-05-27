// api/emanus.js — SinoMarket BF

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(200).json({ reply: '⚠️ Clé API manquante dans Vercel.' });
  }

  const { messages, systemPrompt } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  const sysPrompt = systemPrompt || `Tu es EMANUS, l'assistant de SinoMarket BF, plateforme d'import Chine vers Burkina Faso. Transport : Avion (10-20 jours) ou Bateau (30-45 jours). Paiement : Orange Money, Moov Money. Réponds en français, de façon courte et sympathique.`;

  // Construire l'historique
  const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  const contents = [];

  // Injecter le system prompt dans le premier message user
  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) continue;

    let text = String(m.content || '');
    // Ajouter le contexte système au 1er message user
    if (role === 'user' && contents.length === 0) {
      text = `[Contexte: ${sysPrompt}]\n\nQuestion: ${text}`;
    }
    contents.push({ role, parts: [{ text }] });
  }

  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    contents.push({ role: 'user', parts: [{ text: String(lastUserMsg.content) }] });
  }

  // Modèles à essayer dans l'ordre (du plus récent au plus ancien)
  const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-pro',
  ];

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 400,
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      // Modèle non disponible → essayer le suivant
      if (response.status === 404) continue;

      // Clé invalide → arrêter
      if (response.status === 401 || response.status === 403) {
        return res.status(200).json({ reply: '⚠️ Clé API invalide. Vérifiez dans Vercel.' });
      }

      // Rate limit
      if (response.status === 429) {
        return res.status(200).json({ reply: '⚠️ Trop de requêtes. Réessayez dans quelques secondes.' });
      }

      if (!response.ok) continue;

      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) continue;

      return res.status(200).json({ reply: reply.trim() });

    } catch (err) {
      if (err.name === 'AbortError') continue;
      continue;
    }
  }

  return res.status(200).json({
    reply: '⚠️ Service EMANUS indisponible. Vérifiez votre clé API Gemini sur Google AI Studio.'
  });
};
