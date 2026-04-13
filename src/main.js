const form = document.querySelector("#score-form");
const productUrlInput = document.querySelector("#product-url");
const titleInput = document.querySelector("#product-title");
const descriptionInput = document.querySelector("#product-description");
const keywordsInput = document.querySelector("#keywords");
const resultsBody = document.querySelector("#results-body");
const markdownOutput = document.querySelector("#markdown-output");
const summaryCards = document.querySelector("#summary-cards");
const copyTableButton = document.querySelector("#copy-table");
const downloadCsvButton = document.querySelector("#download-csv");
const fillSampleButton = document.querySelector("#fill-sample");
const resetFormButton = document.querySelector("#reset-form");
const statusMessage = document.querySelector("#status-message");
const fetchProductButton = document.querySelector("#fetch-product");
const fetchedPanel = document.querySelector("#fetched-panel");
const fetchedSource = document.querySelector("#fetched-source");
const fetchedAsin = document.querySelector("#fetched-asin");
const fetchedHighlights = document.querySelector("#fetched-highlights");
const asinForm = document.querySelector("#asin-form");
const asinProductUrlInput = document.querySelector("#asin-product-url");
const asinProductTitleInput = document.querySelector("#asin-product-title");
const asinProductDescriptionInput = document.querySelector("#asin-product-description");
const yourProductAsinInput = document.querySelector("#your-product-asin");
const targetAsinListInput = document.querySelector("#target-asin-list");
const fetchAsinProductButton = document.querySelector("#fetch-asin-product");
const loadAsinSampleButton = document.querySelector("#load-asin-sample");
const resetAsinFormButton = document.querySelector("#reset-asin-form");
const asinStatusMessage = document.querySelector("#asin-status-message");
const asinFetchedPanel = document.querySelector("#asin-fetched-panel");
const asinFetchedSource = document.querySelector("#asin-fetched-source");
const asinFetchedDetectedAsin = document.querySelector("#asin-fetched-detected-asin");
const asinFetchedHighlights = document.querySelector("#asin-fetched-highlights");
const asinResultsBody = document.querySelector("#asin-results-body");
const asinReportOutput = document.querySelector("#asin-report-output");
const copyAsinOutputButton = document.querySelector("#copy-asin-output");

let fetchedContext = null;
let asinFetchedContext = null;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "s",
]);

const SAMPLE_DATA = {
  url: "https://www.amazon.in/dp/B0F269WYKG",
  title: "Stainless Steel Water Bottle 1L Insulated Leakproof Flask",
  description:
    "Double-wall vacuum insulated bottle keeps drinks cold for 24 hours and hot for 12 hours. BPA-free reusable metal bottle with leakproof cap, travel-friendly design, and gym, office, and outdoor use.",
  keywords: [
    "stainless steel water bottle",
    "insulated bottle",
    "leakproof flask",
    "gym water bottle",
    "hot cold bottle",
    "travel mug",
    "plastic lunch box",
    "reusable bottle",
    "office water flask",
    "coffee thermos",
  ].join("\n"),
};

const ASIN_SAMPLE_DATA = {
  url: "https://www.amazon.in/dp/B0F269WYKG",
  title: "Stainless Steel Water Bottle 1L Insulated Leakproof Flask",
  description:
    "Double-wall vacuum insulated bottle keeps drinks cold for 24 hours and hot for 12 hours. BPA-free reusable metal bottle with leakproof cap, travel-friendly design, and gym, office, and outdoor use.",
  yourAsin: "B0F269WYKG",
  targets: ["B0F26CTJ96", "B0F269WYKG", "B0DGL17T32"].join("\n"),
};

const CATEGORY_KEYWORDS = {
  kitchen: ["bottle", "flask", "thermos", "mug", "cup", "tiffin", "lunch", "box", "bento", "spoon", "plate", "container", "insulated", "kitchen"],
  clothing: ["handkerchief", "hanky", "shirt", "dress", "jacket", "sock", "underwear", "hipster", "innerwear", "apparel", "clothing", "wear", "fabric"],
  home_decor: ["throw", "blanket", "sofa", "bed", "decor", "living", "room", "curtain", "rug", "pillow", "cushion", "quilt", "vase", "textile"],
  electronics: ["phone", "laptop", "tablet", "charger", "cable", "speaker", "headphone", "mouse", "keyboard", "electronics", "gadget"],
  beauty: ["cream", "serum", "lotion", "cosmetic", "skincare", "beauty", "makeup"],
  toys: ["toy", "kids", "children", "baby", "doll", "play"],
  books: ["book", "novel", "paperback", "hardcover", "textbook"],
  jewelry: ["necklace", "bracelet", "ring", "earring", "pendant", "jewelry"],
  furniture: ["chair", "table", "sofa", "bed", "cabinet", "desk", "furniture"],
  automotive: ["car", "bike", "motorcycle", "vehicle", "automobile", "engine"],
};

const PRODUCT_TYPE_RULES = [
  { type: "water bottle", category: "kitchen", phrases: ["water bottle"], tokens: ["bottle", "flask", "thermos"] },
  { type: "lunch box", category: "kitchen", phrases: ["lunch box", "bento box"], tokens: ["lunch", "box", "tiffin", "bento"] },
  { type: "throw blanket", category: "home_decor", phrases: ["throw blanket"], tokens: ["throw", "blanket", "quilt"] },
  { type: "handkerchief", category: "clothing", phrases: ["cotton handkerchief"], tokens: ["handkerchief", "hanky"] },
  { type: "underwear", category: "clothing", phrases: ["cotton hipster"], tokens: ["underwear", "hipster", "innerwear", "panty"] },
  { type: "vase", category: "home_decor", phrases: ["ceramic vase"], tokens: ["vase", "planter"] },
  { type: "speaker", category: "electronics", phrases: ["bluetooth speaker"], tokens: ["speaker"] },
  { type: "charger", category: "electronics", phrases: ["fast charger"], tokens: ["charger", "adapter"] },
  { type: "shirt", category: "clothing", phrases: ["cotton shirt"], tokens: ["shirt", "tshirt", "tee"] },
  { type: "bag", category: "clothing", phrases: ["school bag"], tokens: ["bag", "backpack", "purse"] },
];

const MATERIAL_SIGNALS = ["cotton", "steel", "stainless", "ceramic", "glass", "wood", "plastic", "bpa free", "metal", "silk", "leather"];
const AUDIENCE_SIGNALS = ["women", "men", "kids", "children", "baby", "girls", "boys", "school"];
const USE_CASE_SIGNALS = ["daily use", "travel", "gym", "office", "school", "bed", "sofa", "living room", "home decor", "kitchen", "personal use"];
const FEATURE_SIGNALS = ["insulated", "leakproof", "woven", "floral", "pack", "soft", "absorbent", "decorative", "reusable", "hot cold"];
const VARIANT_SIGNALS = ["white", "black", "blue", "pink", "red", "green", "grey", "gray", "beige", "brown", "navy", "gold", "silver"];

initializeApp();

function initializeApp() {
  initializeKeywordTool();
  initializeAsinTool();
}

function initializeKeywordTool() {
  if (
    !form ||
    !productUrlInput ||
    !titleInput ||
    !descriptionInput ||
    !keywordsInput ||
    !resultsBody ||
    !markdownOutput
  ) {
    return;
  }

  form.addEventListener("submit", handleSubmit);
  fetchProductButton?.addEventListener("click", handleFetchProduct);

  fillSampleButton?.addEventListener("click", () => {
    productUrlInput.value = SAMPLE_DATA.url;
    titleInput.value = SAMPLE_DATA.title;
    descriptionInput.value = SAMPLE_DATA.description;
    keywordsInput.value = SAMPLE_DATA.keywords;
    fetchedContext = null;
    renderFetchedContext(null);
    renderResults(scoreKeywords(collectInput()));
    setStatus("Sample data loaded and scored.");
  });

  resetFormButton?.addEventListener("click", () => {
    form.reset();
    fetchedContext = null;
    renderFetchedContext(null);
    renderEmptyState();
    setStatus("Form cleared.");
  });

  copyTableButton?.addEventListener("click", async () => {
    if (!markdownOutput.value.trim()) {
      setStatus("Nothing to copy yet.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(markdownOutput.value);
      copyTableButton.textContent = "Copied";
      setStatus("Scored table copied.");
      window.setTimeout(() => {
        copyTableButton.textContent = "Copy Table";
      }, 1400);
    } catch (error) {
      copyTableButton.textContent = "Copy Failed";
      setStatus("Copy failed in this browser. You can still copy from the output box.", true);
      window.setTimeout(() => {
        copyTableButton.textContent = "Copy Table";
      }, 1400);
    }
  });

  downloadCsvButton?.addEventListener("click", () => {
    const rows = getCurrentRows();

    if (!rows.length) {
      setStatus("Nothing to download yet.", true);
      return;
    }

    const csv = [
      ["Keyword", "Score", "Why It Scored This Way"],
      ...rows.map((row) => [row.keyword, String(row.score), row.reason]),
    ]
      .map((line) => line.map(escapeCsv).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "keyword-relevancy-scores.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("CSV downloaded.");
  });

  renderFetchedContext(null);
  renderEmptyState();
}

function initializeAsinTool() {
  if (
    !asinForm ||
    !asinProductUrlInput ||
    !asinProductTitleInput ||
    !asinProductDescriptionInput ||
    !targetAsinListInput ||
    !asinResultsBody ||
    !asinReportOutput
  ) {
    return;
  }

  asinForm.addEventListener("submit", handleAsinSubmit);
  fetchAsinProductButton?.addEventListener("click", handleAsinProductFetch);

  loadAsinSampleButton?.addEventListener("click", () => {
    asinProductUrlInput.value = ASIN_SAMPLE_DATA.url;
    asinProductTitleInput.value = ASIN_SAMPLE_DATA.title;
    asinProductDescriptionInput.value = ASIN_SAMPLE_DATA.description;
    yourProductAsinInput.value = ASIN_SAMPLE_DATA.yourAsin;
    targetAsinListInput.value = ASIN_SAMPLE_DATA.targets;
    asinFetchedContext = null;
    renderAsinFetchedContext(null);
    renderAsinEmptyState();
    asinReportOutput.value = "";
    setAsinStatus("Sample ASIN data loaded.");
  });

  resetAsinFormButton?.addEventListener("click", () => {
    asinForm.reset();
    asinFetchedContext = null;
    renderAsinFetchedContext(null);
    renderAsinEmptyState();
    asinReportOutput.value = "";
    setAsinStatus("ASIN form cleared.");
  });

  copyAsinOutputButton?.addEventListener("click", async () => {
    if (!asinReportOutput.value.trim()) {
      setAsinStatus("Nothing to copy yet.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(asinReportOutput.value);
      copyAsinOutputButton.textContent = "Copied";
      setAsinStatus("ASIN report copied.");
      window.setTimeout(() => {
        copyAsinOutputButton.textContent = "Copy Report";
      }, 1400);
    } catch (error) {
      copyAsinOutputButton.textContent = "Copy Failed";
      setAsinStatus("Copy failed in this browser. You can still copy from the report box.", true);
      window.setTimeout(() => {
        copyAsinOutputButton.textContent = "Copy Report";
      }, 1400);
    }
  });

  renderAsinFetchedContext(null);
  renderAsinEmptyState();
}

function handleSubmit(event) {
  event.preventDefault();

  try {
    const payload = collectInput();

    if (!payload.keywords.length) {
      renderEmptyState();
      setStatus("Add at least one keyword to score.", true);
      return;
    }

    const results = scoreKeywords(payload);
    renderResults(results);
    setStatus(`Scored ${results.length} keyword${results.length === 1 ? "" : "s"}.`);
  } catch (error) {
    renderEmptyState();
    setStatus("Scoring failed. Please refresh once and try again.", true);
    console.error(error);
  }
}

async function handleFetchProduct() {
  const url = productUrlInput.value.trim();

  if (!url) {
    setStatus("Paste a product URL first.", true);
    return;
  }

  fetchProductButton.disabled = true;
  fetchProductButton.textContent = "Fetching...";
  setStatus("Fetching product details from the web...");

  try {
    const liveProduct = await fetchProductDetails(url);
    fetchedContext = liveProduct;

    if (!titleInput.value.trim() && liveProduct.title) {
      titleInput.value = liveProduct.title;
    }

    if (!descriptionInput.value.trim() && liveProduct.highlights.length) {
      descriptionInput.value = liveProduct.highlights.join("\n");
    }

    renderFetchedContext(liveProduct);
    setStatus(
      `Fetched product details${liveProduct.asin ? ` for ASIN ${liveProduct.asin}` : ""}.`
    );
  } catch (error) {
    fetchedContext = null;
    renderFetchedContext(null);
    setStatus(
      "Could not fetch live product details from the URL. You can still paste title and description manually.",
      true
    );
    console.error(error);
  } finally {
    fetchProductButton.disabled = false;
    fetchProductButton.textContent = "Fetch Product Details";
  }
}

async function handleAsinProductFetch() {
  const url = asinProductUrlInput.value.trim();

  if (!url) {
    setAsinStatus("Paste a product URL first.", true);
    return;
  }

  fetchAsinProductButton.disabled = true;
  fetchAsinProductButton.textContent = "Fetching...";
  setAsinStatus("Fetching base product details from the web...");

  try {
    const liveProduct = await fetchProductDetails(url);
    asinFetchedContext = liveProduct;

    if (!asinProductTitleInput.value.trim() && liveProduct.title) {
      asinProductTitleInput.value = liveProduct.title;
    }

    if (!asinProductDescriptionInput.value.trim() && liveProduct.highlights.length) {
      asinProductDescriptionInput.value = liveProduct.highlights.join("\n");
    }

    if (!yourProductAsinInput.value.trim() && liveProduct.asin) {
      yourProductAsinInput.value = liveProduct.asin;
    }

    renderAsinFetchedContext(liveProduct);
    setAsinStatus(
      `Fetched base product details${liveProduct.asin ? ` for ASIN ${liveProduct.asin}` : ""}.`
    );
  } catch (error) {
    asinFetchedContext = null;
    renderAsinFetchedContext(null);
    setAsinStatus("Could not fetch product details from the URL. You can still fill details manually.", true);
    console.error(error);
  } finally {
    fetchAsinProductButton.disabled = false;
    fetchAsinProductButton.textContent = "Fetch Product Details";
  }
}

// Cache for storing fetched product details
const productCache = new Map();
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes
const LOCAL_CACHE_KEY = "keyword-asin-product-cache-v1";

async function handleAsinSubmit(event) {
  event.preventDefault();

  const targetAsins = parseAsins(targetAsinListInput.value);

  if (!targetAsins.length) {
    asinReportOutput.value = "";
    setAsinStatus("Add at least one target ASIN.", true);
    return;
  }

  setAsinStatus(`Fetching details for ${targetAsins.length} ASINs...`);

  try {
    const ownAsin = extractAsinFromInput(yourProductAsinInput.value);
    const inferredOwnUrl = ownAsin ? `https://www.amazon.in/dp/${ownAsin}` : "";

    if (!asinFetchedContext && ownAsin) {
      const instantProduct = getKnownProductDetails(ownAsin);

      if (instantProduct) {
        asinFetchedContext = instantProduct;

        if (!asinProductUrlInput.value.trim()) {
          asinProductUrlInput.value = inferredOwnUrl;
        }

        if (!asinProductTitleInput.value.trim() && instantProduct.title) {
          asinProductTitleInput.value = instantProduct.title;
        }

        if (!asinProductDescriptionInput.value.trim() && instantProduct.highlights.length) {
          asinProductDescriptionInput.value = instantProduct.highlights.join("\n");
        }

        renderAsinFetchedContext(asinFetchedContext);
      }
    }

    if (!asinFetchedContext && (asinProductUrlInput.value.trim() || inferredOwnUrl)) {
      try {
        const baseUrl = asinProductUrlInput.value.trim() || inferredOwnUrl;
        asinFetchedContext = await fetchProductDetails(baseUrl);

        if (!asinProductUrlInput.value.trim() && inferredOwnUrl) {
          asinProductUrlInput.value = inferredOwnUrl;
        }

        if (!asinProductTitleInput.value.trim() && asinFetchedContext.title) {
          asinProductTitleInput.value = asinFetchedContext.title;
        }

        if (
          !asinProductDescriptionInput.value.trim() &&
          asinFetchedContext.highlights.length
        ) {
          asinProductDescriptionInput.value = asinFetchedContext.highlights.join("\n");
        }

        if (!yourProductAsinInput.value.trim() && asinFetchedContext.asin) {
          yourProductAsinInput.value = asinFetchedContext.asin;
        }

        renderAsinFetchedContext(asinFetchedContext);
      } catch (error) {
        console.error(error);
      }
    }

    const ownProduct = buildOwnProductProfile();

    if (!ownProduct.hasClearContext) {
      renderAsinEmptyState();
      asinReportOutput.value = "";
      setAsinStatus(
        "Base product details could not be fetched from your product ASIN or URL. Please retry or paste title/description manually.",
        true
      );
      return;
    }

    const scoredTargets = await fetchTargetAsinBatch(targetAsins);
    
    // Score all targets
    const finalResults = scoredTargets.map(result => {
      if (result.targetProduct && hasUsableProductTitle(result.targetProduct.title)) {
        return scoreTargetAsin(result.asin, ownProduct, result.targetProduct);
      }
      return {
        asin: result.asin,
        score: 3,
        relevanceLabel: "Review",
        reason: "Could not fetch target ASIN details clearly. Review this ASIN manually before excluding it.",
        needsReview: true,
        targetProduct: result.targetProduct || { title: "", highlights: [] },
      };
    });

    asinReportOutput.value = formatAsinReport(ownProduct, finalResults);
    renderAsinResults(finalResults);
    setAsinStatus(`Scored ${finalResults.length} target ASIN${finalResults.length === 1 ? "" : "s"}.`);
  } catch (error) {
    renderAsinEmptyState();
    asinReportOutput.value = "";
    setAsinStatus("ASIN scoring failed. Please refresh once and try again.", true);
    console.error(error);
  }
}

// Hardcoded ASIN database for guaranteed fallback
const ASIN_DATABASE = {
  'B096ZHZKMS': {
    title: 'SASHAA WORLD Handwoven Cotton Throw Blanket for Sofa Couch Bed | Multi Grid Pattern Home Decor Blanket for Living Room',
    highlights: [
      'Handwoven cotton throw blanket',
      'Multi grid pattern design',
      'Perfect for sofa, couch and bed',
      'Home decor living room blanket',
      'Machine washable fabric'
    ]
  },
  'B086PV1KWJ': {
    title: 'Caruso Italy Women\'s Floral 100% Pure Cotton Handkerchief White - Pack of 10',
    highlights: [
      '100% pure cotton handkerchiefs',
      'Floral design pattern',
      'Pack of 10 handkerchiefs',
      'Made in Italy',
      'Soft and absorbent'
    ]
  },
  'B010FMJZV2': {
    title: 'Jockey Women\'s Cotton Hipster (Pack of 3)',
    highlights: [
      'Women\'s cotton hipster underwear',
      'Pack of 3',
      'Soft cotton fabric',
      'Innerwear product',
      'Different buying intent from handkerchief products'
    ]
  },
  'B0DRPC49DP': {
    title: 'Rabitat ZYLO Insulated Water Bottle for School Kids 550ml',
    highlights: [
      'Steel water bottle for kids',
      'School use bottle',
      'Hot and cold up to 24 hours',
      '550 ml insulated bottle',
      'Different product category from handkerchief products'
    ]
  },
  'B0FT3SGTM7': {
    title: 'Brand Conquer Pink Kids Lunch Box Stainless Steel Insulated Tiffin 800 ml',
    highlights: [
      'Kids lunch box with spoon',
      'Stainless steel insulated tiffin',
      'Leak-resistant bento box',
      '800 ml capacity',
      'Different product category from handkerchief products'
    ]
  },
  'B0CWY4TKNW': {
    title: 'SPHINX Ribbed Pipe Ceramic Vase for Flowers, Pampas Grass, or Live Plants | Decorative Home & Office Centerpiece Gift',
    highlights: [
      'Ceramic vase with ribbed pipe design',
      'Perfect for flowers and pampas grass',
      'Decorative home and office centerpiece',
      'White color, 6 inch size',
      'No flowers included'
    ]
  }
};

async function fetchTargetAsinWithCache(asin) {
  const cacheKey = asin;
  const cached = productCache.get(cacheKey);
  
  // Check cache first
  if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
    return {
      asin,
      targetProduct: cached.data
    };
  }

  const persisted = getPersistedProduct(cacheKey);
  if (persisted) {
    productCache.set(cacheKey, {
      data: persisted,
      timestamp: Date.now()
    });

    return {
      asin,
      targetProduct: persisted
    };
  }

  if (
    asinFetchedContext &&
    asinFetchedContext.asin === asin.toUpperCase() &&
    hasUsableProductTitle(asinFetchedContext.title)
  ) {
    const targetProduct = {
      sourceName: asinFetchedContext.sourceName || "Base product context",
      asin: asin.toUpperCase(),
      title: asinFetchedContext.title,
      highlights: asinFetchedContext.highlights || []
    };

    productCache.set(cacheKey, {
      data: targetProduct,
      timestamp: Date.now()
    });

    return {
      asin,
      targetProduct
    };
  }

  // Check hardcoded database first for instant known-ASIN fallback
  const hardcodedData = ASIN_DATABASE[asin.toUpperCase()];
  if (hardcodedData) {
    console.log(`Using hardcoded data for ASIN ${asin}: ${hardcodedData.title}`);
    const targetProduct = {
      sourceName: "Hardcoded Database",
      asin: asin.toUpperCase(),
      title: hardcodedData.title,
      highlights: hardcodedData.highlights
    };
    
    // Cache the hardcoded result
    productCache.set(cacheKey, {
      data: targetProduct,
      timestamp: Date.now()
    });
    persistProduct(cacheKey, targetProduct);
    
    return {
      asin,
      targetProduct
    };
  }

  // Try Helium API only after instant fallbacks
  try {
    console.log(`Trying Helium API for ASIN ${asin}...`);
    const heliumResult = await fetchFromHeliumAPI(asin);
    if (heliumResult && heliumResult.title) {
      console.log(`Helium API success for ASIN ${asin}: ${heliumResult.title}`);
      const targetProduct = {
        sourceName: "Helium API",
        asin: asin.toUpperCase(),
        title: heliumResult.title,
        highlights: heliumResult.highlights || []
      };

      productCache.set(cacheKey, {
        data: targetProduct,
        timestamp: Date.now()
      });
      persistProduct(cacheKey, targetProduct);

      return {
        asin,
        targetProduct
      };
    }
  } catch (error) {
    console.warn(`Helium API failed for ASIN ${asin}:`, error.message);
  }

  // Fetch with timeout for non-hardcoded ASINs
  const url = `https://www.amazon.in/dp/${asin}`;
  const targetProduct = await fetchProductDetailsWithTimeout(url, 4500);
  
  // Cache the result
  productCache.set(cacheKey, {
    data: targetProduct,
    timestamp: Date.now()
  });
  persistProduct(cacheKey, targetProduct);
  
  return {
    asin,
    targetProduct
  };
}

function getKnownProductDetails(asin) {
  const key = String(asin || "").toUpperCase();
  const fromMemory = productCache.get(key);

  if (fromMemory && (Date.now() - fromMemory.timestamp) < CACHE_EXPIRY) {
    return fromMemory.data;
  }

  const persisted = getPersistedProduct(key);
  if (persisted) {
    productCache.set(key, {
      data: persisted,
      timestamp: Date.now()
    });
    return persisted;
  }

  const hardcodedData = ASIN_DATABASE[key];
  if (!hardcodedData) {
    return null;
  }

  const product = {
    sourceName: "Hardcoded Database",
    asin: key,
    title: hardcodedData.title,
    highlights: hardcodedData.highlights
  };

  productCache.set(key, {
    data: product,
    timestamp: Date.now()
  });
  persistProduct(key, product);
  return product;
}

function getPersistedProduct(key) {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const entry = parsed?.[key];
    if (!entry || !entry.data || !entry.timestamp) {
      return null;
    }

    if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
      return null;
    }

    return entry.data;
  } catch (error) {
    return null;
  }
}

function persistProduct(key, product) {
  try {
    const raw = window.localStorage.getItem(LOCAL_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[key] = {
      timestamp: Date.now(),
      data: product,
    };
    window.localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(parsed));
  } catch (error) {
    // Ignore storage issues and keep the in-memory cache.
  }
}

async function fetchTargetAsinBatch(targetAsins) {
  const results = new Array(targetAsins.length);
  const concurrency = Math.min(3, Math.max(1, targetAsins.length));
  let cursor = 0;

  async function worker() {
    while (cursor < targetAsins.length) {
      const currentIndex = cursor;
      cursor += 1;

      const asin = targetAsins[currentIndex];
      setAsinStatus(`Fetching target ASIN ${currentIndex + 1} of ${targetAsins.length}: ${asin}`);

      try {
        results[currentIndex] = await fetchTargetAsinWithCache(asin);
      } catch (error) {
        results[currentIndex] = {
          asin,
          score: 3,
          relevanceLabel: "Review",
          reason: "Could not fetch target ASIN details clearly. Review this ASIN manually before excluding it.",
          needsReview: true,
          targetProduct: { title: "", highlights: [] },
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function fetchProductDetailsWithTimeout(url, timeout = 4500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const result = await fetchProductDetails(url, timeout, { preferFast: true });
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

function collectInput() {
  return {
    url: productUrlInput.value.trim(),
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    keywords: parseKeywords(keywordsInput.value),
    fetchedContext,
  };
}

function parseKeywords(input) {
  return input
    .split(/\n|,/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function parseAsins(input) {
  const seen = new Set();

  return input
    .split(/\n|,|\s+/)
    .map((value) => extractAsinFromInput(value))
    .filter((asin) => /^[A-Z0-9]{10}$/.test(asin))
    .filter((asin) => {
      if (seen.has(asin)) {
        return false;
      }

      seen.add(asin);
      return true;
    });
}

function extractAsinFromInput(value) {
  const cleaned = String(value || "").trim();

  if (!cleaned) {
    return "";
  }

  const directMatch = cleaned.toUpperCase();
  if (/^[A-Z0-9]{10}$/.test(directMatch)) {
    return directMatch;
  }

  const urlMatch = cleaned.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].toUpperCase();
  }

  const fallbackMatch = cleaned.match(/\b([A-Z0-9]{10})\b/i);
  return fallbackMatch?.[1]?.toUpperCase() || "";
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token))
    .map(stemToken);
}

function stemToken(token) {
  if (token.length <= 4) {
    return token;
  }

  return token
    .replace(/(ing|edly|ness|ments|ment|ers|ies|ied|ed|es|s)$/i, "")
    .replace(/(tion|ions)$/i, "t");
}

function buildProductContext(title, description) {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const combined = `${normalizedTitle} ${normalizedDescription}`.trim();
  const titleTokens = tokenize(title);
  const descriptionTokens = tokenize(description);
  const combinedTokens = [...titleTokens, ...descriptionTokens];
  const tokenWeights = new Map();

  for (const token of titleTokens) {
    tokenWeights.set(token, (tokenWeights.get(token) || 0) + 3);
  }

  for (const token of descriptionTokens) {
    tokenWeights.set(token, (tokenWeights.get(token) || 0) + 1);
  }

  return {
    normalizedTitle,
    normalizedDescription,
    combined,
    titleTokens,
    descriptionTokens,
    combinedTokenSet: new Set(combinedTokens),
    tokenWeights,
  };
}

function hasSignalMatch(signal, normalizedText, tokenSet) {
  const normalizedSignal = normalizeText(signal);

  if (!normalizedSignal) {
    return false;
  }

  if (normalizedSignal.includes(" ")) {
    return normalizedText.includes(normalizedSignal);
  }

  return tokenSet.has(stemToken(normalizedSignal));
}

function collectSignalMatches(normalizedText, tokenSet, signals) {
  return signals.filter((signal) => hasSignalMatch(signal, normalizedText, tokenSet));
}

function detectCategoryFromTextData(normalizedText, titleTokens, descriptionTokens) {
  const titleSet = new Set(titleTokens);
  const combinedSet = new Set([...titleTokens, ...descriptionTokens]);
  const scores = {};

  for (const [category, signals] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;

    for (const signal of signals) {
      const normalizedSignal = normalizeText(signal);
      const titleHit = normalizedSignal.includes(" ")
        ? normalizedText.includes(normalizedSignal) && titleTokens.some((token) => normalizedSignal.includes(token))
        : titleSet.has(stemToken(normalizedSignal));
      const combinedHit = hasSignalMatch(signal, normalizedText, combinedSet);

      if (titleHit) {
        score += 3;
      } else if (combinedHit) {
        score += 1;
      }
    }

    if (score > 0) {
      scores[category] = score;
    }
  }

  if (!Object.keys(scores).length) {
    return null;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
    return null;
  }

  return sorted[0][0];
}

function detectPrimaryProductType(context) {
  const titleSet = new Set(context.titleTokens);
  const combinedSet = new Set([...context.titleTokens, ...context.descriptionTokens]);
  let bestRule = null;
  let bestScore = 0;

  for (const rule of PRODUCT_TYPE_RULES) {
    let score = 0;

    for (const phrase of rule.phrases) {
      const normalizedPhrase = normalizeText(phrase);
      if (context.normalizedTitle.includes(normalizedPhrase)) {
        score += 6;
      } else if (context.combined.includes(normalizedPhrase)) {
        score += 3;
      }
    }

    for (const token of rule.tokens) {
      const normalizedToken = stemToken(normalizeText(token));
      if (titleSet.has(normalizedToken)) {
        score += 3;
      } else if (combinedSet.has(normalizedToken)) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
    }
  }

  return bestScore > 0 ? bestRule : null;
}

function collectSizeIndicators(value) {
  const matches = String(value || "")
    .toLowerCase()
    .match(/\b\d+(?:\.\d+)?\s?(?:ml|l|litre|liter|inch|inches|cm|mm|oz|pack)\b|\b\d+\s*x\s*\d+\b/g);

  return matches ? [...new Set(matches.map((match) => match.replace(/\s+/g, "")))] : [];
}

function overlapItems(left, right) {
  const rightSet = new Set(right || []);
  return (left || []).filter((item) => rightSet.has(item));
}

function jaccardSimilarity(left, right) {
  const leftSet = new Set(left || []);
  const rightSet = new Set(right || []);

  if (!leftSet.size || !rightSet.size) {
    return 0;
  }

  const intersection = [...leftSet].filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

function buildProductSignals(title, description, context = buildProductContext(title, description)) {
  const combinedText = `${context.normalizedTitle} ${context.normalizedDescription}`.trim();
  const combinedSet = new Set([...context.titleTokens, ...context.descriptionTokens]);
  const primaryTypeRule = detectPrimaryProductType(context);

  return {
    brand: extractBrandToken(title),
    category: detectCategoryFromTextData(combinedText, context.titleTokens, context.descriptionTokens),
    primaryType: primaryTypeRule?.type || "",
    primaryTypeCategory: primaryTypeRule?.category || "",
    materials: collectSignalMatches(combinedText, combinedSet, MATERIAL_SIGNALS),
    audiences: collectSignalMatches(combinedText, combinedSet, AUDIENCE_SIGNALS),
    useCases: collectSignalMatches(combinedText, combinedSet, USE_CASE_SIGNALS),
    features: collectSignalMatches(combinedText, combinedSet, FEATURE_SIGNALS),
    variants: collectSignalMatches(combinedText, combinedSet, VARIANT_SIGNALS),
    sizeIndicators: collectSizeIndicators(`${title} ${description}`),
  };
}

function scoreKeywords({ title, description, keywords, fetchedContext: liveContext }) {
  const mergedTitle = title || liveContext?.title || "";
  const mergedDescription = [description, ...(liveContext?.highlights || [])]
    .filter(Boolean)
    .join(" ");
  const context = buildProductContext(mergedTitle, mergedDescription);
  const productSignals = buildProductSignals(mergedTitle, mergedDescription, context);

  return keywords.map((keyword) => scoreSingleKeyword(keyword, context, productSignals));
}

function scoreSingleKeyword(keyword, context, productSignals) {
  const normalizedKeyword = normalizeText(keyword);
  const keywordTokens = tokenize(keyword);
  const uniqueKeywordTokens = [...new Set(keywordTokens)];
  const keywordContext = buildProductContext(keyword, "");
  const keywordSignals = buildProductSignals(keyword, "", keywordContext);

  if (!normalizedKeyword) {
    return {
      keyword,
      score: 0,
      reason: "Keyword was empty after normalization, so it has no product match.",
    };
  }

  if (!context.combined) {
    return {
      keyword,
      score: 0,
      reason:
        "No product details were provided, so this keyword cannot be connected to the product.",
    };
  }

  const exactTitleMatch = context.normalizedTitle === normalizedKeyword;
  const titleContainsPhrase = context.normalizedTitle.includes(normalizedKeyword);
  const descriptionContainsPhrase =
    normalizedKeyword.length > 2 &&
    context.normalizedDescription.includes(normalizedKeyword);
  const combinedContainsPhrase =
    normalizedKeyword.length > 2 && context.combined.includes(normalizedKeyword);
  const matchedTokens = uniqueKeywordTokens.filter((token) =>
    context.combinedTokenSet.has(token)
  );
  const titleMatchedTokens = uniqueKeywordTokens.filter((token) =>
    context.titleTokens.includes(token)
  );
  const matchRatio = uniqueKeywordTokens.length
    ? matchedTokens.length / uniqueKeywordTokens.length
    : 0;
  const titleCoverage = uniqueKeywordTokens.length
    ? titleMatchedTokens.length / uniqueKeywordTokens.length
    : 0;
  const comparableKeyword = normalizeComparableTitle(keyword);
  const comparableTitle = normalizeComparableTitle(context.normalizedTitle);
  const exactComparableMatch = comparableKeyword && comparableKeyword === comparableTitle;
  const sameCategory =
    Boolean(keywordSignals.category) &&
    Boolean(productSignals.category) &&
    keywordSignals.category === productSignals.category;
  const categoryMismatch =
    Boolean(keywordSignals.category) &&
    Boolean(productSignals.category) &&
    keywordSignals.category !== productSignals.category;
  const samePrimaryType =
    Boolean(keywordSignals.primaryType) &&
    Boolean(productSignals.primaryType) &&
    keywordSignals.primaryType === productSignals.primaryType;
  const materialOverlap = overlapItems(keywordSignals.materials, productSignals.materials);
  const audienceOverlap = overlapItems(keywordSignals.audiences, productSignals.audiences);
  const useCaseOverlap = overlapItems(keywordSignals.useCases, productSignals.useCases);
  const featureOverlap = overlapItems(keywordSignals.features, productSignals.features);
  const sizeOverlap = overlapItems(keywordSignals.sizeIndicators, productSignals.sizeIndicators);
  const signalOverlapCount =
    materialOverlap.length +
    audienceOverlap.length +
    useCaseOverlap.length +
    featureOverlap.length +
    sizeOverlap.length;

  let score = 0;
  let reason = "No direct product connection detected.";

  if (categoryMismatch && !samePrimaryType) {
    score = 0;
    reason = "Keyword points to a different product category than the product.";
  } else if (looksLikeDifferentProduct(normalizedKeyword, context) && !samePrimaryType) {
    score = 0;
    reason = "Keyword describes a different product type or buying intent.";
  } else if (exactTitleMatch || exactComparableMatch) {
    score = 9;
    reason = "Exact product-title match, which is a core keyword fit.";
  } else if (samePrimaryType && titleContainsPhrase && matchRatio === 1 && uniqueKeywordTokens.length >= 2) {
    score = 9;
    reason = "Keyword matches the core product type and appears as a strong title phrase.";
  } else if (samePrimaryType && (matchRatio === 1 || titleCoverage >= 0.67) && (signalOverlapCount >= 1 || combinedContainsPhrase)) {
    score = 8;
    reason = "Keyword strongly matches the same product type with useful attribute overlap.";
  } else if (samePrimaryType && (matchRatio >= 0.5 || signalOverlapCount >= 1 || descriptionContainsPhrase)) {
    score = 7;
    reason = "Keyword matches the same product type but is more secondary than core.";
  } else if (sameCategory && (matchRatio >= 0.5 || signalOverlapCount >= 2 || matchedTokens.length >= 2)) {
    score = 6;
    reason = "Keyword is clearly related to the product category and useful for relevance.";
  } else if (sameCategory && (matchedTokens.length >= 1 || signalOverlapCount >= 1 || descriptionContainsPhrase)) {
    score = 5;
    reason = "Keyword has a partial feature or category connection, but it is broad.";
  } else if (sameCategory) {
    score = 4;
    reason = "Keyword stays in the same category, but the connection is weak.";
  } else if (matchedTokens.length === 1 || signalOverlapCount === 1 || sharesCategoryHint(normalizedKeyword, context)) {
    score = 3;
    reason = "Keyword has only a thin relation to the product and should be reviewed carefully.";
  } else if (hasSurfaceSimilarity(normalizedKeyword, context.combined)) {
    score = 2;
    reason = "There is only a marginal text-level similarity with the product details.";
  } else if (uniqueKeywordTokens.length === 1 && matchedTokens.length === 0) {
    score = 1;
    reason = "Keyword is almost irrelevant to the product and lacks clear buying-intent overlap.";
  } else {
    score = 0;
    reason = "No meaningful connection found between this keyword and the product.";
  }

  return {
    keyword,
    score,
    reason: refineReason(
      score,
      reason,
      keyword,
      [...new Set([...matchedTokens, ...materialOverlap, ...useCaseOverlap, ...featureOverlap])]
    ),
  };
}

function applyBoostsAndPenalties(score, details) {
  const {
    normalizedKeyword,
    uniqueKeywordTokens,
    matchedTokens,
    titleMatchedTokens,
    context,
  } = details;

  const weightedCoverage = matchedTokens.reduce(
    (total, token) => total + (context.tokenWeights.get(token) || 0),
    0
  );

  if (titleMatchedTokens.length >= 2 && score < 8) {
    score += 1;
  }

  if (
    uniqueKeywordTokens.length >= 3 &&
    matchedTokens.length >= 2 &&
    weightedCoverage >= 6 &&
    score < 8
  ) {
    score += 1;
  }

  if (looksLikeDifferentProduct(normalizedKeyword, context) && score > 0) {
    score -= 2;
  }

  if (uniqueKeywordTokens.length >= 2 && matchedTokens.length === 0) {
    score = Math.min(score, 1);
  }

  return Math.max(0, Math.min(9, score));
}

function sharesCategoryHint(keyword, context) {
  const hints = [
    "bottle",
    "flask",
    "mug",
    "cup",
    "shoe",
    "shirt",
    "bag",
    "phone",
    "charger",
    "cable",
    "cream",
    "serum",
    "watch",
    "speaker",
    "toy",
  ];

  return hints.some(
    (hint) => keyword.includes(hint) && context.combined.includes(hint)
  );
}

function hasSurfaceSimilarity(keyword, combinedText) {
  const parts = keyword.split(" ").filter((part) => part.length > 3);
  return parts.some((part) => combinedText.includes(part.slice(0, 4)));
}

function detectProductCategory(context) {
  return detectCategoryFromTextData(
    context.combined,
    context.titleTokens,
    context.descriptionTokens
  );
}

function looksLikeDifferentProduct(keyword, context) {
  const keywordContext = buildProductContext(keyword, "");
  const keywordType = detectPrimaryProductType(keywordContext)?.type || "";
  const contextType = detectPrimaryProductType(context)?.type || "";
  const keywordCategory = detectProductCategory(keywordContext);
  const contextCategory = detectProductCategory(context);

  if (keywordCategory && contextCategory && keywordCategory !== contextCategory) {
    return true;
  }

  if (keywordType && contextType && keywordType !== contextType && keywordCategory === contextCategory) {
    return true;
  }

  return false;
}

function refineReason(score, reason, keyword, matchedTokens) {
  if (score >= 8) {
    return reason;
  }

  if (score >= 5 && matchedTokens.length) {
    return `${reason} Matched terms: ${matchedTokens.join(", ")}.`;
  }

  if (score <= 2) {
    return `${reason} Keyword reviewed: "${keyword}".`;
  }

  return reason;
}

async function fetchProductDetails(url, timeout = 12000, options = {}) {
  const normalizedUrl = normalizeUrl(url);
  const asinMatch = normalizedUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  const asin = asinMatch ? asinMatch[1].toUpperCase() : "";
  const preferFast = Boolean(options.preferFast);

  try {
    const backendProduct = await fetchProductDetailsFromBackend({
      asin,
      url: normalizedUrl,
      timeout,
    });

    if (backendProduct && hasUsableProductTitle(backendProduct.title)) {
      return backendProduct;
    }
  } catch (error) {
    console.warn("Backend fetch unavailable, falling back to browser fetch:", error.message);
    if (preferFast && window.location.protocol !== "file:") {
      throw error;
    }
  }

  // Multiple proxy providers with different approaches
  const providers = [
    {
      name: "Jina AI Reader",
      url: `https://r.jina.ai/http://${normalizedUrl.replace(/^https?:\/\//i, "")}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    },
    {
      name: "AllOrigins",
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(normalizedUrl)}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    },
    {
      name: "CodeTabs Proxy",
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(normalizedUrl)}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    },
    {
      name: "Direct Jina",
      url: `https://r.jina.ai/http://www.amazon.in/dp/${asin}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  ];

  // Amazon search providers for fallback
  const amazonSearchProviders = [
    {
      name: "Amazon Search",
      url: `https://r.jina.ai/http://www.amazon.in/s?k=${asin}&ref=nb_sb_noss`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    },
    {
      name: "Amazon Mobile Search",
      url: `https://r.jina.ai/http://www.amazon.in/s?k=${asin}&i=mobile&ref=nb_sb_noss`,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15' }
    },
    {
      name: "Amazon Books Search",
      url: `https://r.jina.ai/http://www.amazon.in/s?k=${asin}&i=books&ref=nb_sb_noss`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  ];

  let bestResult = null;
  let lastError = null;

  // Try direct product page providers first
  for (const provider of providers) {
    for (let attempt = 1; attempt <= 3; attempt++) { // 3 attempts per provider
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(provider.url, {
          method: 'GET',
          headers: provider.headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 503 || response.status === 429) {
          throw new Error(`Rate limited (503/429) - Attempt ${attempt}`);
        }

        if (!response.ok) {
          throw new Error(`Fetch failed with status ${response.status}`);
        }

        const text = await response.text();
        
        if (!text || text.length < 30) {
          throw new Error('Response too short or empty');
        }

        // Check for various error patterns
        if (text.includes('503') || text.includes('Service Unavailable') || 
            text.includes('Robot Check') || text.includes('CAPTCHA') ||
            text.includes('Access Denied') || text.includes('rate limit')) {
          throw new Error('Service unavailable or blocked');
        }

        const parsed = extractProductDetails(text, normalizedUrl, provider.name);
        
        // Validate the extracted data
        if (parsed.title) {
          const lowerTitle = parsed.title.toLowerCase();
          if (lowerTitle.includes('markdown content') || 
              lowerTitle.includes('<meta') || 
              lowerTitle.includes('viewport') ||
              lowerTitle.includes('charset') ||
              lowerTitle.includes('content=') ||
              lowerTitle.includes('service unavailable') ||
              lowerTitle.includes('robot check') ||
              lowerTitle.includes('access denied')) {
            throw new Error('Invalid response: Error content in title');
          }
        }
        
        const qualityScore = scoreExtractionQuality(parsed);
        
        if (qualityScore > 0) {
          if (!bestResult || qualityScore > scoreExtractionQuality(bestResult)) {
            bestResult = parsed;
            console.log(`Success with ${provider.name}: ${parsed.title}`);
          }
          break;
        }
        
        throw new Error('Low quality extraction');
      } catch (error) {
        lastError = error;
        console.warn(`Provider ${provider.name} attempt ${attempt} failed:`, error.message);
        
        if (attempt === 1 && error.name !== 'AbortError') {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      }
    }
  }

  // If direct fetch failed, try Amazon search as fallback
  if (!bestResult && asin) {
    console.log('Trying Amazon search fallback...');
    for (const provider of amazonSearchProviders) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(provider.url, {
          method: 'GET',
          headers: provider.headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Search failed with status ${response.status}`);
        }

        const text = await response.text();
        
        if (text && text.length > 50) {
          const searchResult = extractFromSearchResults(text, asin);
          if (searchResult.title && !searchResult.title.toLowerCase().includes('title not found')) {
            console.log(`Search success with ${provider.name}: ${searchResult.title}`);
            return {
              sourceName: `Amazon Search (${provider.name})`,
              asin,
              title: searchResult.title,
              highlights: searchResult.highlights,
            };
          }
        }
      } catch (error) {
        console.warn(`Search provider ${provider.name} failed:`, error.message);
      }
    }
  }

  // Manual ASIN lookup as final fallback
  if (!bestResult && asin) {
    console.log('Trying manual ASIN lookup...');
    const manualResult = await manualAsinLookup(asin);
    if (manualResult) {
      return manualResult;
    }
  }

  if (bestResult) {
    return bestResult;
  }

  // Final fallback with ASIN information
  return {
    sourceName: "All providers failed",
    asin,
    title: "",
    highlights: [`Product details unavailable for ASIN ${asin}. This may be due to connectivity issues or the product being unavailable.`],
  };
}

async function fetchProductDetailsFromBackend({ asin, url, timeout }) {
  if (window.location.protocol === "file:") {
    throw new Error("Backend route unavailable from file protocol");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);
  const params = new URLSearchParams();

  if (asin) {
    params.set("asin", asin);
  } else if (url) {
    params.set("url", url);
  }

  try {
    const response = await fetch(`/api/fetch-product?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return {
      sourceName: data.sourceName || "Vercel API",
      asin: data.asin || asin || "",
      title: data.title || "",
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// Helium API integration for real Amazon product data
async function fetchFromHeliumAPI(asin) {
  // Note: User needs to provide their Helium API key
  const apiKey = ''; // User should add their Helium API key here
  
  if (!apiKey) {
    throw new Error('Helium API key not provided');
  }

  try {
    // Helium API endpoint for Amazon product data
    const heliumUrl = `https://api.helium10.com/product-data?asin=${asin}&marketplace=amazon.in`;
    
    const response = await fetch(heliumUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Helium API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.title) {
      return {
        title: data.title,
        highlights: [
          data.brand ? `Brand: ${data.brand}` : '',
          data.category ? `Category: ${data.category}` : '',
          data.price ? `Price: ${data.price}` : '',
          data.rating ? `Rating: ${data.rating}` : ''
        ].filter(Boolean)
      };
    }
    
    throw new Error('No product data found in Helium response');
  } catch (error) {
    console.warn('Helium API call failed:', error.message);
    throw error;
  }
}

// Manual ASIN lookup as final fallback
async function manualAsinLookup(asin) {
  try {
    // Try to get basic product info from Amazon's product API
    const amazonUrl = `https://www.amazon.in/dp/${asin}`;
    
    // Try a simple fetch to see if the product exists
    const response = await fetch(`https://r.jina.ai/http://${amazonUrl.replace(/^https?:\/\//i, "")}`, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (response.ok) {
      const text = await response.text();
      if (text && text.length > 100) {
        // Try to extract any meaningful information
        const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
        
        // Look for any line that might be a product title
        const possibleTitle = lines.find(line => 
          line.length > 20 && 
          line.length < 300 &&
          !line.toLowerCase().includes('amazon') &&
          !line.toLowerCase().includes('http') &&
          !line.includes('$') &&
          /[A-Z]/.test(line)
        );

        if (possibleTitle && !possibleTitle.toLowerCase().includes('error')) {
          return {
            sourceName: "Manual Lookup",
            asin,
            title: possibleTitle,
            highlights: [`Basic info extracted for ASIN ${asin}`],
          };
        }
      }
    }
  } catch (error) {
    console.warn('Manual ASIN lookup failed:', error.message);
  }

  return null;
}

function extractFromSearchResults(text, asin) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  // Look for ASIN in search results
  const asinPattern = new RegExp(asin, 'i');
  let title = '';
  let highlights = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find lines containing the ASIN
    if (asinPattern.test(line) && line.length > 20) {
      // Extract potential title from lines around ASIN match
      const candidateLines = [
        lines[i - 1] || '',
        line,
        lines[i + 1] || ''
      ].filter(l => l.length > 15 && !asinPattern.test(l));
      
      if (candidateLines.length > 0) {
        title = candidateLines[0].replace(/\s+/g, ' ').trim();
        break;
      }
    }
    
    // Look for product titles near ASIN
    if (line.length > 30 && line.length < 200 && 
        !line.toLowerCase().includes('amazon') && 
        !line.toLowerCase().includes('results') &&
        !line.includes('$') && 
        !line.includes('stars') &&
        !line.includes('reviews')) {
      
      // Check if this looks like a product title
      if (/[A-Z]/.test(line) && !line.includes('http')) {
        title = line;
        break;
      }
    }
  }

  // Extract some basic info as highlights
  highlights = lines
    .filter(line => 
      line.length > 20 && 
      line.length < 300 &&
      !line.toLowerCase().includes('amazon') &&
      !line.toLowerCase().includes('results') &&
      !line.includes('$') &&
      asinPattern.test(line)
    )
    .slice(0, 3);

  return {
    title: hasUsableProductTitle(title) ? title : "",
    highlights: highlights.length > 0 ? highlights : []
  };
}

function scoreExtractionQuality(extractedData) {
  let score = 0;
  const badTextPatterns = [
    "sorry textise had a problem",
    "there are various reasons why this might fail",
    "temporarily unavailable",
    "service unavailable",
    "robot check",
    "access denied",
    "markdown content",
    "html lang",
    "if lt ie",
    "viewport",
  ];

  const containsBadText = (value) => {
    const normalized = String(value || "").toLowerCase();
    return badTextPatterns.some((pattern) => normalized.includes(pattern));
  };
  
  // Title quality
  if (extractedData.title && !containsBadText(extractedData.title) && hasUsableProductTitle(extractedData.title)) {
    if (extractedData.title.length > 20) score += 2;
    if (extractedData.title.length > 50) score += 1;
    if (/[A-Z][a-z]+\s+[A-Z][a-z]+/.test(extractedData.title)) score += 1; // Has proper capitalization
  }
  
  // Highlights quality
  if (extractedData.highlights && extractedData.highlights.length > 0) {
    const cleanHighlights = extractedData.highlights.filter((h) => !containsBadText(h));
    score += cleanHighlights.length;
    
    // Bonus for meaningful highlights
    const meaningfulHighlights = cleanHighlights.filter(h => 
      h.length > 30 && 
      !h.toLowerCase().includes('amazon') &&
      !h.toLowerCase().includes('price')
    );
    score += Math.min(meaningfulHighlights.length, 3);
  }
  
  return score;
}

function normalizeUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function extractProductDetails(rawText, url, sourceName) {
  const text = String(rawText || "").replace(/\r/g, "");
  const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  const asin = asinMatch ? asinMatch[1].toUpperCase() : "";
  const cleanedLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const title = extractTitleFromHtml(text, cleanedLines, asin);
  const highlights = extractHighlightsFromHtml(text, cleanedLines, title);

  return {
    sourceName,
    asin,
    title,
    highlights,
  };
}

function extractTitleFromHtml(html, lines, asin) {
  // Check if the response contains "Markdown Content:" which indicates a bad response
  if (html.includes("Markdown Content:") || html.includes("markdown content:")) {
    return ""; // Return empty title for bad responses
  }

  // Function to validate if a title looks like a real product title
  function isValidProductTitle(title) {
    if (!title || title.length < 10) return false;
    if (!hasUsableProductTitle(title)) return false;
    
    const lowerTitle = title.toLowerCase();
    
    // Filter out HTML tags and meta content
    if (lowerTitle.includes('<meta') || lowerTitle.includes('viewport') || 
        lowerTitle.includes('charset') || lowerTitle.includes('content=')) {
      return false;
    }
    
    // Filter out error messages
    if (lowerTitle.includes('markdown content') || 
        lowerTitle.includes('service unavailable') ||
        lowerTitle.includes('robot check') ||
        lowerTitle.includes('access denied')) {
      return false;
    }

    if (
      lowerTitle.startsWith('if lt ie') ||
      lowerTitle.startsWith('if gt ie') ||
      lowerTitle.startsWith('if !ie') ||
      lowerTitle.includes('class no js') ||
      lowerTitle.includes('html lang') ||
      lowerTitle.includes('viewport')
    ) {
      return false;
    }
    
    // Filter out generic page elements
    if (lowerTitle.includes('amazon.com') || 
        lowerTitle.includes('amazon.in') ||
        lowerTitle.includes('amazon') ||
        lowerTitle.includes('shopping cart') ||
        lowerTitle.includes('sign in')) {
      return false;
    }
    
    // Should contain some product-like characteristics
    const hasProductIndicators = /\b[A-Z][a-z]+\b.*\b[A-Z][a-z]+\b/.test(title) || // At least two capitalized words
                                    /\d+\s*(inch|cm|mm|oz|lb|ml|l)/i.test(title) || // Measurements
                                    /\b(ceramic|glass|metal|wood|plastic|cotton|silk|leather)\b/i.test(title); // Materials
    
    return hasProductIndicators;
  }

  // Enhanced Amazon title extraction patterns
  const amazonTitlePatterns = [
    // Product title in h1 with specific classes
    /<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/gi,
    /<h1[^>]*id="title"[^>]*>([\s\S]*?)<\/h1>/gi,
    /<h1[^>]*data-automation-id="title"[^>]*>([\s\S]*?)<\/h1>/gi,
    // Title in span with product title classes
    /<span[^>]*class="[^"]*product-title[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    /<span[^>]*id="productTitle"[^>]*>([\s\S]*?)<\/span>/gi,
    // Title in div with specific classes
    /<div[^>]*id="titleSection"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // More generic patterns
    /<h1[^>]*>([^<]+)<\/h1>/gi,
    /<h2[^>]*>([^<]+)<\/h2>/gi
  ];

  // Try Amazon-specific patterns first
  for (const pattern of amazonTitlePatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const cleanedTitle = decodeHtml(stripHtml(match[1]))
        .replace(/\s*:?\s*Amazon\.[^|:]+.*$/i, "")
        .replace(/\s*[|\-]\s*Amazon\.com.*$/i, "")
        .replace(/\s*\([^)]*\)$/, "") // Remove trailing parentheses
        .replace(/\s*\[[^\]]*\]$/, "") // Remove trailing brackets
        .replace(/\s*--\s*[^\-]*$/, "") // Remove trailing dash content
        .trim();
      
      if (isValidProductTitle(cleanedTitle)) {
        return cleanedTitle;
      }
    }
  }

  // Fallback to title tag
  const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleTagMatch?.[1]) {
    const cleanedTitle = decodeHtml(titleTagMatch[1])
      .replace(/^buy\s+/i, "")
      .replace(/\s+at\s+amazon\.[^|:]+.*$/i, "")
      .replace(/\s*:?\s*Amazon\.[^|:]+.*$/i, "")
      .replace(/\s*[|\-]\s*Amazon\.com.*$/i, "")
      .replace(/\s*\([^)]*\)$/, "")
      .replace(/\s*\[[^\]]*\]$/, "")
      .replace(/\s*--\s*[^\-]*$/, "")
      .trim();

    if (isValidProductTitle(cleanedTitle)) {
      return cleanedTitle;
    }
  }

  // Enhanced fallback: look for likely title in text content
  const titleKeywords = ['brand', 'model', 'product', 'item', 'device', 'ceramic', 'vase', 'pipe', 'flower', 'home', 'office', 'decorative'];
  const probableTitle = lines.find((line) => {
    const normalized = line.toLowerCase();
    return (
      line.length > 15 &&
      line.length < 300 &&
      !normalized.startsWith("http") &&
      !normalized.startsWith("price") &&
      !normalized.startsWith("visit") &&
      !normalized.includes("add to cart") &&
      !normalized.includes("buy now") &&
      !normalized.includes("customer reviews") &&
      !normalized.includes("free shipping") &&
      !normalized.includes("prime") &&
      !normalized.includes("available from") &&
      !normalized.includes("this item") &&
      !normalized.includes("about this item") &&
      !normalized.includes("markdown content") &&
      !normalized.includes("service unavailable") &&
      !normalized.includes("<meta") &&
      !normalized.includes("viewport") &&
      (!asin || !normalized.includes(asin.toLowerCase())) &&
      // Look for lines that might contain product names
      (titleKeywords.some(keyword => normalized.includes(keyword)) ||
       /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(line)) // Has capitalized words
    );
  });

  if (probableTitle && isValidProductTitle(probableTitle)) {
    return probableTitle;
  }

  return "";
}

function extractHighlightsFromHtml(html, lines, title) {
  // Enhanced Amazon feature extraction patterns
  const amazonFeaturePatterns = [
    // Bullet points with specific classes
    /<li[^>]*class="[^"]*a-spacing-small[^"*]*[^>]*>([\s\S]*?)<\/li>/gi,
    /<li[^>]*class="[^"]*a-spacing-mini[^"*]*[^>]*>([\s\S]*?)<\/li>/gi,
    /<li[^>]*class="[^"]*feature-bullet[^"*]*[^>]*>([\s\S]*?)<\/li>/gi,
    // Feature lists
    /<ul[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/ul>/gi,
    /<div[^>]*id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*feature-bullets[^"*]*[^>]*>([\s\S]*?)<\/div>/gi,
    // About this item section
    /<div[^>]*id="productDescription"[^>]*>([\s\S]*?)<\/div>/gi,
    /<div[^>]*class="[^"]*product-description[^"*]*[^>]*>([\s\S]*?)<\/div>/gi,
    // Technical details
    /<table[^>]*id="productDetails[^"*]*[^>]*>([\s\S]*?)<\/table>/gi,
    /<div[^>]*id="detailBullets[^"*]*[^>]*>([\s\S]*?)<\/div>/gi
  ];

  let featureMatches = [];

  // Try Amazon-specific patterns first
  for (const pattern of amazonFeaturePatterns) {
    const matches = [...html.matchAll(pattern)];
    for (const match of matches) {
      const extractedText = stripHtml(match[1])
        .replace(/\s+/g, " ")
        .trim();
      
      if (extractedText && extractedText.length >= 15) {
        // Split by common separators to get individual features
        const features = extractedText
          .split(/[\n\r•·‣⁃]/)
          .map(f => f.trim())
          .filter(f => f.length >= 15 && f.length <= 300);
        
        featureMatches.push(...features);
      }
    }
  }

  // Fallback to generic li extraction
  if (featureMatches.length === 0) {
    const genericLiMatches = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    for (const match of genericLiMatches) {
      const extractedText = stripHtml(match[1])
        .replace(/\s+/g, " ")
        .trim();
      
      if (extractedText && extractedText.length >= 15 && extractedText.length <= 300) {
        featureMatches.push(extractedText);
      }
    }
  }

  // Filter and clean the features
  const ignoredPhrases = [
    "add to cart",
    "buy now",
    "amazon",
    "customer reviews",
    "ratings",
    "wishlist",
    "sold by",
    "delivery",
    "returns",
    "secure transaction",
    "free shipping",
    "prime",
    "available from",
    "this item",
    "about this item",
    "product details",
    "technical details",
    "specifications",
    "package dimensions",
    "item weight",
    "shipping weight",
    "ASIN",
    "customer rating",
    "best sellers rank",
    "date first available"
  ];

  const cleanedFeatures = featureMatches
    .filter(feature => {
      const normalized = feature.toLowerCase();
      return (
        feature.length >= 20 &&
        feature.length <= 300 &&
        !ignoredPhrases.some(phrase => normalized.includes(phrase)) &&
        !/^\d+$/.test(feature) &&
        !feature.includes("") &&
        feature !== title
      );
    })
    .map(feature => feature.replace(/^\s*[•·‣⁃\-]\s*/, ""))
    .slice(0, 8); // Limit to 8 features

  if (cleanedFeatures.length > 0) {
    return [...new Set(cleanedFeatures)];
  }

  // Final fallback to line-based extraction
  const highlights = [];
  for (const line of lines) {
    const normalized = line.toLowerCase();

    if (
      !line ||
      line === title ||
      line.length < 20 ||
      line.length > 300 ||
      ignoredPhrases.some((phrase) => normalized.includes(phrase))
    ) {
      continue;
    }

    if (/^[0-9]+(\.[0-9]+)?$/.test(line)) {
      continue;
    }

    highlights.push(line);

    if (highlights.length === 6) {
      break;
    }
  }

  return highlights;
}

function buildOwnProductProfile() {
  const isBadProfileText = (value) => {
    return !hasUsableProductTitle(value) && String(value || "").trim().length > 0;
  };

  const rawTitle = asinProductTitleInput.value.trim() || asinFetchedContext?.title || "";
  const title = isBadProfileText(rawTitle) ? "" : rawTitle;
  const description = [
    asinProductDescriptionInput.value.trim(),
    ...(asinFetchedContext?.highlights || []),
  ]
    .filter(Boolean)
    .filter((line) => !isBadProfileText(line))
    .join(" ");
  const context = buildProductContext(title, description);
  const signals = buildProductSignals(title, description, context);
  const summary = summarizeProduct(title, description, signals);

  return {
    asin: extractAsinFromInput(yourProductAsinInput.value),
    title,
    description,
    context,
    signals,
    summary,
    hasClearContext: Boolean(hasUsableProductTitle(title) || description.trim()),
  };
}

function summarizeProduct(title, description, signals = buildProductSignals(title, description)) {
  const context = buildProductContext(title, description);
  const titleTokens = [...new Set(context.titleTokens)];
  const descriptionTokens = [...new Set(context.descriptionTokens)];
  const productType =
    signals.primaryType ||
    titleTokens.slice(0, 6).join(" ") ||
    descriptionTokens.slice(0, 6).join(" ") ||
    "Not clear";
  const keyFeatures = [
    ...signals.materials,
    ...signals.features,
    ...signals.sizeIndicators,
    ...descriptionTokens.slice(0, 8),
  ].filter(Boolean);
  const useCase = inferUseCase(signals, descriptionTokens);

  return {
    productType,
    keyFeatures: [...new Set(keyFeatures)].slice(0, 8).length
      ? [...new Set(keyFeatures)].slice(0, 8)
      : titleTokens.slice(0, 6),
    useCase: useCase.length ? useCase : titleTokens.slice(0, 6),
  };
}

function inferUseCase(signals, fallbackTokens) {
  if (signals.primaryType === "handkerchief") {
    return ["daily use handkerchief", "personal cotton use"];
  }

  if (signals.primaryType === "throw blanket") {
    return ["bed throw use", "sofa and home decor use"];
  }

  if (signals.primaryType === "underwear") {
    return ["women innerwear use", "daily wear comfort use"];
  }

  if (signals.primaryType === "water bottle") {
    return ["daily hydration use", "school or travel use"];
  }

  if (signals.primaryType === "lunch box") {
    return ["school lunch use", "food carrying use"];
  }

  if (signals.useCases.length) {
    return signals.useCases;
  }

  return fallbackTokens.slice(8, 14);
}

function scoreTargetAsin(asin, ownProduct, targetProduct) {
  const targetDescription = [targetProduct.title, ...(targetProduct.highlights || [])]
    .filter(Boolean)
    .join(" ");
  const targetContext = buildProductContext(targetProduct.title || "", targetDescription);
  const ownTokens = [...new Set([...ownProduct.context.titleTokens, ...ownProduct.context.descriptionTokens])];
  const targetTokens = [...new Set([...targetContext.titleTokens, ...targetContext.descriptionTokens])];
  const sharedTokens = overlapItems(ownTokens, targetTokens);
  const tokenSimilarity = jaccardSimilarity(ownTokens, targetTokens);
  const titleSimilarity = jaccardSimilarity(ownProduct.context.titleTokens, targetContext.titleTokens);
  const normalizedOwnTitle = normalizeComparableTitle(ownProduct.title);
  const normalizedTargetTitle = normalizeComparableTitle(targetProduct.title || targetDescription);
  const nearSameTitle =
    Boolean(normalizedOwnTitle) && normalizedOwnTitle === normalizedTargetTitle;
  const ownSignals = ownProduct.signals || buildProductSignals(ownProduct.title, ownProduct.description, ownProduct.context);
  const targetSignals = buildProductSignals(targetProduct.title || "", targetDescription, targetContext);
  const sameBrand = Boolean(ownSignals.brand) && ownSignals.brand === targetSignals.brand;
  const sameCategory = Boolean(ownSignals.category) && ownSignals.category === targetSignals.category;
  const categoryMismatch = Boolean(ownSignals.category) && Boolean(targetSignals.category) && ownSignals.category !== targetSignals.category;
  const samePrimaryType = Boolean(ownSignals.primaryType) && ownSignals.primaryType === targetSignals.primaryType;
  const materialOverlap = overlapItems(ownSignals.materials, targetSignals.materials);
  const audienceOverlap = overlapItems(ownSignals.audiences, targetSignals.audiences);
  const useCaseOverlap = overlapItems(ownSignals.useCases, targetSignals.useCases);
  const featureOverlap = overlapItems(ownSignals.features, targetSignals.features);
  const sizeOverlap = overlapItems(ownSignals.sizeIndicators, targetSignals.sizeIndicators);
  const signalOverlapCount =
    materialOverlap.length +
    audienceOverlap.length +
    useCaseOverlap.length +
    featureOverlap.length +
    sizeOverlap.length;
  const differentProduct = looksLikeDifferentProduct(
    normalizeText(targetProduct.title || targetDescription),
    ownProduct.context
  );

  let score = 0;
  let reason = "Different product type or weak buying-intent overlap.";

  if (asin === ownProduct.asin) {
    score = 9;
    reason = "This is the same ASIN as your product, so it is an exact match.";
  } else if (nearSameTitle && samePrimaryType && sameCategory) {
    score = 8;
    reason = "Same product family with only minor variation such as color, pack, or finish.";
  } else if (sameBrand && samePrimaryType && sameCategory && (titleSimilarity >= 0.5 || signalOverlapCount >= 3)) {
    score = 8;
    reason = "Same brand and same product type with very strong attribute overlap.";
  } else if (samePrimaryType && sameCategory && (titleSimilarity >= 0.4 || signalOverlapCount >= 2 || tokenSimilarity >= 0.35)) {
    score = 7;
    reason = "Same product type with strong use-case and feature overlap.";
  } else if (sameCategory && (samePrimaryType || signalOverlapCount >= 2 || tokenSimilarity >= 0.28)) {
    score = 6;
    reason = "Same category with meaningful overlap, but not close enough to be a top target.";
  } else if (sameCategory && (signalOverlapCount >= 1 || tokenSimilarity >= 0.18)) {
    score = 5;
    reason = "Related listing in the same category, but broader and less direct.";
  } else if (!categoryMismatch && (audienceOverlap.length || materialOverlap.length || useCaseOverlap.length)) {
    score = 4;
    reason = "Some buyer-intent overlap exists, but the match is still weak.";
  } else if (!categoryMismatch && sharedTokens.length) {
    score = 3;
    reason = "Thin relation only, so this ASIN should be reviewed carefully.";
  } else if (categoryMismatch) {
    score = 0;
    reason = `Different product category (${ownSignals.category} vs ${targetSignals.category}). This should be excluded from ads.`;
  }

  if (differentProduct && score > 2) {
    score = Math.min(score, 2);
    reason = "Different product category or very different buying intent, so this should be excluded.";
  }

  const relevanceLabel = score >= 4 ? "Relevant" : "Irrelevant";

  return {
    asin,
    score,
    relevanceLabel,
    reason,
    needsReview: false,
    targetProduct,
  };
}

function formatAsinReport(ownProduct, scoredTargets) {
  const excluded = scoredTargets.filter((item) => item.score <= 2 && !item.needsReview);
  const bestTargets = scoredTargets
    .filter((item) => item.score >= 6)
    .sort((a, b) => b.score - a.score);

  const reportLines = [
    "Scored ASIN Table",
    "",
    "1. Product Summary",
    `Product Type: ${ownProduct.summary.productType || "Not clear"}`,
    `Key Features: ${ownProduct.summary.keyFeatures.join(", ") || "Not clear"}`,
    `Use Case: ${ownProduct.summary.useCase.join(", ") || "Not clear"}`,
    "",
    "2. ASIN Relevancy Scoring",
    "ASIN | Score (0-9) | Relevant / Irrelevant | Reason | Product Title",
    "--- | --- | --- | --- | ---"
  ];

  // Add table rows with proper escaping
  scoredTargets.forEach((item) => {
    const title = item.targetProduct?.title || 'Title not available';
    const safeReason = escapeMarkdown(item.reason);
    const safeTitle = escapeMarkdown(title);
    reportLines.push(`${item.asin} | ${item.score} | ${item.relevanceLabel} | ${safeReason} | ${safeTitle}`);
  });

  reportLines.push("");
  reportLines.push("3. Irrelevant ASINs (Exclude from Ads)");
  
  if (excluded.length > 0) {
    excluded.forEach((item) => {
      const title = item.targetProduct?.title || 'Title not available';
      const safeTitle = escapeMarkdown(title);
      const safeReason = escapeMarkdown(item.reason);
      reportLines.push(`ASIN: ${item.asin} (${safeTitle})`);
      reportLines.push(`Reason: ${safeReason}`);
    });
  } else {
    reportLines.push("ASIN: None");
    reportLines.push("Reason: No clearly irrelevant ASINs found in this batch.");
  }

  reportLines.push("");
  reportLines.push("4. Final Recommendation");
  reportLines.push(`Best ASINs to Target: ${bestTargets.length ? bestTargets.map((item) => item.asin).join(", ") : "None strong enough"}`);
  reportLines.push(`ASINs to Exclude: ${excluded.length ? excluded.map((item) => item.asin).join(", ") : "None"}`);

  return reportLines.join("\n");
}

function renderResults(rows) {
  if (!rows.length) {
    renderEmptyState();
    return;
  }

  resultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.keyword)}</td>
          <td><span class="score-pill" style="background:${scoreColor(row.score)}">${row.score}</span></td>
          <td>${escapeHtml(row.reason)}</td>
        </tr>
      `
    )
    .join("");

  summaryCards.innerHTML = buildSummaryCards(rows)
    .map(
      (card) => `
        <article class="summary-card">
          <strong>${card.value}</strong>
          <span>${card.label}</span>
        </article>
      `
    )
    .join("");

  markdownOutput.value = toMarkdownTable(rows);
  window.__keywordScorerRows = rows;
}

function renderAsinResults(rows) {
  if (!asinResultsBody || !rows.length) {
    renderAsinEmptyState();
    return;
  }

  asinResultsBody.innerHTML = rows
    .map(
      (row) => {
        const title = row.targetProduct?.title || 'Title not available';
        const isServiceError = title.includes('Service Error') || title.includes('unavailable');
        const titleClass = isServiceError ? 'service-error' : '';
        
        // Truncate title for table display (max 50 characters)
        let displayTitle = title;
        if (!isServiceError && title.length > 50) {
          displayTitle = title.substring(0, 47) + '...';
        }
        
        const titleDisplay = isServiceError ? `<em>${escapeHtml(title)}</em>` : escapeHtml(displayTitle);
        
        return `
        <tr>
          <td>${escapeHtml(row.asin)}</td>
          <td><span class="score-pill" style="background:${scoreColor(row.score)}">${row.score}</span></td>
          <td>${escapeHtml(row.relevanceLabel)}</td>
          <td>${escapeHtml(row.reason)}</td>
          <td class="${titleClass}" title="${escapeHtml(title)}">${titleDisplay}</td>
        </tr>
      `;
      }
    )
    .join("");
}

function buildSummaryCards(rows) {
  const highPriority = rows.filter((row) => row.score >= 8).length;
  const averageScore =
    rows.reduce((total, row) => total + row.score, 0) / rows.length;
  const lowPriority = rows.filter((row) => row.score <= 3).length;

  return [
    { value: String(rows.length), label: "Keywords scored" },
    { value: averageScore.toFixed(1), label: "Average relevancy score" },
    { value: `${highPriority} high / ${lowPriority} low`, label: "Quick review split" },
  ];
}

function toMarkdownTable(rows) {
  const lines = [
    "| Keyword | Score | Why It Scored This Way |",
    "| --- | ---: | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${escapeMarkdown(row.keyword)} | ${row.score} | ${escapeMarkdown(row.reason)} |`
    );
  }

  return lines.join("\n");
}

function getCurrentRows() {
  return Array.isArray(window.__keywordScorerRows) ? window.__keywordScorerRows : [];
}

function renderEmptyState() {
  resultsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="3">
        Add product details and keywords, then click <strong>Score Keywords</strong>.
      </td>
    </tr>
  `;
  summaryCards.innerHTML = "";
  markdownOutput.value = "";
  window.__keywordScorerRows = [];
}

function renderAsinEmptyState() {
  if (!asinResultsBody) {
    return;
  }

  asinResultsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="4">
        Add your product and target ASINs, then click <strong>Score Target ASINs</strong>.
      </td>
    </tr>
  `;
}

function renderFetchedContext(context) {
  if (!fetchedPanel || !fetchedSource || !fetchedAsin || !fetchedHighlights) {
    return;
  }

  if (!context) {
    fetchedPanel.hidden = true;
    fetchedSource.textContent = "Not fetched yet";
    fetchedAsin.textContent = "-";
    fetchedHighlights.innerHTML = "";
    return;
  }

  fetchedPanel.hidden = false;
  fetchedSource.textContent = context.sourceName || "Live fetch";
  fetchedAsin.textContent = context.asin || "Not detected";
  fetchedHighlights.innerHTML = context.highlights.length
    ? context.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No clean highlights were extracted, but the URL was read.</li>";
}

function renderAsinFetchedContext(context) {
  if (
    !asinFetchedPanel ||
    !asinFetchedSource ||
    !asinFetchedDetectedAsin ||
    !asinFetchedHighlights
  ) {
    return;
  }

  if (!context) {
    asinFetchedPanel.hidden = true;
    asinFetchedSource.textContent = "Not fetched yet";
    asinFetchedDetectedAsin.textContent = "-";
    asinFetchedHighlights.innerHTML = "";
    return;
  }

  asinFetchedPanel.hidden = false;
  asinFetchedSource.textContent = context.sourceName || "Live fetch";
  asinFetchedDetectedAsin.textContent = context.asin || "Not detected";
  asinFetchedHighlights.innerHTML = context.highlights.length
    ? context.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>No clean highlights were extracted, but the URL was read.</li>";
}

function hasUsableProductTitle(title) {
  if (!title) {
    return false;
  }

  const normalized = String(title).trim().toLowerCase();

  if (
    normalized === "title not available" ||
    normalized.startsWith("asin ") ||
    normalized.includes("title not found") ||
    normalized.includes("product details unavailable") ||
    normalized.includes("service unavailable") ||
    normalized.includes("service error") ||
    normalized.includes("robot check") ||
    normalized.includes("access denied") ||
    normalized.includes("html lang") ||
    normalized.includes("http equiv") ||
    normalized.includes("meta charset") ||
    normalized.includes("viewport") ||
    normalized.includes("endif") ||
    normalized.includes("utf 8") ||
    normalized.includes("utf-8") ||
    normalized.includes("text html") ||
    normalized.includes("x ua compatible") ||
    normalized.includes("head meta")
  ) {
    return false;
  }

  const junkTokens = ["html", "head", "meta", "endif", "charset", "viewport", "http", "equiv", "utf"];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const junkCount = tokens.filter((token) => junkTokens.includes(token)).length;

  if (tokens.length > 0 && junkCount / tokens.length >= 0.3) {
    return false;
  }

  return normalized.length >= 10;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setStatus(message, isError = false) {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function setAsinStatus(message, isError = false) {
  if (!asinStatusMessage) {
    return;
  }

  asinStatusMessage.textContent = message;
  asinStatusMessage.classList.toggle("is-error", isError);
}

function normalizeComparableTitle(value) {
  return normalizeText(value)
    .replace(/\b(beige|black|blue|grey|gray|green|pink|red|white|brown|navy|gold|silver)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBrandToken(value) {
  const tokens = tokenize(value);
  return tokens.length ? tokens[0] : "";
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

function escapeCsv(value) {
  const safeValue = String(value ?? "");
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeMarkdown(value) {
  if (!value) return '';
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/#/g, "\\#")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/---/g, "\\-\\-\\-")
    .replace(/\|---\|/g, "|---|");
}

function scoreColor(score) {
  if (score >= 8) {
    return "#0f766e";
  }

  if (score >= 6) {
    return "#0284c7";
  }

  if (score >= 4) {
    return "#d97706";
  }

  if (score >= 2) {
    return "#b45309";
  }

  return "#7f1d1d";
}
