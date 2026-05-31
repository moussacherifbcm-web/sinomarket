// api/emanus.js — SinoMarket BF — Groq API (CommonJS)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(200).json({ reply: '⚠️ Clé API Groq manquante dans Vercel.' });
  }

  const { messages, systemPrompt } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  const sysPrompt = systemPrompt || `Tu es EMANUS, l'assistant intelligent de SinoMarket BF.
SinoMarket BF est une plateforme d'import Chine → Burkina Faso.
Transport disponible : Avion (10-20 jours) ou Bateau (30-45 jours).
Paiement : Orange Money, Moov Money, Wave.
Prix dégressifs disponibles sur certains produits.
Réponds toujours en français, de façon courte, claire et sympathique.
Si tu ne sais pas, dis de contacter WhatsApp.`;

  // Construire les messages pour Groq (format OpenAI compatible)
  const groqMessages = [{ role: 'system', content: sysPrompt }];

  const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'bot');
  for (const m of filtered) {
    const role = m.role === 'bot' ? 'assistant' : m.role;
    const last = groqMessages[groqMessages.length - 1];
    if (last && last.role === role) continue; // éviter doublons
    groqMessages.push({ role, content: String(m.content || '') });
  }

  // S'assurer que le dernier est bien 'user'
  if (groqMessages[groqMessages.length - 1].role !== 'user') {
    groqMessages.push({ role: 'user', content: String(lastUserMsg.content) });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 400,
        temperature: 0.7,
        stream: false
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.status === 401) {
      return res.status(200).json({ reply: '⚠️ Clé API Groq invalide. Vérifiez dans Vercel.' });
    }
    if (response.status === 429) {
      return res.status(200).json({ reply: '⚠️ Trop de requêtes. Réessayez dans quelques secondes.' });
    }
    if (!response.ok) {
      const err = await response.text();
      console.error('Groq error:', response.status, err);
      return res.status(200).json({ reply: '⚠️ Erreur service. Réessayez.' });
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(200).json({ reply: 'Je n\'ai pas compris. Pouvez-vous reformuler ?' });
    }

    return res.status(200).json({ reply: reply.trim() });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(200).json({ reply: '⚠️ Délai dépassé. Réessayez.' });
    }
    console.error('EMANUS Groq error:', err.message);
    return res.status(200).json({ reply: '⚠️ Erreur de connexion. Réessayez.' });
  }
};
