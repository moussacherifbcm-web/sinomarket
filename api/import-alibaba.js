// api/import-alibaba.js — Vercel Serverless Function (CommonJS)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL manquante' });

  const isAlibaba = url.includes('alibaba.com') || url.includes('aliexpress.com') || url.includes('1688.com');
  if (!isAlibaba) return res.status(400).json({ error: 'URL doit être Alibaba, AliExpress ou 1688' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Referer': 'https://www.google.com/'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) throw new Error('HTTP ' + response.status);
    const html = await response.text();

    // Extraction titre
    let nom = null;
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogTitle) nom = ogTitle[1].trim();
    if (!nom) {
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (title) nom = title[1].trim();
    }
    if (nom) {
      nom = nom.replace(/[-|]?\s*(Alibaba\.com|AliExpress|1688\.com).*$/i, '').trim().substring(0, 120);
    }

    // Extraction prix
    let prix = null;
    const pricePatterns = [
      /US\$\s*([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.?\d*)/i,
      /"price"\s*:\s*"?([\d.]+)"?/i,
      /"minPrice"\s*:\s*"?([\d.]+)"?/i,
    ];
    for (const p of pricePatterns) {
      const m = html.match(p);
      if (m) {
        const val = parseFloat(m[1].replace(',', ''));
        if (val > 0) { prix = Math.round(val * 600); break; }
      }
    }

    // Extraction description
    let description = null;
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']{10,})["']/i);
    if (ogDesc) description = ogDesc[1].trim().substring(0, 300);

    // Extraction image principale
    let image_url = null;
    const ogImg = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImg) image_url = ogImg[1].trim();

    // Catégorie auto
    let categorie = 'electronique';
    const txt = ((nom || '') + ' ' + (description || '')).toLowerCase();
    if (/v[eê]tement|chemise|robe|pantalon|jupe|shirt|dress|cloth|mode/.test(txt)) categorie = 'vetements';
    else if (/maison|cuisine|meuble|lampe|vaisselle|home|kitchen/.test(txt)) categorie = 'maison';
    else if (/sport|fitness|gym|v[eé]lo|yoga/.test(txt)) categorie = 'sport';
    else if (/beaut[eé]|cosm[eé]tique|parfum|soin|skincare/.test(txt)) categorie = 'beaute';

    return res.status(200).json({
      success: true,
      produit: {
        nom: nom || 'Produit importé',
        prix: prix || null,
        description: description || '',
        categorie,
        images: image_url ? [image_url] : [],
        image_url: image_url || null,
        lien_alibaba: url,
        origine: 'Chine',
        badge: 'nouveau',
        actif: false
      }
    });

  } catch (err) {
    return res.status(200).json({
      success: false,
      partial: true,
      error: 'Alibaba bloque le scraping. Remplissez les champs manuellement.',
      produit: {
        nom: '', prix: null, description: '',
        categorie: 'electronique', images: [],
        image_url: null, lien_alibaba: url,
        origine: 'Chine', badge: 'nouveau', actif: false
      }
    });
  }
};
