const DEFAULT_AMAZON_HOST = "https://www.amazon.in";

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
  const productUrl = asin
    ? `${deriveMarketplaceHost(requestedUrl)}/dp/${asin}`
    : normalizeUrl(requestedUrl);

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

  const asin = normalizeAsin(value);
  if (asin) {
    return `${DEFAULT_AMAZON_HOST}/dp/${asin}`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function deriveMarketplaceHost(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (/amazon\./i.test(parsed.hostname)) {
        return `${parsed.protocol}//${parsed.hostname}`;
      }
    } catch (error) {
      return DEFAULT_AMAZON_HOST;
    }
  }

  return DEFAULT_AMAZON_HOST;
}

async function fetchAmazonProduct(url, fallbackAsin = "") {
  const html = await fetchHtml(url);
  const asin = fallbackAsin || extractAsin(url) || extractAsin(html);
  const title = extractTitle(html);
  const highlights = extractHighlights(html, title);
  const metrics = extractSalesMetrics(html, url);

  if (!title) {
    throw new Error("Product title could not be extracted from Amazon response");
  }

  return withSafeProductMetrics({
    sourceName: "Vercel API",
    asin,
    title,
    highlights,
    price: metrics.price,
    currency: metrics.currency,
    priceValue: metrics.priceValue,
    bsr: metrics.bsr,
    category: metrics.category,
    boughtPastMonth: metrics.boughtPastMonth,
    estimatedMonthlySales: metrics.estimatedMonthlySales,
    estimatedRevenue30Days: metrics.estimatedRevenue30Days,
    estimationBasis: metrics.estimationBasis,
  });
}

async function fetchHtml(url) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];
  const acceptLanguage = getAcceptLanguage(url);

  let lastError = null;

  for (const userAgent of userAgents) {
    try {
      const result = await fetch(url, {
        headers: {
          "user-agent": userAgent,
          "accept-language": acceptLanguage,
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

function getAcceptLanguage(url) {
  const host = getAmazonHost(url);

  if (host.includes("amazon.co.uk")) return "en-GB,en;q=0.9";
  if (host.includes("amazon.de")) return "de-DE,de;q=0.9,en;q=0.7";
  if (host.includes("amazon.fr")) return "fr-FR,fr;q=0.9,en;q=0.7";
  if (host.includes("amazon.es")) return "es-ES,es;q=0.9,en;q=0.7";
  if (host.includes("amazon.it")) return "it-IT,it;q=0.9,en;q=0.7";
  if (host.includes("amazon.ca")) return "en-CA,en;q=0.9";
  if (host.includes("amazon.com.au")) return "en-AU,en;q=0.9";

  return "en-IN,en;q=0.9";
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

function extractSalesMetrics(html, url) {
  const priceData = extractPriceData(html, url);
  const rankData = extractBsrData(html);
  const boughtPastMonth = extractBoughtPastMonth(html);
  const estimatedMonthlySales = estimateMonthlySales({
    bsr: rankData.rankNumber,
    category: rankData.category,
    boughtPastMonthValue: boughtPastMonth.value,
  });
  const estimatedRevenue30Days =
    estimatedMonthlySales > 0 && priceData.priceValue > 0
      ? formatCurrencyAmount(estimatedMonthlySales * priceData.priceValue, priceData.currency)
      : "";

  return {
    price: priceData.displayPrice,
    currency: priceData.currency,
    priceValue: priceData.priceValue,
    bsr: rankData.displayRank,
    category: rankData.category,
    boughtPastMonth: boughtPastMonth.display,
    estimatedMonthlySales: estimatedMonthlySales > 0 ? formatWholeNumber(estimatedMonthlySales) : "",
    estimatedRevenue30Days,
    estimationBasis: buildEstimationBasis({
      boughtPastMonthDisplay: boughtPastMonth.display,
      rankDisplay: rankData.displayRank,
      category: rankData.category,
    }),
  };
}

function extractPriceData(html, url) {
  const host = getAmazonHost(url);
  const currencyFallback = inferCurrencyFromHost(host);
  const blockMatches = [
    ...html.matchAll(/a-price-symbol[^>]*>(.*?)<\/span>[\s\S]{0,160}?a-price-whole[^>]*>([\s\S]*?)<\/span>[\s\S]{0,80}?a-price-fraction[^>]*>([^<]+)<\/span>/gi),
  ];

  for (const match of blockMatches) {
    const symbolText = cleanText(match[1]).trim();
    const normalizedSymbol = normalizeCurrencySymbol(symbolText);

    if (normalizedSymbol && normalizedSymbol !== currencyFallback) {
      continue;
    }

    if (!normalizedSymbol && !host.includes("amazon.in")) {
      continue;
    }

    const whole = cleanText(match[2]).replace(/[^0-9,]/g, "");
    const fraction = cleanText(match[3]).replace(/[^0-9]/g, "");
    const raw = `${whole.replace(/,/g, "")}.${fraction}`;
    const priceValue = Number.parseFloat(raw);

    if (Number.isFinite(priceValue) && priceValue > 0) {
      return {
        displayPrice: formatCurrencyAmount(priceValue, currencyFallback),
        priceValue,
        currency: currencyFallback,
      };
    }
  }

  const text = cleanText(html);
  const patterns = [
    /(?:deal price|price|our price|selling price)[^0-9£$€₹]*([£$€₹])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:deal price|price|our price|selling price)[^0-9A-Z]*(INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /([£$€₹])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /\b(INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const currency = normalizeCurrencySymbol(match[1] || currencyFallback) || currencyFallback;
    if (currency && currency !== currencyFallback) {
      continue;
    }
    const priceValue = Number.parseFloat(String(match[2] || "").replace(/,/g, ""));

    if (Number.isFinite(priceValue) && priceValue > 0) {
      return {
        displayPrice: formatCurrencyAmount(priceValue, currency),
        priceValue,
        currency,
      };
    }
  }

  return {
    displayPrice: "",
    priceValue: 0,
    currency: currencyFallback,
  };
}

function extractBsrData(html) {
  const text = cleanText(html);
  const patterns = [
    /best sellers rank[:\s#]*#?\s*([0-9][0-9,]*)\s+in\s+([^#\(\)\[\]\|]+?)(?:\s+\(|\s+#|$)/i,
    /#\s*([0-9][0-9,]*)\s+in\s+([^#\(\)\[\]\|]+?)(?:\s+\(|\s+#|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const rankNumber = Number.parseInt(String(match[1] || "").replace(/,/g, ""), 10);
    const category = cleanText(match[2]).replace(/^in\s+/i, "").trim();

    if (Number.isFinite(rankNumber) && rankNumber > 0 && category) {
      return {
        rankNumber,
        displayRank: `#${formatWholeNumber(rankNumber)}`,
        category,
      };
    }
  }

  return {
    rankNumber: 0,
    displayRank: "",
    category: "",
  };
}

function extractBoughtPastMonth(html) {
  const text = cleanText(html);
  const patterns = [
    /([0-9][0-9,]*)\+\s+bought in past month/i,
    /([0-9][0-9,]*)\s+bought in past month/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) {
      continue;
    }

    const value = Number.parseInt(String(match[1] || "").replace(/,/g, ""), 10);
    if (Number.isFinite(value) && value > 0) {
      return {
        value,
        display: `${formatWholeNumber(value)}+ bought in past month`,
      };
    }
  }

  return {
    value: 0,
    display: "",
  };
}

function estimateMonthlySales({ bsr, category, boughtPastMonthValue }) {
  if (boughtPastMonthValue > 0) {
    return boughtPastMonthValue;
  }

  if (!bsr || bsr <= 0) {
    return 0;
  }

  const categoryFactor = getCategoryFactor(category);
  const estimate = Math.round((220000 * categoryFactor) / Math.pow(bsr, 0.82));
  return estimate > 0 ? estimate : 0;
}

function getCategoryFactor(category) {
  const normalized = String(category || "").toLowerCase();

  if (/(grocery|beauty|health|household)/i.test(normalized)) return 1.15;
  if (/(home|kitchen|office|pet)/i.test(normalized)) return 1;
  if (/(clothing|fashion|shoes|jewelry)/i.test(normalized)) return 0.9;
  if (/(electronics|computers|camera|video games)/i.test(normalized)) return 0.75;
  if (/(automotive|industrial|scientific|tools)/i.test(normalized)) return 0.7;
  if (/(books|kindle)/i.test(normalized)) return 0.55;

  return 0.85;
}

function buildEstimationBasis({ boughtPastMonthDisplay, rankDisplay, category }) {
  if (boughtPastMonthDisplay) {
    return "Estimate uses Amazon's public bought-in-past-month signal as the 30-day units floor.";
  }

  if (rankDisplay && category) {
    return `Estimate is based on current BSR ${rankDisplay} in ${category}.`;
  }

  if (rankDisplay) {
    return `Estimate is based on current BSR ${rankDisplay}.`;
  }

  return "Not enough data was available to estimate 30-day sales yet.";
}

function getAmazonHost(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (error) {
    return "www.amazon.in";
  }
}

function inferCurrencyFromHost(host) {
  if (host.includes("amazon.co.uk")) return "£";
  if (host.includes("amazon.in")) return "₹";
  if (host.includes("amazon.de") || host.includes("amazon.fr") || host.includes("amazon.es") || host.includes("amazon.it")) return "€";
  if (host.includes("amazon.ca")) return "C$";
  if (host.includes("amazon.com.au")) return "A$";
  return "$";
}

function normalizeCurrencySymbol(value) {
  const cleaned = String(value || "").trim().toUpperCase();
  if (!cleaned) return "";
  if (cleaned === "INR" || cleaned === "₹") return "₹";
  if (cleaned === "GBP" || cleaned === "£") return "£";
  if (cleaned === "EUR" || cleaned === "€") return "€";
  if (cleaned === "CAD" || cleaned === "C$") return "C$";
  if (cleaned === "AUD" || cleaned === "A$") return "A$";
  if (cleaned === "USD" || cleaned === "$") return "$";
  return "";
}

function formatCurrencyAmount(value, currency) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "";
  }

  const useDecimals = !Number.isInteger(numericValue);
  return `${currency}${numericValue.toLocaleString("en-US", {
    minimumFractionDigits: useDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatWholeNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue.toLocaleString("en-US")
    : "";
}

function withSafeProductMetrics(product) {
  return {
    sourceName: product?.sourceName || "",
    asin: product?.asin || "",
    title: product?.title || "",
    highlights: Array.isArray(product?.highlights) ? product.highlights : [],
    price: product?.price || "",
    currency: product?.currency || "",
    priceValue: Number.isFinite(Number(product?.priceValue)) ? Number(product.priceValue) : 0,
    bsr: product?.bsr || "",
    category: product?.category || "",
    boughtPastMonth: product?.boughtPastMonth || "",
    estimatedMonthlySales: product?.estimatedMonthlySales || "",
    estimatedRevenue30Days: product?.estimatedRevenue30Days || "",
    estimationBasis: product?.estimationBasis || "",
  };
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
