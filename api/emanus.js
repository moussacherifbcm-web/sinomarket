// api/emanus.js — SinoMarket BF (CommonJS)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(200).json({ reply: '⚠️ Service non configuré.' });
  }

  const { messages, systemPrompt } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
  }

  try {
    // Construire l'historique — garder uniquement user/assistant en alternance correcte
    const filtered = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    
    // S'assurer que ça commence par user et finit par user
    const contents = [];
    for (let i = 0; i < filtered.length; i++) {
      const m = filtered[i];
      const geminiRole = m.role === 'assistant' ? 'model' : 'user';
      
      // Éviter 2 messages du même rôle à la suite
      if (contents.length > 0 && contents[contents.length - 1].role === geminiRole) continue;
      
      contents.push({
        role: geminiRole,
        parts: [{ text: String(m.content || '') }]
      });
    }

    // Si vide ou ne finit pas par user → prendre juste le dernier message user
    if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
      const lastUser = filtered.filter(m => m.role === 'user').pop();
      if (!lastUser) {
        return res.status(200).json({ reply: 'Bonjour ! Comment puis-je vous aider ?' });
      }
      contents.push({ role: 'user', parts: [{ text: String(lastUser.content) }] });
    }

    const body = {
      contents,
      systemInstruction: {
        parts: [{ text: systemPrompt || 'Tu es EMANUS, assistant de SinoMarket BF. Réponds en français, de façon courte et utile.' }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', response.status, errText);
      if (response.status === 401 || response.status === 403) {
        return res.status(200).json({ reply: '⚠️ Clé API invalide. Contactez l\'administrateur.', error: errText });
      }
      if (response.status === 429) {
        return res.status(200).json({ reply: '⚠️ Trop de requêtes. Réessayez dans quelques secondes.' });
      }
      return res.status(200).json({ reply: '⚠️ Erreur API (' + response.status + '). Réessayez.', error: errText });
    }

    const data = await response.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('Gemini réponse vide:', JSON.stringify(data));
      return res.status(200).json({ reply: 'Je n\'ai pas compris. Pouvez-vous reformuler ?' });
    }

    return res.status(200).json({ reply: reply.trim() });

  } catch (err) {
    console.error('EMANUS catch:', err.message);
    if (err.name === 'AbortError') {
      return res.status(200).json({ reply: '⚠️ Délai dépassé. Réessayez.' });
    }
    return res.status(200).json({ reply: '⚠️ Erreur: ' + err.message });
  }
};
