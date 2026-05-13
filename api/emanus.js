// api/emanus.js — Vercel Serverless Function
// Proxy sécurisé pour Gemini API

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages invalides' });
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      return res.status(500).json({ error: 'Clé API non configurée' });
    }

    // Construire la requête Gemini
    const geminiContents = [];

    if (systemPrompt) {
      geminiContents.push({
        role: 'user',
        parts: [{ text: systemPrompt + '\n\nCompris ?' }]
      });
      geminiContents.push({
        role: 'model',
        parts: [{ text: 'Compris ! Je suis Emanus, prêt à aider les clients de SinoMarket BF.' }]
      });
    }

    messages.forEach(msg => {
      geminiContents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: geminiContents })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Erreur Gemini: ' + err });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Je n\'ai pas pu répondre.';

    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur serveur: ' + error.message });
  }
}
