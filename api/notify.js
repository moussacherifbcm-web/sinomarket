// api/notify.js — Envoyer des notifications via OneSignal
// La REST API Key doit être dans les variables d'environnement Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const ONESIGNAL_APP_ID  = 'c0d6e876-3cfd-41cf-9631-436e7a714a2b';
  const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_KEY;

  if (!ONESIGNAL_API_KEY) {
    return res.status(500).json({ error: 'ONESIGNAL_REST_KEY manquante dans les variables Vercel' });
  }

  const { type, data } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Type manquant' });

  // ===== CONSTRUIRE LE MESSAGE SELON LE TYPE =====
  let notification = {};

  switch (type) {

    // Admin reçoit une nouvelle commande
    case 'nouvelle_commande':
      notification = {
        headings: { fr: '🛍️ Nouvelle commande !' },
        contents: { fr: `Commande ${data.numero} — ${data.total?.toLocaleString()} CFA de ${data.nom_client}` },
        url: 'https://sinomarket-swart.vercel.app',
        filters: [{ field: 'tag', key: 'role', relation: '=', value: 'admin' }],
        data: { type: 'commande', id: data.id }
      };
      break;

    // Client notifié quand son statut change
    case 'statut_commande':
      const statutMessages = {
        paye:               { title: '💰 Paiement confirmé !',    msg: `Votre commande ${data.numero} est confirmée. Merci !` },
        expedie:            { title: '📦 Commande expédiée !',    msg: `Votre commande ${data.numero} est en route depuis la Chine.` },
        arrive_pays:        { title: '🛬 Arrivée au Burkina !',   msg: `Votre commande ${data.numero} est arrivée au Burkina Faso.` },
        livraison_en_cours: { title: '🚚 Livraison en cours !',   msg: `Votre commande ${data.numero} est en cours de livraison.` },
        livre:              { title: '🎉 Commande livrée !',      msg: `Votre commande ${data.numero} a été livrée. Merci de votre confiance !` },
        annule:             { title: '❌ Commande annulée',       msg: `Votre commande ${data.numero} a été annulée. Contactez-nous pour plus d'infos.` },
      };
      const sm = statutMessages[data.statut] || { title: '📋 Mise à jour commande', msg: `Statut de ${data.numero} : ${data.statut}` };
      notification = {
        headings: { fr: sm.title },
        contents: { fr: sm.msg },
        url: 'https://sinomarket-swart.vercel.app',
        filters: [{ field: 'tag', key: 'user_id', relation: '=', value: data.user_id }],
        data: { type: 'statut', numero: data.numero }
      };
      break;

    // Notification à tous (promo, annonce)
    case 'broadcast':
      notification = {
        headings: { fr: data.title || '📢 SinoMarket BF' },
        contents: { fr: data.message },
        url: data.url || 'https://sinomarket-swart.vercel.app',
        included_segments: ['Total Subscriptions'],
      };
      break;

    default:
      return res.status(400).json({ error: 'Type inconnu: ' + type });
  }

  // ===== ENVOYER VIA ONESIGNAL API =====
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        ...notification,
        // Fallback si aucun abonné trouvé par filtre
        ...(notification.filters && !notification.included_segments ? {
          included_segments: []
        } : {})
      })
    });

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      console.error('OneSignal errors:', result.errors);
    }

    return res.status(200).json({ success: true, id: result.id, recipients: result.recipients });

  } catch (err) {
    console.error('Notify error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
