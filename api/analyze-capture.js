// api/analyze-capture.js
// Analyse une capture de paiement Mobile Money avec Gemini Vision
// L'image est envoyée en base64 directement — pas besoin de Supabase Storage
// Env vars : GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

const { createClient } = require('@supabase/supabase-js');

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non supportée' });

  const { image_base64, image_mime, montant_attendu, numero_commande, paiement_id } = req.body || {};

  if (!image_base64 || !montant_attendu || !paiement_id) {
    return res.status(400).json({ error: 'image_base64, montant_attendu et paiement_id requis' });
  }

  // Limite taille : base64 d'une image 5Mo ≈ 6.7Mo de texte
  if (image_base64.length > 7 * 1024 * 1024) {
    return res.status(413).json({ error: 'Image trop lourde (max 5 Mo)' });
  }

  try {
    const prompt = `Tu es un système de vérification de paiements Mobile Money pour SinoMarket BF (Burkina Faso).

Analyse cette capture de paiement et réponds UNIQUEMENT en JSON valide, sans texte avant ou après, sans balises markdown :

{
  "est_paiement_valide": true ou false,
  "operateur_detecte": "Wave" ou "Orange Money" ou "Moov Money" ou "autre" ou "inconnu",
  "montant_detecte": nombre entier ou null,
  "montant_correspond": true ou false,
  "reference_transaction": "texte" ou null,
  "date_detectee": "texte" ou null,
  "statut_transaction": "succes" ou "echec" ou "inconnu",
  "score_confiance": nombre entre 0 et 100,
  "validation_auto": true ou false,
  "raison": "explication courte en français"
}

Règles :
- montant_attendu = ${montant_attendu} CFA
- montant_correspond = true si montant détecté est dans ±500 CFA de ${montant_attendu}
- validation_auto = true SEULEMENT si : est_paiement_valide=true ET statut_transaction="succes" ET montant_correspond=true ET score_confiance >= 85
- Commande : ${numero_commande || 'non précisé'}`;

    // Appel Gemini avec image base64 directe
    const geminiResp = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: image_mime || 'image/jpeg',
                data: image_base64
              }
            },
            { text: prompt }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
      })
    });

    if (!geminiResp.ok) {
      const err = await geminiResp.text();
      throw new Error('Erreur Gemini : ' + err.substring(0, 200));
    }

    const geminiData = await geminiResp.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let analyse;
    try {
      analyse = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    } catch (e) {
      throw new Error('Réponse non parseable : ' + rawText.substring(0, 200));
    }

    // Mettre à jour historique_paiements
    const nouveauStatut = analyse.validation_auto ? 'verifie' : 'en_attente_verification';
    const updateData = {
      analyse_ia:        analyse,
      score_confiance:   analyse.score_confiance   || 0,
      montant_detecte:   analyse.montant_detecte   || null,
      operateur_detecte: analyse.operateur_detecte || null,
      statut:            nouveauStatut
    };
    if (analyse.validation_auto) {
      updateData.verifie_at  = new Date().toISOString();
      updateData.verifie_par = 'GEMINI_AUTO';
    }
    await sb().from('historique_paiements').update(updateData).eq('id', paiement_id);

    // Si validé auto → mettre à jour la commande
    if (analyse.validation_auto) {
      const { data: p } = await sb()
        .from('historique_paiements')
        .select('commande_id')
        .eq('id', paiement_id)
        .single();
      if (p?.commande_id) {
        await sb().from('commandes').update({
          paiement_statut:   'paye',
          statut:            'paye',
          statut_updated_at: new Date().toISOString()
        }).eq('id', p.commande_id);
      }
    }

    return res.status(200).json({ ...analyse, statut_final: nouveauStatut });

  } catch (e) {
    console.error('analyze-capture error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
