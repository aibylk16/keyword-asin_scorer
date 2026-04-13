const AMAZON_HOST = "https://www.amazon.in";

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(200).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const asin = normalizeAsin(request.query.asin);
  const requestedUrl = typeof request.query.url === "string" ? request.query.url.trim() : "";
  const productUrl = asin ? `${AMAZON_HOST}/dp/${asin}` : normalizeUrl(requestedUrl);

  if (!productUrl) {
    response.status(400).json({ error: "Provide asin or url" });
    return;
  }

  try {
    const product = await fetchAmazonProduct(productUrl, asin);
    response.status(200).json(product);
  } catch (error) {
    response.status(502).json({
      error: "Unable to fetch product details",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeAsin(value) {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value.trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(cleaned) ? cleaned : "";
}

function normalizeUrl(value) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

async function fetchAmazonProduct(url, fallbackAsin = "") {
  const html = await fetchHtml(url);
  const asin = fallbackAsin || extractAsin(url) || extractAsin(html);
  const title = extractTitle(html);
  const highlights = extractHighlights(html, title);

  if (!title) {
    throw new Error("Product title could not be extracted from Amazon response");
  }

  return {
    sourceName: "Vercel API",
    asin,
    title,
    highlights,
  };
}

async function fetchHtml(url) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];

  let lastError = null;

  for (const userAgent of userAgents) {
    try {
      const result = await fetch(url, {
        headers: {
          "user-agent": userAgent,
          "accept-language": "en-IN,en;q=0.9",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
      });

      if (!result.ok) {
        throw new Error(`Amazon returned ${result.status}`);
      }

      const html = await result.text();

      if (looksBlocked(html)) {
        throw new Error("Amazon returned a blocked or challenge page");
      }

      return html;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Amazon fetch failed");
}

function looksBlocked(html) {
  const normalized = html.toLowerCase();
  return (
    normalized.includes("robot check") ||
    normalized.includes("enter the characters you see below") ||
    normalized.includes("captcha") ||
    normalized.includes("access denied") ||
    normalized.includes("service unavailable")
  );
}

function extractAsin(value) {
  const match = String(value).match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : "";
}

function extractTitle(html) {
  const patterns = [
    /<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i,
    /<h1[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<title>([\s\S]*?)<\/title>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const title = cleanText(match[1])
      .replace(/^buy\s+/i, "")
      .replace(/\s+at\s+amazon\.[^|:]+.*$/i, "")
      .replace(/\s*:?\s*amazon\.[^|:]+.*$/i, "")
      .trim();

    if (isUsableTitle(title)) {
      return title;
    }
  }

  return "";
}

function extractHighlights(html, title) {
  const featurePatterns = [
    /<li[^>]*class=["'][^"']*a-spacing-mini[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
    /<li[^>]*class=["'][^"']*a-spacing-small[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi,
  ];

  const highlights = [];

  for (const pattern of featurePatterns) {
    for (const match of html.matchAll(pattern)) {
      const text = cleanText(match[1]);

      if (
        text &&
        text !== title &&
        text.length >= 20 &&
        text.length <= 280 &&
        !looksLikeNoise(text)
      ) {
        highlights.push(text);
      }
    }
  }

  return [...new Set(highlights)].slice(0, 8);
}

function cleanText(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isUsableTitle(title) {
  if (!title || title.length < 10) {
    return false;
  }

  const normalized = title.toLowerCase();
  return !looksLikeNoise(normalized);
}

function looksLikeNoise(value) {
  const normalized = String(value).toLowerCase();
  const noisePatterns = [
    "html lang",
    "head meta",
    "viewport",
    "meta charset",
    "http equiv",
    "service unavailable",
    "robot check",
    "access denied",
    "sorry",
    "markdown content",
    "if lt ie",
    "endif",
  ];

  return noisePatterns.some((pattern) => normalized.includes(pattern));
}
