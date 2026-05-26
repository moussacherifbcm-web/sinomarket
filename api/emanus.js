// api/emanus.js — SinoMarket BF (CommonJS)
// Utilise l'API Google Gemini

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY manquante dans les variables Vercel');
    return res.status(500).json({ error: 'Clé API manquante', reply: '⚠️ Service non configuré. Contactez l\'administrateur.' });
  }

  const { messages, systemPrompt } = req.body || {};

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages manquants' });
  }

  try {
    // Construire l'historique Gemini
    const contents = [];

    // Ajouter les messages de l'historique
    for (const msg of messages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // S'assurer que le dernier message est bien de l'user
    if (contents.length === 0 || contents[contents.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Le dernier message doit être de l\'utilisateur' });
    }

    const body = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemPrompt || 'Tu es EMANUS, l\'assistant de SinoMarket BF. Réponds en français, de façon courte et utile.' }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
        topP: 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    };

    // Appel API Gemini 1.5 Flash (gratuit et rapide)
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
      console.error('Gemini API error:', response.status, errText);

      // Messages d'erreur explicites selon le code
      if (response.status === 400) {
        return res.status(200).json({ reply: '⚠️ Requête invalide. Réessayez.', error: 'Bad request' });
      }
      if (response.status === 403 || response.status === 401) {
        return res.status(200).json({ reply: '⚠️ Clé API invalide. Contactez l\'administrateur.', error: 'Invalid API key' });
      }
      if (response.status === 429) {
        return res.status(200).json({ reply: '⚠️ Trop de requêtes. Attendez quelques secondes et réessayez.', error: 'Rate limit' });
      }
      return res.status(200).json({ reply: '⚠️ Service temporairement indisponible. Réessayez dans un instant.', error: 'API error ' + response.status });
    }

    const data = await response.json();

    // Extraire la réponse
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!reply) {
      console.error('Réponse Gemini vide:', JSON.stringify(data));
      return res.status(200).json({ reply: 'Je n\'ai pas pu générer une réponse. Reformulez votre question.', error: 'Empty response' });
    }

    return res.status(200).json({ reply: reply.trim() });

  } catch (err) {
    console.error('EMANUS error:', err.message);

    if (err.name === 'AbortError') {
      return res.status(200).json({ reply: '⚠️ La requête a pris trop de temps. Réessayez.', error: 'Timeout' });
    }

    return res.status(200).json({ reply: '⚠️ Erreur de connexion. Vérifiez votre réseau.', error: err.message });
  }
};
