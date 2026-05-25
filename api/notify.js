// api/notify.js — CommonJS

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const ONESIGNAL_APP_ID  = 'c0d6e876-3cfd-41cf-9631-436e7a714a2b';
  const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_KEY;
  if (!ONESIGNAL_API_KEY) return res.status(500).json({ error: 'ONESIGNAL_REST_KEY manquante' });

  const { type, data } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Type manquant' });

  let notification = {};

  if (type === 'nouvelle_commande') {
    notification = {
      headings: { fr: '🛍️ Nouvelle commande !' },
      contents: { fr: 'Commande ' + data.numero + ' — ' + (data.total||0).toLocaleString() + ' CFA de ' + data.nom_client },
      included_segments: ['Total Subscriptions'],
      filters: [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }]
    };
  } else if (type === 'statut_commande') {
    const msgs = {
      paye:               ['💰 Paiement confirmé !',   'Votre commande ' + data.numero + ' est confirmée.'],
      expedie:            ['📦 Commande expédiée !',   'Votre commande ' + data.numero + ' est en route.'],
      arrive_pays:        ['🛬 Arrivée au Burkina !',  'Votre commande ' + data.numero + ' est au Burkina.'],
      livraison_en_cours: ['🚚 Livraison en cours !',  'Votre commande ' + data.numero + ' est en livraison.'],
      livre:              ['🎉 Commande livrée !',     'Votre commande ' + data.numero + ' a été livrée !'],
      annule:             ['❌ Commande annulée',      'Votre commande ' + data.numero + ' a été annulée.'],
    };
    const m = msgs[data.statut] || ['📋 Mise à jour', 'Statut de ' + data.numero + ' : ' + data.statut];
    notification = {
      headings: { fr: m[0] },
      contents: { fr: m[1] },
      filters: [{ field: 'tag', key: 'user_id', relation: '=', value: String(data.user_id) }]
    };
  } else if (type === 'broadcast') {
    notification = {
      headings: { fr: data.title || '📢 SinoMarket BF' },
      contents: { fr: data.message },
      included_segments: ['Total Subscriptions']
    };
  } else {
    return res.status(400).json({ error: 'Type inconnu' });
  }

  try {
    const r = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + ONESIGNAL_API_KEY
      },
      body: JSON.stringify({ app_id: ONESIGNAL_APP_ID, ...notification })
    });
    const result = await r.json();
    return res.status(200).json({ success: true, id: result.id, recipients: result.recipients });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
