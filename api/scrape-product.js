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
  const successfulAttempts = [];

  for (const attempt of attempts) {
    try {
      const raw = await fetchAttempt(attempt);
      const product =
        attempt.kind === "mirror"
          ? parseMirrorProduct(raw, asin, attempt.sourceName, url)
          : parseHtmlProduct(raw, asin, attempt.sourceName, attempt.url);
      const score = scoreProductCompleteness(product);
      successfulAttempts.push({ attempt, product, score });

      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }

      if (
        attempt.kind === "html" &&
        /^Amazon Product Page$/i.test(attempt.sourceName || "") &&
        product.title &&
        product.sellingPrice &&
        !isSuspiciousPrice(product.sellingPrice) &&
        (product.numberOfReviews || product.rating)
      ) {
        return product;
      }

      if (attempt.kind === "mirror" && product.title && score >= 14) {
        const mergedMirrorCandidate = mergeAttemptProducts(successfulAttempts, url, asin, amazonHost);
        return mergedMirrorCandidate?.title ? mergedMirrorCandidate : product;
      }
    } catch (error) {
      lastError = error;
    }
  }

  const mergedProduct = mergeAttemptProducts(successfulAttempts, url, asin, amazonHost);
  if (mergedProduct?.title) {
    return mergedProduct;
  }

  if (bestProduct?.title) {
    return bestProduct;
  }

  throw lastError || new Error("No usable product details were extracted");
}

function mergeAttemptProducts(results, url, asin, amazonHost) {
  if (!Array.isArray(results) || !results.length) {
    return null;
  }

  const ordered = [...results].sort((left, right) => {
    const leftSourceBoost = getAttemptPriorityBoost(left);
    const rightSourceBoost = getAttemptPriorityBoost(right);
    return (right.score + rightSourceBoost) - (left.score + leftSourceBoost);
  });

  const rankedForPrice = [...results].sort((left, right) => {
    const leftRank = getPriceSourcePriority(left);
    const rightRank = getPriceSourcePriority(right);
    return leftRank - rightRank || right.score - left.score;
  });

  const rankedForReview = [...results].sort((left, right) => {
    const leftRank = getReviewSourcePriority(left);
    const rightRank = getReviewSourcePriority(right);
    return leftRank - rightRank || right.score - left.score;
  });

  const best = ordered[0];
  const titleResult = pickResult(ordered, (entry) => entry.product.title);
  const bulletResult = pickResult(ordered, (entry) => (entry.product.bulletPoints || []).length);
  const descriptionResult = pickResult(ordered, (entry) => entry.product.productDescription);
  const priceResult = pickResult(rankedForPrice, (entry) => entry.product.sellingPrice && !isSuspiciousPrice(entry.product.sellingPrice));
  const mrpResult = pickResult(rankedForPrice, (entry) => entry.product.mrp && !isSuspiciousPrice(entry.product.mrp));
  const reviewsResult = pickResult(rankedForReview, (entry) => entry.product.numberOfReviews);
  const ratingResult = pickResult(rankedForReview, (entry) => entry.product.rating);
  const sellerResult = pickResult(ordered, (entry) => entry.product.buyBoxWinner);
  const availabilityResult = pickResult(ordered, (entry) => entry.product.availabilityStatus);
  const dealResult = pickResult(ordered, (entry) => entry.product.dealStatus && !isSuspiciousDealText(entry.product.dealStatus));
  const backendKeywordsResult = pickResult(ordered, (entry) => (entry.product.backendKeywords || []).length);

  const sourceNames = [
    titleResult?.product.sourceName,
    priceResult?.product.sourceName,
    reviewsResult?.product.sourceName,
    ratingResult?.product.sourceName,
    sellerResult?.product.sourceName,
  ].filter(Boolean);

  const uniqueSources = [...new Set(sourceNames)];
  const sourceName = uniqueSources.length > 1 ? uniqueSources.join(" + ") : (uniqueSources[0] || best.product.sourceName);

  return {
    sourceName,
    asin: asin || best.product.asin,
    url: asin ? `${amazonHost}/dp/${asin}` : (best.product.url || url),
    title: titleResult?.product.title || best.product.title,
    bulletPoints: bulletResult?.product.bulletPoints || best.product.bulletPoints || [],
    productDescription: descriptionResult?.product.productDescription || best.product.productDescription || "",
    sellingPrice: priceResult?.product.sellingPrice || "",
    mrp: mrpResult?.product.mrp || "",
    discountPercent: calculateDiscountPercent(priceResult?.product.sellingPrice || "", mrpResult?.product.mrp || ""),
    numberOfReviews: reviewsResult?.product.numberOfReviews || "",
    rating: ratingResult?.product.rating || "",
    availabilityStatus: availabilityResult?.product.availabilityStatus || "",
    buyBoxAvailable: Boolean((sellerResult?.product.buyBoxAvailable || availabilityResult?.product.buyBoxAvailable || best.product.buyBoxAvailable) && !isUnavailableStatus(availabilityResult?.product.availabilityStatus || best.product.availabilityStatus || "")),
    buyBoxWinner: sellerResult?.product.buyBoxWinner || "",
    dealStatus: dealResult?.product.dealStatus || "",
    backendKeywords: backendKeywordsResult?.product.backendKeywords || best.product.backendKeywords || [],
  };
}

function pickResult(results, predicate) {
  return results.find((entry) => {
    try {
      return Boolean(predicate(entry));
    } catch (error) {
      return false;
    }
  }) || null;
}

function getPriceSourcePriority(entry) {
  const product = entry?.product || {};
  const source = String(product.sourceName || "");

  if (product.sellingPrice && !isSuspiciousPrice(product.sellingPrice) && /^Amazon Product Page$/i.test(source)) {
    return 0;
  }

  if (product.sellingPrice && !isSuspiciousPrice(product.sellingPrice) && /Jina Mirror/i.test(source)) {
    return 1;
  }

  if (product.sellingPrice && !isSuspiciousPrice(product.sellingPrice) && /^Amazon Mobile Product Page$/i.test(source)) {
    return 2;
  }

  return 9;
}

function getReviewSourcePriority(entry) {
  const product = entry?.product || {};
  const source = String(product.sourceName || "");

  if ((product.numberOfReviews || product.rating) && /^Amazon Product Page$/i.test(source)) {
    return 0;
  }

  if ((product.numberOfReviews || product.rating) && /Jina Mirror/i.test(source)) {
    return 1;
  }

  if ((product.numberOfReviews || product.rating) && /^Amazon Mobile Product Page$/i.test(source)) {
    return 2;
  }

  return 9;
}

function getAttemptPriorityBoost(entry) {
  const source = String(entry?.attempt?.sourceName || entry?.product?.sourceName || "");

  if (/^Amazon Product Page$/i.test(source)) {
    return 5;
  }

  if (/Jina Mirror/i.test(source)) {
    return 2;
  }

  if (/^Amazon Search Page$/i.test(source)) {
    return 1;
  }

  if (/^Amazon Mobile Product Page$/i.test(source)) {
    return 0;
  }

  return 0;
}

function buildAttempts(url, asin, amazonHost) {
  const directUrl = url;
  const mobileUrl = asin ? `${amazonHost}/gp/aw/d/${asin}` : url;
  const searchUrl = asin ? `${amazonHost}/s?k=${asin}` : "";
  const mirrorBase = asin ? `${amazonHost}/dp/${asin}` : url;
  const mirrorUrl = `https://r.jina.ai/http://${mirrorBase.replace(/^https?:\/\//i, "")}`;

  return [
    { url: directUrl, sourceName: "Amazon Product Page", kind: "html" },
    ...(searchUrl ? [{ url: searchUrl, sourceName: "Amazon Search Page", kind: "html" }] : []),
    { url: mirrorUrl, sourceName: "Jina Mirror", kind: "mirror" },
    { url: mobileUrl, sourceName: "Amazon Mobile Product Page", kind: "html" },
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
    { pattern: /<span[^>]*id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i, weight: 1 },
    { pattern: /<h1[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i, weight: 1 },
    { pattern: /<title>([\s\S]*?)<\/title>/i, weight: 2 },
  ];
  const candidates = [];

  for (const { pattern, weight } of patterns) {
    const match = html.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const title = cleanAmazonTitle(cleanText(match[1]));
    if (isUsableTitle(title)) {
      candidates.push({ title, weight });
    }
  }

  return selectBestTitleCandidate(candidates);
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
  const scopedHtml = getCurrentReviewHtmlScopes(html);
  const patterns = [
    /<span[^>]*id=["']acrCustomerReviewText["'][^>]*>([\s\S]*?)<\/span>/i,
    /aria-label=["']([\d,]+)\s+Reviews?["']/i,
    /\[\(([\d,]+)\)\][\s\S]{0,160}averageCustomerReviewsAnchor/i,
    /averageCustomerReviewsAnchor[\s\S]{0,160}\[\(([\d,]+)\)\]/i,
    /([\d,]+)\s+global\s+ratings?/i,
    /([\d,]+)\s+global\s+reviews?/i,
  ];

  for (const scope of scopedHtml) {
    for (const pattern of patterns) {
      const match = scope.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const count = normalizeReviewCount(match[1]);
      if (count) {
        return count;
      }
    }
  }

  const variantPatterns = [
    /(?:\\&quot;|&quot;|")reviewCount(?:\\&quot;|&quot;|")\s*:\s*([0-9,]+)/i,
  ];

  for (const scope of getCurrentVariantReviewHtmlScopes(html)) {
    for (const pattern of variantPatterns) {
      const match = scope.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const count = normalizeReviewCount(match[1]);
      if (count) {
        return count;
      }
    }
  }

  return "";
}

function extractRatingFromHtml(html) {
  const scopedHtml = getCurrentReviewHtmlScopes(html);
  const patterns = [
    /<span[^>]*id=["']acrPopover["'][^>]*title=["']([\s\S]*?)["'][^>]*>/i,
    /<span[^>]*class=["'][^"']*a-icon-alt[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /([0-5](?:\.\d)?)\s+out of 5 stars/i,
  ];

  for (const scope of scopedHtml) {
    for (const pattern of patterns) {
      const match = scope.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const ratingMatch = cleanText(match[1]).match(/([0-5](?:\.\d)?)/);
      if (ratingMatch?.[1]) {
        return normalizeRatingValue(ratingMatch[1]);
      }
    }
  }

  const variantPatterns = [
    /(?:\\&quot;|&quot;|")displayString(?:\\&quot;|&quot;|")\s*:\s*(?:\\&quot;|&quot;|")([0-5](?:\.\d)?)\s+out of 5 stars/i,
    /(?:\\&quot;|&quot;|")value(?:\\&quot;|&quot;|")\s*:\s*([0-5](?:\.\d)?)/i,
  ];

  for (const scope of getCurrentVariantReviewHtmlScopes(html)) {
    for (const pattern of variantPatterns) {
      const match = scope.match(pattern);
      if (match?.[1]) {
        return normalizeRatingValue(match[1]);
      }
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
  const source = String(text || "");
  const reviewSection = extractCurrentProductReviewSectionFromText(source);
  const heroSection = extractCurrentProductTopWindowFromText(source);
  const patterns = [
    /rated\s+[0-5](?:\.\d)?\s+out of 5 stars from\s+([\d,]+)\s+reviews/i,
    /\[\(([\d,]+)\)\]\([^)]*averageCustomerReviewsAnchor/i,
    /averageCustomerReviewsAnchor[\s\S]{0,160}\[\(([\d,]+)\)\]/i,
    /([\d,]+)\s+global\s+ratings?/i,
    /([\d,]+)\s+global\s+reviews?/i,
  ];

  if (/no customer reviews/i.test(reviewSection)) {
    return "";
  }

  for (const pattern of patterns) {
    const match = reviewSection.match(pattern) || heroSection.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const count = normalizeReviewCount(match[1]);
    if (count) {
      return count;
    }
  }

  const variantMatch = heroSection.match(/(?:\\&quot;|&quot;|")reviewCount(?:\\&quot;|&quot;|")\s*:\s*([0-9,]+)/i);
  if (variantMatch?.[1]) {
    const count = normalizeReviewCount(variantMatch[1]);
    if (count) {
      return count;
    }
  }

  return "";
}

function extractRatingFromText(text) {
  const source = String(text || "");
  const reviewSection = extractCurrentProductReviewSectionFromText(source);
  const heroSection = extractCurrentProductTopWindowFromText(source);

  if (/no customer reviews/i.test(reviewSection)) {
    return "";
  }

  const patterns = [
    /\[\s*([0-5](?:\.\d)?)\s*_?[0-5]?(?:\.\d)?\s*out of 5 stars_?\s*\]\([^)]*averageCustomerReviewsAnchor/i,
    /([0-5](?:\.\d)?)\s+out of 5 stars/i,
  ];

  for (const pattern of patterns) {
    const match = heroSection.match(pattern) || reviewSection.match(pattern);
    if (match?.[1]) {
      return normalizeRatingValue(match[1]);
    }
  }

  const variantMatch =
    heroSection.match(/(?:\\&quot;|&quot;|")displayString(?:\\&quot;|&quot;|")\s*:\s*(?:\\&quot;|&quot;|")([0-5](?:\.\d)?)\s+out of 5 stars/i) ||
    heroSection.match(/(?:\\&quot;|&quot;|")value(?:\\&quot;|&quot;|")\s*:\s*([0-5](?:\.\d)?)/i);
  if (variantMatch?.[1]) {
    return normalizeRatingValue(variantMatch[1]);
  }

  return "";
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

function normalizeReviewCount(value) {
  return cleanText(value)
    .replace(/[^\d,]/g, "")
    .replace(/^,+|,+$/g, "");
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
  const priceScopes = getCurrentPriceHtmlScopes(html, text);
  const explicitPatterns = [
    /"displayPrice"\s*:\s*"([^"]+)"/i,
    /"priceToPay"\s*:\s*"([^"]+)"/i,
    /id=["']apex-pricetopay-accessibility-label["'][^>]*>\s*([^<]+?)\s*(?:with\s+\d+\s+percent\s+savings)?\s*<\/span>/i,
    /id=["']corePriceDisplay_desktop_feature_div["'][\s\S]*?<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i,
    /id=["']corePrice_feature_div["'][\s\S]*?<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i,
    /id=["']tp_price_block_total_price_ww["'][\s\S]*?<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i,
  ];

  for (const scope of priceScopes) {
    for (const pattern of explicitPatterns) {
      const match = scope.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const candidate = normalizePriceString(match[1], detectCurrencyFromContext(match[1], scope, text));
      if (candidate && !isSuspiciousPrice(candidate)) {
        return candidate;
      }
    }
  }

  for (const snippet of priceScopes) {
    const wholeFractionMatch =
      snippet.match(/<span[^>]*class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class=["'][^"']*a-price-fraction[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ||
      snippet.match(/"priceAmount"\s*:\s*"?([0-9][\d,]*)"?\s*,\s*"priceFraction"\s*:\s*"?(\d{2})"?/i);

    if (wholeFractionMatch?.[1] && wholeFractionMatch?.[2]) {
      const combined = normalizePriceString(
        `${cleanText(wholeFractionMatch[1])}.${cleanText(wholeFractionMatch[2])}`,
        detectCurrencyFromContext(snippet, text)
      );
      if (combined && !isSuspiciousPrice(combined)) {
        return combined;
      }
    }

    const candidate = extractFirstPriceCandidate(snippet, detectCurrencyFromContext(snippet, text));
    if (candidate) {
      return candidate;
    }
  }

  return extractSellingPriceFromText(text || html);
}

function extractMrpFromHtml(html, text = "", sellingPrice = "") {
  const priceScopes = getCurrentPriceHtmlScopes(html, text);
  const patterns = [
    /M\.?\s*R\.?\s*P\.?\s*[:\-]?\s*([^<\n]+)/i,
    /List Price\s*[:\-]?\s*([^<\n]+)/i,
    /Was\s*[:\-]?\s*([^<\n]+)/i,
  ];

  for (const scope of [...priceScopes, text]) {
    for (const pattern of patterns) {
      const match = scope.match(pattern);
      if (!match?.[1]) {
        continue;
      }

      const candidate = extractFirstPriceCandidate(match[1], detectCurrencyFromContext(match[1], scope, text));
      if (candidate && candidate !== sellingPrice) {
        return candidate;
      }
    }
  }

  for (const snippet of priceScopes) {
    const candidates = extractPriceCandidates(snippet, detectCurrencyFromContext(snippet, text));
    const candidate = candidates.find((price) => price && price !== sellingPrice);
    if (candidate) {
      return candidate;
    }
  }

  return extractMrpFromText(text || html, [], sellingPrice);
}

function extractDiscountPercentFromHtml(html, text = "", sellingPrice = "", mrp = "") {
  const calculatedDiscount = calculateDiscountPercent(sellingPrice, mrp);
  const priceSection =
    extractMarkdownSection(String(text || html), "## Price", "## About this Item") ||
    extractMarkdownSection(String(text || html), "## Price", "## Product Description") ||
    collectContextSnippets(html, [
      "priceToPay",
      "corePriceDisplay_desktop_feature_div",
      "corePrice_feature_div",
      "apex_desktop",
      "basisPrice",
      "priceBlockSavingsString",
      "priceBlockStrikePriceString",
    ]).join("\n") ||
    String(text || html);
  const directPatterns = [
    /with\s+(\d{1,3})\s*percent\s+savings/i,
    /(\d{1,3})%\s*off/i,
    /Save\s+(\d{1,3})%/i,
    /Savings?\s*[:\-]?\s*(\d{1,3})%/i,
  ];

  for (const pattern of directPatterns) {
    const match = priceSection.match(pattern);
    if (match?.[1]) {
      const directPercent = `${match[1]}%`;
      if (!calculatedDiscount || directPercent === calculatedDiscount) {
        return directPercent;
      }
    }
  }

  return calculatedDiscount;
}

function extractSellingPriceFromText(text) {
  const currentWindow = extractCurrentProductTopWindowFromText(text);
  const buyBoxWindow = extractCurrentBuyBoxWindowFromText(text);
  const priceSection =
    extractMarkdownSection(buyBoxWindow, "## Price", "## About this Item") ||
    extractMarkdownSection(buyBoxWindow, "## Price", "## Product Description") ||
    buyBoxWindow ||
    extractMarkdownSection(currentWindow, "## Price", "## About this Item") ||
    extractMarkdownSection(currentWindow, "## Price", "## Product Description") ||
    currentWindow;
  const currencyHint = detectCurrencyFromContext(priceSection, buyBoxWindow, currentWindow, text);
  const displayPriceMatch = priceSection.match(/"displayPrice"\s*:\s*"([^"]+)"/i) || buyBoxWindow.match(/"displayPrice"\s*:\s*"([^"]+)"/i);

  if (displayPriceMatch?.[1]) {
    const displayPrice = normalizePriceString(displayPriceMatch[1], currencyHint);
    if (displayPrice && !isSuspiciousPrice(displayPrice)) {
      return displayPrice;
    }
  }

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

  return extractFirstPriceCandidate(priceSection, currencyHint);
}

function extractMrpFromText(text, lines = [], sellingPrice = "") {
  const textBlock = extractCurrentBuyBoxWindowFromText([String(text || ""), ...(lines || [])].join("\n"));
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

  const priceSection =
    extractMarkdownSection(textBlock, "## Price", "## About this Item") ||
    extractMarkdownSection(textBlock, "## Price", "## Product Description") ||
    textBlock;
  const candidates = extractPriceCandidates(priceSection, currencyHint);
  return candidates.find((price) => price && price !== sellingPrice) || "";
}

function extractDiscountPercentFromText(text, lines = [], sellingPrice = "", mrp = "") {
  const textBlock = [String(text || ""), ...(lines || [])].join("\n");
  const calculatedDiscount = calculateDiscountPercent(sellingPrice, mrp);
  const priceSection =
    extractMarkdownSection(textBlock, "## Price", "## About this Item") ||
    extractMarkdownSection(textBlock, "## Price", "## Product Description") ||
    textBlock;
  const patterns = [
    /with\s+(\d{1,3})\s*percent\s+savings/i,
    /(\d{1,3})%\s*off/i,
    /Save\s+(\d{1,3})%/i,
    /Savings?\s*[:\-]?\s*(\d{1,3})%/i,
  ];

  for (const pattern of patterns) {
    const match = priceSection.match(pattern);
    if (match?.[1]) {
      const directPercent = `${match[1]}%`;
      if (!calculatedDiscount || directPercent === calculatedDiscount) {
        return directPercent;
      }
    }
  }

  return calculatedDiscount;
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
  const textBlock = extractCurrentBuyBoxWindowFromText([String(text || ""), ...(lines || [])].join("\n"));
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
  const priceSectionRaw =
    extractMarkdownSection(textBlock, "## Price", "## About this Item") ||
    extractMarkdownSection(textBlock, "## Price", "## Product Description") ||
    textBlock;
  const offersSectionRaw =
    extractMarkdownSection(textBlock, "##### Offers", "## 10 days Return & Exchange") ||
    extractMarkdownSection(textBlock, "##### Offers", "## Product details") ||
    "";
  const priceSection = stripMarkdownLinks(priceSectionRaw);
  const offersSection = stripMarkdownLinks(offersSectionRaw);
  const dealPatterns = [
    /(\d+%\s+off\s+any\s+\d+(?:,\s*\d+%\s+off\s+any\s+\d+)*)/i,
    /limited time deal[:\s-]*([^\n.]+)/i,
    /deal of the day[:\s-]*([^\n.]+)/i,
    /lightning deal[:\s-]*([^\n.]+)/i,
    /coupon[:\s-]*([^\n.]+)/i,
    /(save\s+[₹$€£]?\s?[\d,.]+[^\n.]*)/i,
    /((?:extra|instant)\s+\d+%[^\n.]*(?:off|discount))/i,
    /(\d+%\s+off[^\n.]*)/i,
  ];

  for (const pattern of dealPatterns) {
    const match = priceSection.match(pattern) || offersSection.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const dealText = normalizeDealText(match[1]);
    if (dealText && isLikelyDealText(dealText) && !looksLikeNoise(dealText) && !isSuspiciousDealText(dealText)) {
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
    /[<>]/.test(seller) ||
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
    .replace(/<\/?a\b[^>]*>?/gi, " ")
    .replace(/^(ships from\s*&?\s*)?sold by\s+/i, "")
    .replace(/^(dispatches from\s*&?\s*)?sold by\s+/i, "")
    .replace(/^shipper\s*\/\s*seller\s+/i, "")
    .replace(/^(seller\s*:\s*)/i, "")
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\((?:javascript|https?:\/\/)[^)]+\)/gi, "")
    .replace(/\b(?:ships from|dispatches from)\s+amazon(?: fulfillment)?\.?/i, "")
    .replace(/\b(?:returns|payment|secure transaction|details|quantity|add to cart|buy now|sold by|ships from|dispatches from)\b.*$/i, "")
    .replace(/[).,:;]+$/g, "")
    .trim();

  const collapsedSeller = collapseRepeatedPhrase(seller);

  if (/^amazon(?:[\s.].*)?$/i.test(collapsedSeller) || /ships from amazon sold by amazon/i.test(collapsedSeller)) {
    return "Amazon";
  }

  return collapsedSeller;
}

function stripMarkdownLinks(value) {
  return String(value || "").replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1");
}

function normalizeDealText(value) {
  return cleanText(stripMarkdownLinks(value))
    .replace(/\s+/g, " ")
    .replace(/\[\]\(/g, " ")
    .replace(/\s*https?:\/\/\S+/gi, "")
    .replace(/\]\([^)]+/g, "")
    .replace(/\[\s*view[^\]]*\]/gi, " ")
    .replace(/\bview products?\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.$/, "")
    .trim();
}

function isLikelyDealText(value) {
  const normalized = String(value || "").toLowerCase();

  if (!normalized) {
    return false;
  }

  if (isSuspiciousPrice(normalized)) {
    return false;
  }

  return (
    /%/.test(normalized) ||
    /\boff\b/.test(normalized) ||
    /\bsave\b/.test(normalized) ||
    /\bcashback\b/.test(normalized) ||
    /\bcoupon\b/.test(normalized) ||
    /\bdeal\b/.test(normalized) ||
    /\bdiscount\b/.test(normalized) ||
    /\bbank offer\b/.test(normalized) ||
    /\bpartner offer\b/.test(normalized) ||
    /\binstant\b/.test(normalized) ||
    /\bemi\b/.test(normalized)
  );
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
  const textBlock = extractCurrentBuyBoxWindowFromText([String(text || ""), ...(lines || [])].join("\n")).toLowerCase();
  return /\badd to cart\b|\bbuy now\b/.test(textBlock);
}

function extractAvailabilityStatusFromHtml(html, text = "") {
  const scopes = [
    ...collectContextSnippets(html, [
      "availability",
      "availabilityInsideBuyBox_feature_div",
      "desktop_buybox",
      "buybox",
      "shipsFromSoldBy_feature_div",
      "merchantInfoFeature_feature_div",
    ], 900),
    String(text || ""),
  ];

  const positivePatterns = [
    /only\s+\d+\s+left in stock/i,
    /in stock/i,
    /available to ship/i,
  ];
  const negativePatterns = [
    /currently unavailable/i,
    /temporarily out of stock/i,
    /out of stock/i,
    /unavailable/i,
  ];

  for (const scope of scopes) {
    const normalizedScope = cleanText(scope);
    for (const pattern of positivePatterns) {
      const match = normalizedScope.match(pattern);
      if (match?.[0]) {
        return cleanText(match[0]);
      }
    }
  }

  for (const scope of scopes) {
    const normalizedScope = cleanText(scope);
    for (const pattern of negativePatterns) {
      const match = normalizedScope.match(pattern);
      if (match?.[0]) {
        return cleanText(match[0]);
      }
    }
  }

  return "";
}

function extractAvailabilityStatusFromText(text, lines = []) {
  const textBlock = extractCurrentBuyBoxWindowFromText([String(text || ""), ...(lines || [])].join("\n"));
  const positivePatterns = [
    /only\s+\d+\s+left in stock/i,
    /in stock/i,
    /usually dispatched in \d+\s+to\s+\d+\s+days/i,
    /available to ship/i,
  ];
  const negativePatterns = [
    /currently unavailable/i,
    /temporarily out of stock/i,
    /out of stock/i,
    /unavailable/i,
  ];

  for (const pattern of positivePatterns) {
    const match = textBlock.match(pattern);
    if (match?.[0]) {
      return cleanText(match[0]);
    }
  }

  for (const pattern of negativePatterns) {
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
  if (/₹|â‚¹|Ã¢â€šÂ¹|rs\.?|inr/i.test(combined)) {
    return "₹";
  }

  if (/£|Â£|Ã‚Â£|gbp/i.test(combined)) {
    return "£";
  }

  if (/€|â‚¬|Ã¢â€šÂ¬|eur/i.test(combined)) {
    return "€";
  }

  if (/cad\$|c\$|ca\$/i.test(combined)) {
    return "C$";
  }

  if (/aud\$|a\$/i.test(combined)) {
    return "A$";
  }

  if (/pln|zÅ‚/i.test(combined)) {
    return "zÅ‚";
  }

  if (/\$/i.test(combined)) {
    return "$";
  }

  return "";
}

function normalizePriceString(value, currencyHint = "") {
  const normalized = decodeHtml(String(value || ""))
    .replace(/Ã¢â€šÂ¹/g, "₹")
    .replace(/Ã‚Â£/g, "£")
    .replace(/Ã¢â€šÂ¬/g, "€")
    .replace(/\s+/g, " ")
    .trim();

  const directMatch = normalized.match(/(?:₹|Rs\.?|INR|\$|US\$|USD|£|€|EUR|C\$|CAD\$|A\$|AUD\$|PLN|zÅ‚)\s?\d[\d,]*(?:\.\d{1,2})?/i);
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
    .replace(/Ã¢â€šÂ¹/g, "₹")
    .replace(/Ã‚Â£/g, "£")
    .replace(/Ã¢â€šÂ¬/g, "€");
  const matches = [...source.matchAll(/(?:₹|Rs\.?|INR|\$|US\$|USD|£|€|EUR|C\$|CAD\$|A\$|AUD\$|PLN|zÅ‚)?\s?\d[\d,]*(?:\.\d{1,2})?/gi)]
    .map((match) => normalizePriceString(match[0], currencyHint))
    .filter(Boolean);

  return [...new Set(matches)];
}

function extractFirstPriceCandidate(value, currencyHint = "") {
  return extractSafePriceCandidates(value, currencyHint)[0] || "";
}

function extractSafePriceCandidates(value, currencyHint = "") {
  const source = decodeHtml(String(value || ""))
    .replace(/ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹/g, "₹")
    .replace(/Ãƒâ€šÃ‚Â£/g, "£")
    .replace(/ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬/g, "€");

  return extractPriceCandidates(source, currencyHint).filter((candidate) => {
    const candidateText = String(candidate || "");
    const candidateIndex = source.indexOf(candidateText.replace(/C\$|A\$|₹|\$|£|€|zÃ…â€š/g, ""));
    const context =
      candidateIndex === -1
        ? source
        : source.slice(Math.max(0, candidateIndex - 40), Math.min(source.length, candidateIndex + candidateText.length + 40));
    const hasExplicitCurrency = /(?:₹|Rs\.?|INR|\$|US\$|USD|£|€|EUR|C\$|CAD\$|A\$|AUD\$|PLN|zÃ…â€š)/i.test(candidateText);

    if (/%/.test(context) && !hasExplicitCurrency) {
      return false;
    }

    if (/\b(?:organic|cotton)\b/i.test(context) && !hasExplicitCurrency) {
      return false;
    }

    if (
      !hasExplicitCurrency &&
      !/\b(?:price|mrp|m\.r\.p|list price|deal|sale|our price|price to pay|displayprice|priceamount|savings)\b/i.test(context)
    ) {
      return false;
    }

    return true;
  });
}

function getCurrentPriceHtmlScopes(html, text = "") {
  const scopes = collectContextSnippets(html, [
    "apex-pricetopay-accessibility-label",
    "corePriceDisplay_desktop_feature_div",
    "corePrice_feature_div",
    "desktop_buybox_group_1",
    "tp_price_block_total_price_ww",
    "price_inside_buybox",
    "priceblock_ourprice",
    "priceblock_dealprice",
    "priceblock_saleprice",
    "buybox",
  ], 1400);

  if (text) {
    scopes.push(String(text || ""));
  }

  return scopes.length ? scopes : [String(html || "")];
}

function getCurrentReviewHtmlScopes(html) {
  const scopes = collectContextSnippets(html, [
    "averageCustomerReviews",
    "detailBullets_averageCustomerReviews",
    "acrCustomerReviewText",
    "acrPopover",
  ], 900);

  return scopes.length ? scopes : [String(html || "")];
}

function getCurrentVariantReviewHtmlScopes(html) {
  const scopes = collectContextSnippets(html, [
    "twisterVariations",
    "CustomerReviews\\&quot;",
    "\"reviewCount\"",
    "\\&quot;reviewCount\\&quot;",
    "\"displayString\"",
    "\\&quot;displayString\\&quot;",
  ], 1200);

  return scopes.length ? scopes : [String(html || "")];
}

function extractCurrentProductTopWindowFromText(text) {
  const source = String(text || "");
  const markdownStart = source.indexOf("Markdown Content:");
  const normalizedSource = markdownStart === -1 ? source : source.slice(markdownStart + "Markdown Content:".length);
  const endMarkers = [
    "## Customers also viewed these products",
    "## Compare with similar items",
    "## Similar items",
    "Page 1 of 1",
    "Back to top",
  ];
  let endIndex = normalizedSource.length;

  for (const marker of endMarkers) {
    const markerIndex = normalizedSource.indexOf(marker);
    if (markerIndex !== -1 && markerIndex < endIndex) {
      endIndex = markerIndex;
    }
  }

  return normalizedSource.slice(0, Math.min(endIndex, 24000));
}

function extractCurrentBuyBoxWindowFromText(text) {
  const source = String(text || "");
  const markdownStart = source.indexOf("Markdown Content:");
  const normalizedSource = markdownStart === -1 ? source : source.slice(markdownStart + "Markdown Content:".length);
  const preferredAnchors = [
    "desktop_buybox_group_1",
    "### Purchase options and add-ons",
    "### Purchase options",
  ];

  for (const anchor of preferredAnchors) {
    const anchorIndex = normalizedSource.indexOf(anchor);
    if (anchorIndex !== -1) {
      const windowStart = Math.max(0, anchorIndex - 300);
      return normalizedSource.slice(windowStart, Math.min(normalizedSource.length, anchorIndex + 9000));
    }
  }

  const nearbyAnchors = ["Ships from", "Sold by", "\n In stock ", "\nIn stock\n", "Only "];
  let startIndex = -1;

  for (const anchor of nearbyAnchors) {
    const anchorIndex = normalizedSource.indexOf(anchor);
    if (anchorIndex !== -1) {
      startIndex = anchorIndex;
      break;
    }
  }

  if (startIndex === -1) {
    return normalizedSource.slice(0, 9000);
  }

  const windowStart = Math.max(0, startIndex - 1200);
  return normalizedSource.slice(windowStart, Math.min(normalizedSource.length, startIndex + 8000));
}

function extractCurrentProductReviewSectionFromText(text) {
  const source = String(text || "");
  const reviewSection =
    extractMarkdownSection(source, "## Customer reviews", "Back to top") ||
    extractMarkdownSection(source, "## Customer reviews", "## Customers also viewed these products") ||
    extractMarkdownSection(source, "## Customer reviews", "## Similar items") ||
    "";

  return reviewSection.slice(0, 6000);
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

function normalizeRatingValue(value) {
  const ratingNumber = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(ratingNumber)) {
    return "";
  }

  return ratingNumber.toFixed(1);
}

function collapseRepeatedPhrase(value) {
  const text = String(value || "").trim().replace(/\s{2,}/g, " ");
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const firstHalf = words.slice(0, half).join(" ");
    const secondHalf = words.slice(half).join(" ");
    if (firstHalf.toLowerCase() === secondHalf.toLowerCase()) {
      return firstHalf;
    }
  }

  return text;
}

function selectBestTitleCandidate(candidates) {
  const usableCandidates = (candidates || []).filter((candidate) => candidate?.title);
  if (!usableCandidates.length) {
    return "";
  }

  const scored = usableCandidates.map((candidate) => {
    const title = candidate.title;
    let score = candidate.weight || 0;

    score += Math.min(title.length / 20, 8);

    if (/\|\s*Pack of\b/i.test(title) || /\|\s*[A-Za-z][A-Za-z0-9 !&'-]{2,}$/i.test(title)) {
      score += 3;
    }

    if (/\b(?:multicolor|printed|go green|blue-tiful|orange-y|purple-istic|pack of \d+)\b/i.test(title)) {
      score += 2;
    }

    if (/amazon\./i.test(title) || /^buy\s+/i.test(title)) {
      score -= 2;
    }

    return { title, score };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0].title;
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
    !normalized.trim() ||
    /^\s*(?:₹|rs\.?|inr|\$|£|€)\s?\d[\d,.]*\s*$/i.test(normalized) ||
    normalized.includes("[](") ||
    normalized.includes("](") ||
    normalized.includes("view products") ||
    normalized.length > 120 ||
    normalized.includes("divtoupdate") ||
    normalized.includes("feature_div") ||
    normalized.includes("customclientfunction") ||
    normalized.includes("{") ||
    normalized.includes("}") ||
    normalized.includes("officially licensed")
  );
}
