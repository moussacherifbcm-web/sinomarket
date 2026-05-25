// api/import-alibaba.js — Vercel Serverless Function
// Scrape produit Alibaba depuis une URL

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL manquante' });

  // Valider que c'est bien Alibaba
  const isAlibaba = url.includes('alibaba.com') || url.includes('aliexpress.com') || url.includes('1688.com');
  if (!isAlibaba) return res.status(400).json({ error: 'URL doit être Alibaba, AliExpress ou 1688' });

  try {
    // Fetch de la page
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Referer': 'https://www.google.com/'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    // ===== EXTRACTION META TAGS =====
    const getMeta = (name) => {
      const patterns = [
        new RegExp(`<meta[^>]*property=["']og:${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${name}["']`, 'i'),
        new RegExp(`<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
      ];
      for (const p of patterns) {
        const m = html.match(p);
        if (m && m[1]) return decodeHTMLEntities(m[1].trim());
      }
      return null;
    };

    // ===== EXTRACTION TITRE =====
    let nom = getMeta('title');
    if (!nom) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) nom = decodeHTMLEntities(titleMatch[1].trim());
    }
    // Nettoyer le titre Alibaba (enlever le nom du site à la fin)
    if (nom) {
      nom = nom.replace(/[-|]?\s*(Alibaba\.com|AliExpress|1688\.com|Buy.*Online|Wholesale.*)$/i, '').trim();
      nom = nom.substring(0, 120);
    }

    // ===== EXTRACTION PRIX =====
    let prix = null;
    const pricePatterns = [
      // Alibaba JSON data
      /"price"\s*:\s*\{[^}]*"value"\s*:\s*"?([\d.]+)"?/i,
      /"minPrice"\s*:\s*"?([\d.]+)"?/i,
      /"priceInfo"\s*:\s*\{[^}]*"price"\s*:\s*"?([\d.]+)"?/i,
      // Prix affichés
      /US\$\s*([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.?\d*)/i,
      /¥\s*([\d,]+\.?\d*)/i,
      /"price"\s*:\s*"?([\d.]+)"?/i,
    ];
    for (const p of pricePatterns) {
      const m = html.match(p);
      if (m && m[1]) {
        const val = parseFloat(m[1].replace(',', ''));
        if (val > 0) {
          // Convertir USD → CFA (approx 1 USD = 600 CFA)
          prix = url.includes('1688.com')
            ? Math.round(val * 85)   // CNY → CFA
            : Math.round(val * 600); // USD → CFA
          break;
        }
      }
    }

    // ===== EXTRACTION DESCRIPTION =====
    let description = getMeta('description');
    if (!description) {
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']{20,})["']/i);
      if (descMatch) description = decodeHTMLEntities(descMatch[1].trim());
    }
    if (description) description = description.substring(0, 300);

    // ===== EXTRACTION IMAGES =====
    const images = [];

    // og:image (principale)
    const ogImg = getMeta('image');
    if (ogImg && isValidImageUrl(ogImg)) images.push(cleanImageUrl(ogImg));

    // Images JSON dans le HTML
    const imgJsonPatterns = [
      /"imageList"\s*:\s*\[([^\]]+)\]/i,
      /"images"\s*:\s*\[([^\]]+)\]/i,
      /"productImages"\s*:\s*\[([^\]]+)\]/i,
    ];
    for (const p of imgJsonPatterns) {
      const m = html.match(p);
      if (m) {
        const urls = [...m[1].matchAll(/"(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/gi)];
        for (const u of urls.slice(0, 5)) {
          const clean = cleanImageUrl(u[1]);
          if (isValidImageUrl(clean) && !images.includes(clean)) images.push(clean);
        }
      }
    }

    // Images balises <img>
    if (images.length < 3) {
      const imgMatches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/gi)];
      for (const m of imgMatches.slice(0, 10)) {
        const clean = cleanImageUrl(m[1]);
        if (isValidImageUrl(clean) && !images.includes(clean)) {
          images.push(clean);
          if (images.length >= 5) break;
        }
      }
    }

    // ===== EXTRACTION CATÉGORIE =====
    let categorie = 'electronique';
    const nomLower = (nom || '').toLowerCase();
    const descLower = (description || '').toLowerCase();
    const fullText = nomLower + ' ' + descLower;

    if (/v[eê]tement|chemise|robe|pantalon|jupe|mode|fashion|cloth|shirt|dress|pant|jean|veste|manteau/i.test(fullText)) categorie = 'vetements';
    else if (/phone|t[eé]l[eé]phone|smartphone|tablette|laptop|ordinateur|headphone|casque|?couteur|[eé]cran|camera|appareil photo|montre connect/i.test(fullText)) categorie = 'electronique';
    else if (/maison|cuisine|d[eé]co|meuble|lit|canapé|lampe|vaisselle|home|kitchen|furniture|lamp/i.test(fullText)) categorie = 'maison';
    else if (/sport|fitness|gym|v[eé]lo|yoga|tennis|football|basket/i.test(fullText)) categorie = 'sport';
    else if (/beaut[eé]|cosm[eé]tique|parfum|soin|maquillage|skincare|beauty|cosmetic/i.test(fullText)) categorie = 'beaute';
    else if (/outil|tournevis|cl[eé]|perceuse|marteau|bricolage|tool|drill/i.test(fullText)) categorie = 'outils';

    // ===== RÉPONSE =====
    const result = {
      success: true,
      produit: {
        nom: nom || 'Produit importé',
        prix: prix || null,
        description: description || '',
        categorie: categorie,
        images: images.slice(0, 5),
        image_url: images[0] || null,
        lien_alibaba: url,
        origine: 'Chine',
        badge: 'nouveau',
        actif: false, // brouillon par défaut
      }
    };

    return res.status(200).json(result);

  } catch (err) {
    console.error('Import Alibaba error:', err.message);
    
    // Si timeout ou accès refusé, retourner les infos de base avec le lien
    if (err.name === 'TimeoutError' || err.message.includes('403') || err.message.includes('401')) {
      return res.status(200).json({
        success: false,
        partial: true,
        error: 'Alibaba bloque le scraping automatique. Remplissez les champs manuellement.',
        produit: {
          nom: '',
          prix: null,
          description: '',
          categorie: 'electronique',
          images: [],
          image_url: null,
          lien_alibaba: url,
          origine: 'Chine',
          badge: 'nouveau',
          actif: false,
        }
      });
    }

    return res.status(500).json({ error: 'Erreur lors de l\'import: ' + err.message });
  }
}

// ===== HELPERS =====

function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function cleanImageUrl(url) {
  // Supprimer les paramètres de redimensionnement Alibaba
  return url.replace(/_\d+x\d+\.(jpg|jpeg|png|webp)/i, '.$1')
            .replace(/\?.*$/, '')
            .split('_.webp')[0] + (url.includes('.webp') ? '.webp' : '');
}

function isValidImageUrl(url) {
  if (!url) return false;
  if (url.length < 10) return false;
  if (url.includes('logo') || url.includes('icon') || url.includes('sprite') || url.includes('banner')) return false;
  return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) || url.includes('img.alicdn') || url.includes('ae01.alicdn');
}
