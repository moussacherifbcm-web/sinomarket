export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Methode non autorisee' });
  try {
    const { messages, systemPrompt } = req.body;
    const GEMINI_KEY = 'AIzaSyD268NQRvSw_i4kNxtw4gm9UeBhZeaXZiw';
    const contents = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: systemPrompt + ' Compris ?' }] });
      contents.push({ role: 'model', parts: [{ text: 'Compris ! Je suis Emanus.' }] });
    }
    (messages || []).forEach(function(m) {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
    });
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + GEMINI_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: contents })
    });
    const data = await response.json();
    const reply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ reply: reply });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
