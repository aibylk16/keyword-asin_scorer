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

      if (attempt.kind === "mirror" && product.title && score >= 14) {
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
      const timeoutMs = attempt.kind === "mirror" ? 15000 : 6000;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
  const offerSignals = extractOfferSignalsFromHtml(html);
  const numberOfReviews = extractReviewCountFromHtml(html);
  const rating = extractRatingFromHtml(html);
  const backendKeywords = extractBackendKeywordsFromHtml(html);

  return {
    sourceName,
    asin,
    url: asin ? `${canonicalHost}/dp/${asin}` : url,
    title,
    bulletPoints,
    productDescription: description,
    sellingPrice: offerSignals.sellingPrice,
    mrp: offerSignals.mrp,
    discountPercent: offerSignals.discountPercent,
    numberOfReviews,
    rating,
    availabilityStatus: offerSignals.availabilityStatus,
    buyBoxAvailable: offerSignals.buyBoxAvailable,
    buyBoxWinner: offerSignals.buyBoxWinner,
    dealStatus: offerSignals.dealStatus,
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
  const offerSignals = extractOfferSignalsFromText(text, lines);
  const numberOfReviews = extractReviewCountFromText(text);
  const rating = extractRatingFromText(text);
  const backendKeywords = extractBackendKeywordsFromText(text);

  return {
    sourceName,
    asin,
    url: asin ? `${canonicalHost}/dp/${asin}` : url,
    title,
    bulletPoints,
    productDescription: description,
    sellingPrice: offerSignals.sellingPrice,
    mrp: offerSignals.mrp,
    discountPercent: offerSignals.discountPercent,
    numberOfReviews,
    rating,
    availabilityStatus: offerSignals.availabilityStatus,
    buyBoxAvailable: offerSignals.buyBoxAvailable,
    buyBoxWinner: offerSignals.buyBoxWinner,
    dealStatus: offerSignals.dealStatus,
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

function extractTitleFromMirror(lines) {
  const targetedPatterns = [
    /^Title:\s*(.+)$/i,
    /^#\s*Product Summary:\s*(.+)$/i,
    /^Product Summary:\s*(.+)$/i,
    /^#\s*Amazon\.[^:]+:\s*(.+)$/i,
  ];

  for (const line of lines) {
    for (const pattern of targetedPatterns) {
      const match = line.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const candidate = normalizeMirrorTitleCandidate(match[1]);
      if (isUsableMirrorTitle(candidate)) {
        return candidate;
      }
    }
  }

  for (const line of lines) {
    const title = normalizeMirrorTitleCandidate(line);

    if (isUsableMirrorTitle(title)) {
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

function isUsableBullet(value) {
  const text = cleanText(value);
  return (
    text.length >= 12 &&
    text.length <= 260 &&
    !looksLikeNoise(text) &&
    !/^customer reviews?/i.test(text)
  );
}

function isUsableTitle(value) {
  const title = cleanAmazonTitle(value);
  const normalized = title.toLowerCase();
  return (
    title.length >= 12 &&
    title.length <= 280 &&
    !looksLikeNoise(title) &&
    !normalized.startsWith("url source") &&
    !normalized.startsWith("markdown content") &&
    !normalized.startsWith("product summary presents") &&
    !normalized.startsWith("skip to")
  );
}

function isUsableDescription(value) {
  const text = cleanText(value);
  return text.length >= 30 && text.length <= 1200 && !looksLikeNoise(text);
}

function isUsableMirrorTitle(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    isUsableTitle(value) &&
    !normalized.startsWith("amazon.com") &&
    !normalized.startsWith("one-time purchase") &&
    !normalized.startsWith("subscribe") &&
    !normalized.startsWith("added to cart") &&
    !normalized.startsWith("price") &&
    !normalized.startsWith("feedback")
  );
}

function normalizeMirrorTitleCandidate(value) {
  return cleanAmazonTitle(
    String(value || "")
      .replace(/^Title:\s*/i, "")
      .replace(/^#\s*/, "")
      .replace(/^Product Summary:\s*/i, "")
      .replace(/^Amazon\.[^:]+:\s*/i, "")
      .trim()
  );
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

function looksBlocked(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.includes("robot check") ||
    normalized.includes("enter the characters you see below") ||
    normalized.includes("captcha") ||
    normalized.includes("access denied") ||
    normalized.includes("service unavailable") ||
    normalized.includes("validatecaptcha") ||
    normalized.includes("opfcaptcha.amazon.com") ||
    normalized.includes("click the button below to continue shopping") ||
    normalized.includes("to discuss automated access to amazon data")
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
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractOfferSignalsFromHtml(html) {
  const text = cleanText(html);
  const availabilityStatus = extractAvailabilityStatusFromHtml(html, text);
  const buyBoxAvailable = hasBuyBoxControlsHtml(html, text) && !isUnavailableStatus(availabilityStatus);
  const sellingPrice = extractSellingPriceFromHtml(html, text);
  const mrp = extractMrpFromHtml(html, text, sellingPrice);
  const discountPercent = extractDiscountPercentFromHtml(html, text, sellingPrice, mrp);
  const buyBoxWinner = extractBuyBoxWinnerFromHtml(html, text, buyBoxAvailable, availabilityStatus);
  const dealStatus = extractDealStatusFromHtml(html, text, sellingPrice, mrp, discountPercent);

  return {
    availabilityStatus,
    buyBoxAvailable,
    sellingPrice,
    mrp,
    discountPercent,
    buyBoxWinner,
    dealStatus,
  };
}

function extractOfferSignalsFromText(text, lines = []) {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const availabilityStatus = extractAvailabilityStatusFromText(textBlock, lines);
  const buyBoxAvailable = hasBuyBoxControlsText(textBlock, lines) && !isUnavailableStatus(availabilityStatus);
  const sellingPrice = extractSellingPriceFromText(textBlock);
  const mrp = extractMrpFromText(textBlock, lines, sellingPrice);
  const discountPercent = extractDiscountPercentFromText(textBlock, lines, sellingPrice, mrp);
  const buyBoxWinner = extractBuyBoxWinnerFromText(textBlock, lines, buyBoxAvailable, availabilityStatus);
  const dealStatus = extractDealStatusFromText(textBlock, lines, sellingPrice, mrp, discountPercent);

  return {
    availabilityStatus,
    buyBoxAvailable,
    sellingPrice,
    mrp,
    discountPercent,
    buyBoxWinner,
    dealStatus,
  };
}

function extractSellingPriceFromHtml(html, text = "") {
  const wholeFractionPatterns = [
    /<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /"priceAmount"\s*:\s*"?([0-9][\d,]*)"?\s*,\s*"priceFraction"\s*:\s*"?(\d{2})"?/i,
  ];

  for (const pattern of wholeFractionPatterns) {
    const match = html.match(pattern);
    if (!match?.[1] || !match?.[2]) {
      continue;
    }

    const combined = normalizePriceString(`${cleanText(match[1])}.${cleanText(match[2])}`, detectCurrencyFromContext(html, text));
    if (combined) {
      return combined;
    }
  }

  const snippets = collectContextSnippets(html, [
    "priceToPay",
    "corePriceDisplay_desktop_feature_div",
    "corePrice_feature_div",
    "apex_desktop",
    "tp_price_block_total_price_ww",
    "priceblock_dealprice",
    "priceblock_saleprice",
    "priceblock_ourprice",
    "price_inside_buybox",
    "desktop_buybox",
    "exports_desktop_qualifiedbuybox",
    "buybox",
    "a-price",
    "a-offscreen",
    "offer-price",
  ]);

  for (const snippet of snippets) {
    const candidate = extractFirstPriceCandidate(snippet, detectCurrencyFromContext(snippet, text));
    if (candidate) {
      return candidate;
    }
  }

  return extractSellingPriceFromText(text || html);
}

function extractMrpFromHtml(html, text = "", sellingPrice = "") {
  const patterns = [
    /M\.?\s*R\.?\s*P\.?\s*[:\-]?\s*([^<\n]+)/i,
    /List Price\s*[:\-]?\s*([^<\n]+)/i,
    /Was\s*[:\-]?\s*([^<\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern) || text.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = extractFirstPriceCandidate(match[1], detectCurrencyFromContext(match[1], text));
    if (candidate && candidate !== sellingPrice) {
      return candidate;
    }
  }

  const snippets = collectContextSnippets(html, [
    "basisPrice",
    "priceBlockStrikePriceString",
    "listPrice",
    "a-text-price",
    "priceBlockSavingsString",
    "savingsPercentage",
    "mrp",
  ]);

  for (const snippet of snippets) {
    const candidates = extractPriceCandidates(snippet, detectCurrencyFromContext(snippet, text));
    const candidate = candidates.find((price) => price && price !== sellingPrice);
    if (candidate) {
      return candidate;
    }
  }

  return extractMrpFromText(text || html, [], sellingPrice);
}

function extractDiscountPercentFromHtml(html, text = "", sellingPrice = "", mrp = "") {
  const directPatterns = [
    /(\d{1,3})%\s*off/i,
    /Save\s+(\d{1,3})%/i,
    /Savings?\s*[:\-]?\s*(\d{1,3})%/i,
  ];

  for (const pattern of directPatterns) {
    const match = html.match(pattern) || text.match(pattern);
    if (match?.[1]) {
      return `${match[1]}%`;
    }
  }

  return calculateDiscountPercent(sellingPrice, mrp);
}

function extractSellingPriceFromText(text) {
  const priceSection =
    extractMarkdownSection(text, "## Price", "## About this Item") ||
    extractMarkdownSection(text, "## Price", "## Product Description") ||
    String(text || "");
  const currencyHint = detectCurrencyFromContext(priceSection, text);
  const patterns = [
    /One-time purchase\s*:?\s*([^\n]+)/i,
    /Subscribe\s*&\s*Save price.*?:\s*([^\n]+)/i,
    /(?:price to pay|deal price|sale price|current price|price)\s*[:\-]?\s*([^\n]+)/i,
    /(?:our price|buy box price|offer price)\s*[:\-]?\s*([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = priceSection.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = extractFirstPriceCandidate(match[1], currencyHint);
    if (candidate) {
      return candidate;
    }
  }

  return extractFirstPriceCandidate(priceSection, currencyHint) || extractFirstPriceCandidate(String(text || ""), currencyHint);
}

function extractMrpFromText(text, lines = [], sellingPrice = "") {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const currencyHint = detectCurrencyFromContext(textBlock);
  const patterns = [
    /M\.?\s*R\.?\s*P\.?\s*[:\-]?\s*([^\n]+)/i,
    /List Price\s*[:\-]?\s*([^\n]+)/i,
    /Was\s*[:\-]?\s*([^\n]+)/i,
    /Strike(?:through)? Price\s*[:\-]?\s*([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = textBlock.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const candidate = extractFirstPriceCandidate(match[1], currencyHint);
    if (candidate && candidate !== sellingPrice) {
      return candidate;
    }
  }

  const candidates = extractPriceCandidates(textBlock, currencyHint);
  return candidates.find((price) => price && price !== sellingPrice) || "";
}

function extractDiscountPercentFromText(text, lines = [], sellingPrice = "", mrp = "") {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const patterns = [
    /(\d{1,3})%\s*off/i,
    /Save\s+(\d{1,3})%/i,
    /Savings?\s*[:\-]?\s*(\d{1,3})%/i,
  ];

  for (const pattern of patterns) {
    const match = textBlock.match(pattern);
    if (match?.[1]) {
      return `${match[1]}%`;
    }
  }

  return calculateDiscountPercent(sellingPrice, mrp);
}

function extractBuyBoxWinnerFromHtml(html, text = "", buyBoxAvailable = false, availabilityStatus = "") {
  const patterns = [
    /<div[^>]*id=["']merchantInfoFeature_feature_div["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']merchant-info["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']shipsFromSoldBy_feature_div["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']tabular-buybox["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id=["']desktop_buybox["'][^>]*>([\s\S]*?)<\/div>/i,
    /<span[^>]*id=["']sellerProfileTriggerId["'][^>]*>([\s\S]*?)<\/span>/i,
    /<a[^>]*id=["']sellerProfileTriggerId["'][^>]*>([\s\S]*?)<\/a>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const seller = extractSellerName(match[1]);
    if (seller) {
      return seller;
    }
  }

  const snippets = [
    ...collectContextSnippets(html, [
      "merchantInfoFeature_feature_div",
      "merchant-info",
      "shipsFromSoldBy_feature_div",
      "tabular-buybox",
      "desktop_buybox",
      "exports_desktop_qualifiedbuybox",
      "buybox",
      "sellerProfileTriggerId",
      "add-to-cart-button",
      "buy-now-button",
    ]),
    text,
  ];

  for (const snippet of snippets) {
    const seller = extractSellerName(snippet);
    if (seller) {
      return seller;
    }
  }

  if (buyBoxAvailable && !isUnavailableStatus(availabilityStatus)) {
    const fallback = extractSellerName(text);
    if (fallback) {
      return fallback;
    }
  }

  return "";
}

function extractDealStatusFromHtml(html, text = "", sellingPrice = "", mrp = "", discountPercent = "") {
  return extractDealStatusFromText(text || cleanText(html), [], sellingPrice, mrp, discountPercent);
}

function extractBuyBoxWinnerFromText(text, lines = [], buyBoxAvailable = false, availabilityStatus = "") {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const markdownLineMatch =
    textBlock.match(/(?:Sold by|Shipper\s*\/\s*Seller)\s*\n+\s*\[([^\]]+)\]\([^)]+\)/i) ||
    textBlock.match(/Ships from\s*\n+\s*Amazon[\s\S]{0,240}?(?:Sold by|Shipper\s*\/\s*Seller)\s*\n+\s*\[([^\]]+)\]\([^)]+\)/i);

  if (markdownLineMatch?.[1]) {
    const markdownSeller = normalizeSellerName(markdownLineMatch[1]);
    if (isUsableSellerName(markdownSeller)) {
      return markdownSeller;
    }
  }

  const directLineMatch =
    textBlock.match(/(?:Sold by|Shipper\s*\/\s*Seller):\s*([^\n]+)/i) ||
    textBlock.match(/(?:Sold by|Shipper\s*\/\s*Seller)\s*\n+\s*([^\n]+)/i);
  if (directLineMatch?.[1]) {
    const directSeller = normalizeSellerName(directLineMatch[1]);
    if (isUsableSellerName(directSeller)) {
      return directSeller;
    }
  }

  const seller = extractSellerName(textBlock);
  if (seller) {
    return seller;
  }

  if (buyBoxAvailable && !isUnavailableStatus(availabilityStatus)) {
    const fallback = extractSellerName(lines.join(" "));
    if (fallback) {
      return fallback;
    }
  }

  return "";
}

function extractDealStatusFromText(text, lines = [], sellingPrice = "", mrp = "", discountPercent = "") {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const priceSection =
    extractMarkdownSection(textBlock, "## Price", "## About this Item") ||
    extractMarkdownSection(textBlock, "## Price", "## Product Description") ||
    textBlock;
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
    const match = priceSection.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const dealText = cleanText(match[1]).replace(/\.$/, "").trim();
    if (dealText && !looksLikeNoise(dealText) && !isSuspiciousDealText(dealText)) {
      return `Active deal detected: ${dealText}`;
    }
  }

  if (discountPercent && sellingPrice && mrp) {
    return `Discount detected: ${discountPercent} off`;
  }

  return "";
}

function extractSellerName(value) {
  const normalized = cleanText(stripMarkdownLinks(value));
  const patterns = [
    /ships from\s+amazon\s+sold by\s+([^|]+?)(?:\s+(?:returns|payment|secure transaction|add to cart|buy now|details|quantity)\b|$)/i,
    /ships from\s*&?\s*sold by\s+([^|]+?)(?:\s+(?:returns|payment|secure transaction|add to cart|buy now|details|quantity)\b|$)/i,
    /dispatches from\s*&?\s*sold by\s+([^|]+?)(?:\s+(?:returns|payment|secure transaction|add to cart|buy now|details|quantity)\b|$)/i,
    /ships from\s*:?\s*amazon\s+sold by\s*:?\s*([^|]+?)(?:\s+(?:returns|payment|secure transaction|add to cart|buy now|details|quantity)\b|$)/i,
    /sold by\s*:?\s*([^|]+?)(?:\s+(?:returns|payment|secure transaction|ships from|dispatches from|add to cart|buy now|details|quantity)\b|$)/i,
    /sold by\s+([^|]+?)(?:\s+(?:returns|payment|secure transaction|ships from|dispatches from|add to cart|buy now|details|quantity)\b|$)/i,
    /shipper\s*\/\s*seller\s*:?\s*([^|]+?)(?:\s+(?:returns|payment|secure transaction|ships from|dispatches from|add to cart|buy now|details|quantity)\b|$)/i,
    /seller\s*:\s*([^|]+?)(?:\s+(?:fulfilled|ships from|dispatches from)\b|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const seller = normalizeSellerName(match[1]);
    if (isUsableSellerName(seller)) {
      return seller;
    }
  }

  if (/ships from\s+amazon\s+sold by\s+amazon/i.test(normalized) || /sold by\s+amazon/i.test(normalized)) {
    return "Amazon";
  }

  return "";
}

function isUsableSellerName(value) {
  const seller = normalizeSellerName(value);

  if (!seller || seller.length < 2 || seller.length > 120) {
    return false;
  }

  const normalized = seller.toLowerCase();
  if (
    looksLikeNoise(seller) ||
    normalized.includes("buy now") ||
    normalized.includes("add to cart") ||
    normalized.includes("details") ||
    normalized.includes("secure transaction") ||
    normalized.includes("returns")
  ) {
    return false;
  }

  return true;
}

function normalizeSellerName(value) {
  const seller = cleanText(stripMarkdownLinks(value))
    .replace(/^(ships from\s*&?\s*)?sold by\s+/i, "")
    .replace(/^(dispatches from\s*&?\s*)?sold by\s+/i, "")
    .replace(/^shipper\s*\/\s*seller\s+/i, "")
    .replace(/^(seller\s*:\s*)/i, "")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\((?:javascript|https?:\/\/)[^)]+\)/gi, "")
    .replace(/\b(?:returns|payment|secure transaction|details|quantity|add to cart|buy now)\b.*$/i, "")
    .replace(/\.$/, "")
    .trim();

  if (/^amazon(?:[\s.].*)?$/i.test(seller) || /ships from amazon sold by amazon/i.test(seller)) {
    return "Amazon";
  }

  return seller;
}

function stripMarkdownLinks(value) {
  return String(value || "").replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");
}

function hasBuyBoxControlsHtml(html, text = "") {
  const raw = String(html || "").toLowerCase();
  const normalizedText = String(text || "").toLowerCase();
  return (
    /add-to-cart-button|submit\.add-to-cart|buy-now-button|desktop_buybox|exports_desktop_qualifiedbuybox|buybox|checkoutnow/i.test(raw) ||
    /\badd to cart\b|\bbuy now\b/.test(normalizedText)
  );
}

function hasBuyBoxControlsText(text, lines = []) {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n").toLowerCase();
  return /\badd to cart\b|\bbuy now\b/.test(textBlock);
}

function extractAvailabilityStatusFromHtml(html, text = "") {
  return extractAvailabilityStatusFromText(text || cleanText(html));
}

function extractAvailabilityStatusFromText(text, lines = []) {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const patterns = [
    /only\s+\d+\s+left in stock/i,
    /in stock/i,
    /currently unavailable/i,
    /temporarily out of stock/i,
    /out of stock/i,
    /unavailable/i,
    /available to ship/i,
  ];

  for (const pattern of patterns) {
    const match = textBlock.match(pattern);
    if (match?.[0]) {
      return cleanText(match[0]);
    }
  }

  return "";
}

function isUnavailableStatus(value) {
  return /out of stock|currently unavailable|temporarily out of stock|unavailable/i.test(String(value || ""));
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

  if (product.sellingPrice && !isSuspiciousPrice(product.sellingPrice)) {
    score += 3;
  }

  if (product.mrp && !isSuspiciousPrice(product.mrp)) {
    score += 1;
  }

  if (product.discountPercent && !/^100%$/i.test(String(product.discountPercent || ""))) {
    score += 1;
  }

  if (product.numberOfReviews) {
    score += 1;
  }

  if (product.rating) {
    score += 1;
  }

  if (product.buyBoxWinner) {
    score += 3;
  }

  if (product.dealStatus && !isSuspiciousDealText(product.dealStatus)) {
    score += 2;
  }

  if ((product.backendKeywords || []).length) {
    score += 1;
  }

  if (isSuspiciousPrice(product.sellingPrice)) {
    score -= 4;
  }

  if (isSuspiciousPrice(product.mrp)) {
    score -= 2;
  }

  if (isSuspiciousDealText(product.dealStatus)) {
    score -= 4;
  }

  return score;
}

function collectContextSnippets(value, tokens, radius = 1000) {
  const source = String(value || "");
  const normalized = source.toLowerCase();
  const snippets = [];

  for (const token of tokens) {
    const lookup = String(token || "").toLowerCase();
    let startIndex = normalized.indexOf(lookup);

    while (startIndex !== -1) {
      const start = Math.max(0, startIndex - radius);
      const end = Math.min(source.length, startIndex + lookup.length + radius);
      snippets.push(source.slice(start, end));
      startIndex = normalized.indexOf(lookup, startIndex + lookup.length);

      if (snippets.length >= 24) {
        return snippets;
      }
    }
  }

  return snippets;
}

function detectCurrencyFromContext(...sources) {
  const combined = sources.join(" ");
  if (/₹|â‚¹|rs\.?|inr/i.test(combined)) {
    return "₹";
  }

  if (/£|Â£|gbp/i.test(combined)) {
    return "£";
  }

  if (/€|â‚¬|eur/i.test(combined)) {
    return "€";
  }

  if (/cad\$|c\$|ca\$/i.test(combined)) {
    return "C$";
  }

  if (/aud\$|a\$/i.test(combined)) {
    return "A$";
  }

  if (/pln|zł/i.test(combined)) {
    return "zł";
  }

  if (/\$/i.test(combined)) {
    return "$";
  }

  return "";
}

function normalizePriceString(value, currencyHint = "") {
  const normalized = decodeHtml(String(value || ""))
    .replace(/â‚¹/g, "₹")
    .replace(/Â£/g, "£")
    .replace(/â‚¬/g, "€")
    .replace(/\s+/g, " ")
    .trim();

  const directMatch = normalized.match(/(?:₹|Rs\.?|INR|\$|US\$|USD|£|€|EUR|C\$|CAD\$|A\$|AUD\$|PLN|zł)\s?\d[\d,]*(?:\.\d{1,2})?/i);
  const numericMatch = normalized.match(/\d[\d,]*(?:\.\d{1,2})?/);
  const base = directMatch?.[0] || (numericMatch?.[0] && currencyHint ? `${currencyHint}${numericMatch[0]}` : "");

  if (!base) {
    return "";
  }

  return base
    .replace(/Rs\.?|INR/i, "₹")
    .replace(/US\$|USD/i, "$")
    .replace(/CAD\$/i, "C$")
    .replace(/AUD\$/i, "A$")
    .replace(/EUR/i, "€")
    .replace(/\s+/g, "");
}

function extractPriceCandidates(value, currencyHint = "") {
  const source = decodeHtml(String(value || ""))
    .replace(/â‚¹/g, "₹")
    .replace(/Â£/g, "£")
    .replace(/â‚¬/g, "€");
  const matches = [...source.matchAll(/(?:₹|Rs\.?|INR|\$|US\$|USD|£|€|EUR|C\$|CAD\$|A\$|AUD\$|PLN|zł)?\s?\d[\d,]*(?:\.\d{1,2})?/gi)]
    .map((match) => normalizePriceString(match[0], currencyHint))
    .filter(Boolean);

  return [...new Set(matches)];
}

function extractFirstPriceCandidate(value, currencyHint = "") {
  return extractPriceCandidates(value, currencyHint)[0] || "";
}

function parsePriceAmount(value) {
  const normalized = String(value || "").replace(/[^\d.,]/g, "");
  if (!normalized) {
    return NaN;
  }

  return Number.parseFloat(normalized.replace(/,/g, ""));
}

function calculateDiscountPercent(sellingPrice, mrp) {
  const selling = parsePriceAmount(sellingPrice);
  const listPrice = parsePriceAmount(mrp);

  if (!Number.isFinite(selling) || !Number.isFinite(listPrice) || listPrice <= selling || listPrice <= 0) {
    return "";
  }

  const percent = Math.round(((listPrice - selling) / listPrice) * 100);
  return percent > 0 ? `${percent}%` : "";
}

function isSuspiciousPrice(value) {
  const price = String(value || "").trim();
  if (!price) {
    return false;
  }

  if (/[,.]$/.test(price)) {
    return true;
  }

  const amount = parsePriceAmount(price);
  return !Number.isFinite(amount) || amount <= 0;
}

function extractMarkdownSection(text, startHeading, endHeading) {
  const source = String(text || "");
  const startIndex = source.indexOf(startHeading);
  if (startIndex === -1) {
    return "";
  }

  const tail = source.slice(startIndex + startHeading.length);
  const endIndex = endHeading ? tail.indexOf(endHeading) : -1;
  return (endIndex === -1 ? tail : tail.slice(0, endIndex)).trim();
}

function isSuspiciousDealText(value) {
  const normalized = String(value || "").toLowerCase();
  return (
    normalized.length > 120 ||
    normalized.includes("divtoupdate") ||
    normalized.includes("feature_div") ||
    normalized.includes("customclientfunction") ||
    normalized.includes("{") ||
    normalized.includes("}")
  );
}
