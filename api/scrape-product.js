const MARKETPLACE_MAP = {
  IN: "https://www.amazon.in",
  US: "https://www.amazon.com",
  CA: "https://www.amazon.ca",
  AU: "https://www.amazon.com.au",
  UK: "https://www.amazon.co.uk",
  DE: "https://www.amazon.de",
  FR: "https://www.amazon.fr",
  IT: "https://www.amazon.it",
  ES: "https://www.amazon.es",
  PL: "https://www.amazon.pl",
};
const MARKETPLACE_HOST_TO_CODE = Object.entries(MARKETPLACE_MAP).reduce(
  (map, [code, host]) => {
    map[new URL(host).host] = code;
    return map;
  },
  {}
);
const DEFAULT_MARKETPLACE = "IN";

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
  const marketplace = normalizeMarketplace(request.query.marketplace);
  const requestedUrl = typeof request.query.url === "string" ? request.query.url.trim() : "";
  const amazonHost = getAmazonHost(marketplace, requestedUrl);
  const productUrl = asin ? `${amazonHost}/dp/${asin}` : normalizeUrl(requestedUrl, amazonHost);

  if (!asin && !productUrl) {
    response.status(400).json({ error: "Provide a valid ASIN or Amazon URL" });
    return;
  }

  try {
    const product = await scrapeAmazonProduct(productUrl, asin, amazonHost);
    response.status(200).json(product);
  } catch (error) {
    response.status(502).json({
      error: "Unable to scrape product details",
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

function normalizeMarketplace(value) {
  const code = String(value || "").trim().toUpperCase();
  return MARKETPLACE_MAP[code] ? code : DEFAULT_MARKETPLACE;
}

function inferMarketplaceFromUrl(value) {
  try {
    const normalized = /^https?:\/\//i.test(String(value || "").trim())
      ? String(value || "").trim()
      : `https://${String(value || "").trim()}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return MARKETPLACE_HOST_TO_CODE[hostname] || "";
  } catch (error) {
    return "";
  }
}

function getAmazonHost(marketplace, requestedUrl = "") {
  const inferred = inferMarketplaceFromUrl(requestedUrl);
  return MARKETPLACE_MAP[inferred || normalizeMarketplace(marketplace)];
}

function normalizeUrl(value, amazonHost = MARKETPLACE_MAP[DEFAULT_MARKETPLACE]) {
  if (!value) {
    return "";
  }

  const trimmed = String(value).trim();

  if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
    return `${amazonHost}/dp/${trimmed.toUpperCase()}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/amazon\./i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }

  return `https://${trimmed}`;
}

async function scrapeAmazonProduct(url, fallbackAsin = "", amazonHost = MARKETPLACE_MAP[DEFAULT_MARKETPLACE]) {
  const asin = fallbackAsin || extractAsin(url);
  const attempts = buildAttempts(url, asin, amazonHost);
  let bestProduct = null;
  let bestScore = -1;
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const raw = await fetchAttempt(attempt);
      const product =
        attempt.kind === "mirror"
          ? parseMirrorProduct(raw, asin, attempt.sourceName, url)
          : parseHtmlProduct(raw, asin, attempt.sourceName, attempt.url);
      const score = scoreProductCompleteness(product);

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }

      if (product.title && score >= 14) {
        return product;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (bestProduct?.title) {
    return bestProduct;
  }

  throw lastError || new Error("No usable product details were extracted");
}

function buildAttempts(url, asin, amazonHost) {
  const directUrl = url;
  const mobileUrl = asin ? `${amazonHost}/gp/aw/d/${asin}` : url;
  const searchUrl = asin ? `${amazonHost}/s?k=${asin}` : "";
  const mirrorBase = asin ? `${amazonHost}/dp/${asin}` : url;
  const mirrorUrl = `https://r.jina.ai/http://${mirrorBase.replace(/^https?:\/\//i, "")}`;

  return [
    { url: directUrl, sourceName: "Amazon Product Page", kind: "html" },
    { url: mobileUrl, sourceName: "Amazon Mobile Product Page", kind: "html" },
    ...(searchUrl ? [{ url: searchUrl, sourceName: "Amazon Search Page", kind: "html" }] : []),
    { url: mirrorUrl, sourceName: "Jina Mirror", kind: "mirror" },
  ];
}

async function fetchAttempt(attempt) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];

  let lastError = null;

  for (const userAgent of userAgents) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const result = await fetch(attempt.url, {
        headers: {
          "user-agent": userAgent,
          "accept-language": "en-IN,en;q=0.9",
          accept:
            attempt.kind === "mirror"
              ? "text/plain,text/html;q=0.9,*/*;q=0.8"
              : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!result.ok) {
        throw new Error(`${attempt.sourceName} returned ${result.status}`);
      }

      const text = await result.text();

      if (!text || text.length < 40) {
        throw new Error(`${attempt.sourceName} returned too little content`);
      }

      if (looksBlocked(text)) {
        throw new Error(`${attempt.sourceName} returned a blocked/challenge page`);
      }

      return text;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${attempt.sourceName} fetch failed`);
}

function parseHtmlProduct(html, fallbackAsin = "", sourceName = "Amazon", url = "") {
  const asin = fallbackAsin || extractAsin(url) || extractAsin(html);
  const canonicalHost = getAmazonHost(DEFAULT_MARKETPLACE, url);
  const title = extractTitleFromHtml(html);
  const bulletPoints = extractBulletPointsFromHtml(html);
  const description = extractDescriptionFromHtml(html, bulletPoints);
  const sellingPrice = extractSellingPriceFromHtml(html);
  const numberOfReviews = extractReviewCountFromHtml(html);
  const rating = extractRatingFromHtml(html);
  const backendKeywords = extractBackendKeywordsFromHtml(html);
  const buyBoxWinner = extractBuyBoxWinnerFromHtml(html);
  const dealStatus = extractDealStatusFromHtml(html);

  return {
    sourceName,
    asin,
    url: asin ? `${canonicalHost}/dp/${asin}` : url,
    title,
    bulletPoints,
    productDescription: description,
    sellingPrice,
    numberOfReviews,
    rating,
    buyBoxWinner,
    dealStatus,
    backendKeywords,
  };
}

function parseMirrorProduct(text, fallbackAsin = "", sourceName = "Jina Mirror", url = "") {
  const asin = fallbackAsin || extractAsin(url) || extractAsin(text);
  const canonicalHost = getAmazonHost(DEFAULT_MARKETPLACE, url);
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title = extractTitleFromMirror(lines);
  const bulletPoints = extractBulletPointsFromMirror(lines);
  const description = extractDescriptionFromMirror(lines, bulletPoints);
  const sellingPrice = extractSellingPriceFromText(text);
  const numberOfReviews = extractReviewCountFromText(text);
  const rating = extractRatingFromText(text);
  const backendKeywords = extractBackendKeywordsFromText(text);
  const buyBoxWinner = extractBuyBoxWinnerFromText(text, lines);
  const dealStatus = extractDealStatusFromText(text, lines);

  return {
    sourceName,
    asin,
    url: asin ? `${canonicalHost}/dp/${asin}` : url,
    title,
    bulletPoints,
    productDescription: description,
    sellingPrice,
    numberOfReviews,
    rating,
    buyBoxWinner,
    dealStatus,
    backendKeywords,
  };
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

function extractBulletPointsFromHtml(html) {
  const patterns = [
    /<div[^>]*id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/div>/i,
    /<ul[^>]*id=["']feature-bullets["'][^>]*>([\s\S]*?)<\/ul>/i,
  ];

  for (const pattern of patterns) {
    const block = html.match(pattern)?.[1];
    if (!block) {
      continue;
    }

    const bullets = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((match) => cleanText(match[1]))
      .filter((item) => isUsableBullet(item));

    if (bullets.length) {
      return [...new Set(bullets)].slice(0, 10);
    }
  }

  return [];
}

function extractDescriptionFromHtml(html, bulletPoints) {
  const patterns = [
    /<div[^>]*id=["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i,
    /<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const description = cleanText(match[1]);
    if (isUsableDescription(description)) {
      return description;
    }
  }

  return bulletPoints.length ? bulletPoints.join(" ") : "";
}

function extractSellingPriceFromHtml(html) {
  const patterns = [
    /<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /₹\s?[\d,]+(?:\.\d{2})?/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    if (match[2]) {
      return `₹${cleanText(match[1])}.${cleanText(match[2])}`;
    }

    const price = cleanText(match[1] || match[0]);
    if (price && /₹|\d/.test(price)) {
      return price.startsWith("₹") ? price : `₹${price.replace(/[^\d.,]/g, "")}`;
    }
  }

  return "";
}

function extractReviewCountFromHtml(html) {
  const patterns = [
    /<span[^>]*id=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i,
    /([\d,]+)\s+ratings?/i,
    /([\d,]+)\s+reviews?/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const count = cleanText(match[1]).replace(/[^\d,]/g, "");
    if (count) {
      return count;
    }
  }

  return "";
}

function extractRatingFromHtml(html) {
  const patterns = [
    /<span[^>]*class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /([0-5](?:\.\d)?)\s+out of 5 stars/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const ratingMatch = cleanText(match[1]).match(/([0-5](?:\.\d)?)/);
    if (ratingMatch?.[1]) {
      return ratingMatch[1];
    }
  }

  return "";
}

function extractBackendKeywordsFromHtml(html) {
  const patterns = [
    /<meta[^>]*name=["']keywords["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i,
    /"backend_keywords"\s*:\s*"([^"]+)"/i,
    /"search_terms"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const keywords = cleanText(match[1])
      .split(/,|\|/)
      .map((item) => item.trim())
      .filter((item) => item.length > 1);

    if (keywords.length) {
      return [...new Set(keywords)].slice(0, 20);
    }
  }

  return [];
}

function extractBuyBoxWinnerFromHtml(html) {
  const sellerPatterns = [
    /<div[^>]*id=["']merchantInfoFeature_feature_div["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']merchant-info["'][^>]*>([\s\S]*?)<\/div>/i,
    /<span[^>]*id=["']sellerProfileTriggerId["'][^>]*>([\s\S]*?)<\/span>/i,
    /<a[^>]*id=["']sellerProfileTriggerId["'][^>]*>([\s\S]*?)<\/a>/i,
  ];

  for (const pattern of sellerPatterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const cleaned = cleanText(match[1]);
    const extracted = extractSellerName(cleaned);
    if (extracted) {
      return extracted;
    }
  }

  const inlineSellerMatches = [
    /sold by\s*<\/span>\s*<a[^>]*>([\s\S]*?)<\/a>/i,
    /sold by\s*<a[^>]*>([\s\S]*?)<\/a>/i,
    /ships from and sold by\s*([\w\s&.,'()-]+)/i,
    /dispatches from and sold by\s*([\w\s&.,'()-]+)/i,
  ];

  for (const pattern of inlineSellerMatches) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const seller = cleanText(match[1]).replace(/\.$/, "").trim();
    if (isUsableSellerName(seller)) {
      return seller;
    }
  }

  return "";
}

function extractDealStatusFromHtml(html) {
  const text = cleanText(html);
  return extractDealStatusFromText(text);
}

function extractTitleFromMirror(lines) {
  for (const line of lines) {
    const title = cleanAmazonTitle(line);

    if (
      title.length >= 18 &&
      title.length <= 280 &&
      !looksLikeNoise(title) &&
      !title.toLowerCase().startsWith("url source") &&
      !title.toLowerCase().startsWith("markdown content")
    ) {
      return title;
    }
  }

  return "";
}

function extractBulletPointsFromMirror(lines) {
  return lines
    .filter((line) => /^(?:[-*•]|[0-9]+\.)\s+/.test(line))
    .map((line) => line.replace(/^(?:[-*•]|[0-9]+\.)\s+/, "").trim())
    .filter((item) => isUsableBullet(item))
    .slice(0, 10);
}

function extractDescriptionFromMirror(lines, bulletPoints) {
  const description = lines.find((line) => isUsableDescription(line) && !bulletPoints.includes(line));
  return description || (bulletPoints.length ? bulletPoints.join(" ") : "");
}

function extractSellingPriceFromText(text) {
  const match = String(text || "").match(/₹\s?[\d,]+(?:\.\d{2})?/i);
  return match ? match[0].replace(/\s+/g, "") : "";
}

function extractReviewCountFromText(text) {
  const match = String(text || "").match(/([\d,]+)\s+ratings?/i) || String(text || "").match(/([\d,]+)\s+reviews?/i);
  return match?.[1] || "";
}

function extractRatingFromText(text) {
  const match = String(text || "").match(/([0-5](?:\.\d)?)\s+out of 5 stars/i);
  return match?.[1] || "";
}

function extractBackendKeywordsFromText(text) {
  const match = String(text || "").match(/(?:keywords|search terms)\s*:\s*([^\n]+)/i);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(/,|\|/)
    .map((item) => cleanText(item))
    .filter((item) => item.length > 1)
    .slice(0, 20);
}

function extractBuyBoxWinnerFromText(text, lines = []) {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const patterns = [
    /ships from and sold by\s+([^\n.]+)/i,
    /dispatches from and sold by\s+([^\n.]+)/i,
    /sold by\s+([^\n|]+)/i,
    /seller\s*:\s*([^\n|]+)/i,
  ];

  for (const pattern of patterns) {
    const match = textBlock.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const seller = cleanText(match[1]).replace(/\.$/, "").trim();
    if (isUsableSellerName(seller)) {
      return seller;
    }
  }

  return "";
}

function extractDealStatusFromText(text, lines = []) {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const dealPatterns = [
    /limited time deal[:\s-]*([^\n.]+)/i,
    /deal of the day[:\s-]*([^\n.]+)/i,
    /lightning deal[:\s-]*([^\n.]+)/i,
    /coupon[:\s-]*([^\n.]+)/i,
    /(save\s+[₹$€£]?\s?[\d,.]+[^\n.]*)/i,
    /((?:extra|instant)\s+\d+%[^\n.]*(?:off|discount))/i,
    /(\d+%\s+off[^\n.]*)/i,
  ];

  for (const pattern of dealPatterns) {
    const match = textBlock.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const dealText = cleanText(match[1]).replace(/\.$/, "").trim();
    if (dealText && !looksLikeNoise(dealText)) {
      return `Active deal detected: ${dealText}`;
    }
  }

  return "";
}

function extractSellerName(value) {
  const normalized = cleanText(value);
  const patterns = [
    /ships from and sold by\s+(.+)/i,
    /dispatches from and sold by\s+(.+)/i,
    /sold by\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const seller = match[1].replace(/\.$/, "").trim();
    if (isUsableSellerName(seller)) {
      return seller;
    }
  }

  if (isUsableSellerName(normalized)) {
    return normalized;
  }

  return "";
}

function isUsableSellerName(value) {
  const seller = cleanText(value)
    .replace(/^(ships from and )?sold by\s+/i, "")
    .replace(/^(dispatches from and )?sold by\s+/i, "")
    .trim();

  if (!seller || seller.length < 2 || seller.length > 120) {
    return false;
  }

  const normalized = seller.toLowerCase();
  if (
    looksLikeNoise(seller) ||
    normalized.includes("buy now") ||
    normalized.includes("add to cart") ||
    normalized.includes("amazon") ||
    normalized.includes("details")
  ) {
    return false;
  }

  return true;
}

function isUsableBullet(value) {
  const text = cleanText(value);
  return (
    text.length >= 12 &&
    text.length <= 260 &&
    !looksLikeNoise(text) &&
    !/^customer reviews?/i.test(text)
  );
}

function isUsableDescription(value) {
  const text = cleanText(value);
  return text.length >= 30 && text.length <= 1200 && !looksLikeNoise(text);
}

function cleanAmazonTitle(value) {
  return decodeHtml(String(value || ""))
    .replace(/^buy\s+/i, "")
    .replace(/\s+online at low prices.*$/i, "")
    .replace(/\s+at\s+amazon\.[^|:]+.*$/i, "")
    .replace(/\s*:?\s*amazon\.[^|:]+.*$/i, "")
    .replace(/\s+[|:]\s*(home\s*&?\s*kitchen|fashion|beauty|toys|books).*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreProductCompleteness(product) {
  let score = 0;

  if (product.title) {
    score += 10;
  }

  score += Math.min((product.bulletPoints || []).length, 5);

  if (product.productDescription) {
    score += 3;
  }

  if (product.sellingPrice) {
    score += 2;
  }

  if (product.numberOfReviews) {
    score += 1;
  }

  if (product.rating) {
    score += 1;
  }

  if (product.buyBoxWinner) {
    score += 2;
  }

  if (product.dealStatus) {
    score += 2;
  }

  if ((product.backendKeywords || []).length) {
    score += 1;
  }

  return score;
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
    "amazon.",
    "skip to main content",
    "results for",
  ];

  return noisePatterns.some((pattern) => normalized.includes(pattern));
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
