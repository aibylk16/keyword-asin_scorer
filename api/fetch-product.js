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
  const asin = fallbackAsin || extractAsin(url);
  const attempts = buildFetchAttempts(url, asin);
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const raw = await fetchText(attempt.url, attempt.kind);
      const parsed =
        attempt.kind === "mirror"
          ? parseMirrorResponse(raw, asin, attempt.sourceName)
          : parseAmazonHtml(raw, attempt.url, attempt.sourceName, asin);

      if (parsed?.title && isUsableTitle(parsed.title)) {
        return parsed;
      }

      lastError = new Error(`No usable title from ${attempt.sourceName}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Amazon fetch failed");
}

function buildFetchAttempts(url, asin) {
  const directUrl = url;
  const mobileUrl = asin ? `${AMAZON_HOST}/gp/aw/d/${asin}` : url;
  const searchUrl = asin ? `${AMAZON_HOST}/s?k=${asin}` : "";
  const mirrorBase = asin ? `${AMAZON_HOST}/dp/${asin}` : url;
  const mirrorUrl = `https://r.jina.ai/http://${mirrorBase.replace(/^https?:\/\//i, "")}`;

  return [
    { url: directUrl, sourceName: "Amazon Product Page", kind: "html" },
    { url: mobileUrl, sourceName: "Amazon Mobile Product Page", kind: "html" },
    ...(searchUrl ? [{ url: searchUrl, sourceName: "Amazon Search Page", kind: "html" }] : []),
    { url: mirrorUrl, sourceName: "Jina Mirror", kind: "mirror" },
  ];
}

async function fetchText(url, kind) {
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
          accept:
            kind === "mirror"
              ? "text/plain,text/html;q=0.9,*/*;q=0.8"
              : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
        },
      });

      if (!result.ok) {
        throw new Error(`Source returned ${result.status}`);
      }

      const text = await result.text();

      if (!text || text.length < 40) {
        throw new Error("Response too short");
      }

      if (looksBlocked(text)) {
        throw new Error("Blocked or challenge response");
      }

      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Fetch failed");
}

function parseAmazonHtml(html, url, sourceName, fallbackAsin = "") {
  const asin = fallbackAsin || extractAsin(url) || extractAsin(html);
  const title = extractTitleFromHtml(html);
  const highlights = extractHighlightsFromHtml(html, title);

  return {
    sourceName,
    asin,
    title,
    highlights,
  };
}

function parseMirrorResponse(text, fallbackAsin = "", sourceName = "Jina Mirror") {
  const asin = fallbackAsin || extractAsin(text);
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title = extractTitleFromMirror(lines);
  const highlights = extractHighlightsFromMirror(lines, title);

  return {
    sourceName,
    asin,
    title,
    highlights,
  };
}

function looksBlocked(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("robot check") ||
    normalized.includes("enter the characters you see below") ||
    normalized.includes("captcha") ||
    normalized.includes("access denied") ||
    normalized.includes("service unavailable")
  );
}

function extractAsin(value) {
  const match = String(value || "").match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : "";
}

function extractTitleFromHtml(html) {
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

    const title = cleanAmazonTitle(cleanText(match[1]));
    if (isUsableTitle(title)) {
      return title;
    }
  }

  return "";
}

function extractTitleFromMirror(lines) {
  for (const line of lines) {
    const cleaned = cleanAmazonTitle(line);

    if (
      cleaned.length >= 18 &&
      cleaned.length <= 280 &&
      !looksLikeNoise(cleaned) &&
      !cleaned.toLowerCase().startsWith("url source") &&
      !cleaned.toLowerCase().startsWith("markdown content")
    ) {
      return cleaned;
    }
  }

  return "";
}

function cleanAmazonTitle(value) {
  return decodeHtml(String(value || ""))
    .replace(/^buy\s+/i, "")
    .replace(/\s+online at low prices.*$/i, "")
    .replace(/\s+at\s+amazon\.[^|:]+.*$/i, "")
    .replace(/\s*:?\s*amazon\.[^|:]+.*$/i, "")
    .replace(/\s+[|:]\s*home\s*&?\s*kitchen.*$/i, "")
    .replace(/\s+[|:]\s*home and kitchen.*$/i, "")
    .replace(/\s+[|:]\s*beauty.*$/i, "")
    .replace(/\s+[|:]\s*fashion.*$/i, "")
    .replace(/\s+[|:]\s*toys.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHighlightsFromHtml(html, title) {
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

function extractHighlightsFromMirror(lines, title) {
  return lines
    .map((line) => cleanText(line))
    .filter(
      (line) =>
        line &&
        line !== title &&
        line.length >= 20 &&
        line.length <= 220 &&
        !looksLikeNoise(line)
    )
    .slice(0, 6);
}

function cleanText(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
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

  return !looksLikeNoise(title);
}

function looksLikeNoise(value) {
  const normalized = String(value || "").toLowerCase();
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
    "amazon.in",
    "skip to main content",
    "results for",
    "need help",
  ];

  return noisePatterns.some((pattern) => normalized.includes(pattern));
}
