// api/emanus.js — SinoMarket BF (CommonJS)

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

  // Récupérer juste le dernier message utilisateur (plus simple et fiable)
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  // Construire l'historique proprement
  const contents = [];
  const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  for (const m of filtered) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) continue; // éviter doublons
    contents.push({ role, parts: [{ text: String(m.content || '') }] });
  }
  // S'assurer que ça finit par user
  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    contents.push({ role: 'user', parts: [{ text: String(lastUserMsg.content) }] });
  }

  // Essayer plusieurs modèles Gemini dans l'ordre
  const MODELS = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-pro',
  ];

  const sysPrompt = systemPrompt || `Tu es EMANUS, l'assistant intelligent de SinoMarket BF.
SinoMarket BF est une plateforme d'import Chine → Burkina Faso.
Transport : Avion (10-20 jours) ou Bateau (30-45 jours).
Paiement : Orange Money, Moov Money, carte bancaire.
Réponds toujours en français, de façon courte, claire et sympathique.
Si tu ne sais pas, dis de contacter WhatsApp.`;

  let lastError = '';

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
          systemInstruction: { parts: [{ text: sysPrompt }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 400 },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 404) {
        lastError = `Modèle ${model} non disponible`;
        continue; // essayer le modèle suivant
      }

      if (response.status === 401 || response.status === 403) {
        return res.status(200).json({ reply: '⚠️ Clé API invalide. Vérifiez dans Vercel.' });
      }

      if (response.status === 429) {
        return res.status(200).json({ reply: '⚠️ Trop de requêtes. Réessayez dans quelques secondes.' });
      }

      if (!response.ok) {
        const errText = await response.text();
        lastError = `HTTP ${response.status}: ${errText}`;
        continue;
      }

      const data = await response.json();
      const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!reply) {
        lastError = 'Réponse vide de ' + model;
        continue;
      }

      return res.status(200).json({ reply: reply.trim(), model });

    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = 'Timeout sur ' + model;
      } else {
        lastError = err.message;
      }
      continue;
    }
  }

  // Tous les modèles ont échoué
  console.error('Tous les modèles Gemini ont échoué:', lastError);
  return res.status(200).json({
    reply: '⚠️ Service EMANUS indisponible. Contactez-nous sur WhatsApp !',
    error: lastError
  });
};
