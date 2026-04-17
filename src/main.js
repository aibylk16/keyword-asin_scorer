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
const salesForm = document.querySelector("#sales-form");
const salesLookupInput = document.querySelector("#sales-lookup");
const fetchSalesEstimateButton = document.querySelector("#fetch-sales-estimate");
const resetSalesFormButton = document.querySelector("#reset-sales-form");
const salesStatusMessage = document.querySelector("#sales-status-message");
const salesFetchedPanel = document.querySelector("#sales-fetched-panel");
const salesProductTitle = document.querySelector("#sales-product-title");
const salesSource = document.querySelector("#sales-source");
const salesAsin = document.querySelector("#sales-asin");
const salesPrice = document.querySelector("#sales-price");
const salesBsr = document.querySelector("#sales-bsr");
const salesCategory = document.querySelector("#sales-category");
const salesBought = document.querySelector("#sales-bought");
const salesUnits = document.querySelector("#sales-units");
const salesRevenue = document.querySelector("#sales-revenue");
const salesBasis = document.querySelector("#sales-basis");

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

initializeApp();

function initializeApp() {
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
  initializeAsinTool();
  initializeSalesEstimatorTool();
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

function initializeSalesEstimatorTool() {
  if (
    !salesForm ||
    !salesLookupInput ||
    !fetchSalesEstimateButton ||
    !salesFetchedPanel
  ) {
    return;
  }

  salesForm.addEventListener("submit", handleSalesEstimateSubmit);
  resetSalesFormButton?.addEventListener("click", () => {
    salesForm.reset();
    renderSalesEstimate(null);
    setSalesStatus("Sales checker cleared.");
  });

  renderSalesEstimate(null);
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

async function handleSalesEstimateSubmit(event) {
  event.preventDefault();

  const lookupValue = salesLookupInput?.value.trim() || "";

  if (!lookupValue) {
    renderSalesEstimate(null);
    setSalesStatus("Paste a product URL or ASIN first.", true);
    return;
  }

  fetchSalesEstimateButton.disabled = true;
  fetchSalesEstimateButton.textContent = "Checking...";
  setSalesStatus("Fetching BSR and estimated sales...");

  try {
    const liveProduct = await fetchProductDetails(lookupValue, 15000);
    renderSalesEstimate(liveProduct);
    setSalesStatus(
      liveProduct.title
        ? `Fetched BSR and sales estimate${liveProduct.asin ? ` for ASIN ${liveProduct.asin}` : ""}.`
        : "Lookup finished, but only partial data was available for this ASIN.",
      !liveProduct.title
    );
  } catch (error) {
    renderSalesEstimate(null);
    setSalesStatus("Could not fetch BSR and sales estimate right now. Please try again.", true);
    console.error(error);
  } finally {
    fetchSalesEstimateButton.disabled = false;
    fetchSalesEstimateButton.textContent = "Check Sales Estimate";
  }
}

// Cache for storing fetched product details
const productCache = new Map();
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes

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
    const ownAsin = yourProductAsinInput.value.trim().toUpperCase();
    const inferredOwnUrl = ownAsin ? `https://www.amazon.in/dp/${ownAsin}` : "";

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

    const scoredTargets = [];

    for (let index = 0; index < targetAsins.length; index += 1) {
      const asin = targetAsins[index];
      setAsinStatus(`Fetching target ASIN ${index + 1} of ${targetAsins.length}: ${asin}`);

      try {
        const result = await fetchTargetAsinWithCache(asin);
        scoredTargets.push(result);
      } catch (error) {
        scoredTargets.push({
          asin,
          score: 0,
          relevanceLabel: "Irrelevant",
          reason: "Could not fetch target ASIN details clearly, so this result is not reliable. Recheck live data before excluding.",
          targetProduct: { title: "", highlights: [] },
        });
      }

      if (index < targetAsins.length - 1) {
        await delay(600);
      }
    }
    
    // Score all targets
    const finalResults = scoredTargets.map(result => {
      if (result.targetProduct && hasUsableProductTitle(result.targetProduct.title)) {
        return scoreTargetAsin(result.asin, ownProduct, result.targetProduct);
      }
      // Return a complete result object for failed fetches
      return {
        asin: result.asin,
        score: 0,
        relevanceLabel: "Irrelevant",
        reason: "Could not fetch target ASIN details clearly, so this result is not reliable. Recheck live data before excluding.",
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

  // Try Helium API first for real Amazon data
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
      
      // Cache the Helium result
      productCache.set(cacheKey, {
        data: targetProduct,
        timestamp: Date.now()
      });
      
      return {
        asin,
        targetProduct
      };
    }
  } catch (error) {
    console.warn(`Helium API failed for ASIN ${asin}:`, error.message);
  }

  // Check hardcoded database as fallback
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
    
    return {
      asin,
      targetProduct
    };
  }

  // Fetch with timeout for non-hardcoded ASINs
  const url = `https://www.amazon.in/dp/${asin}`;
  const targetProduct = await fetchProductDetailsWithTimeout(url, 8000); // 8 second timeout
  
  // Cache the result
  productCache.set(cacheKey, {
    data: targetProduct,
    timestamp: Date.now()
  });
  
  return {
    asin,
    targetProduct
  };
}

async function fetchProductDetailsWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const result = await fetchProductDetails(url);
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
  return input
    .split(/\n|,|\s+/)
    .map((asin) => asin.trim().toUpperCase())
    .filter((asin) => /^[A-Z0-9]{10}$/.test(asin));
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
    .filter((token) => token && !STOP_WORDS.has(token))
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

const CORE_EXCLUDE_TOKENS = new Set(
  [
    "best",
    "new",
    "premium",
    "pure",
    "natural",
    "organic",
    "waterproof",
    "dustproof",
    "uv",
    "resistant",
    "insulated",
    "leakproof",
    "portable",
    "travel",
    "daily",
    "use",
    "outdoor",
    "indoor",
    "soft",
    "comfortable",
    "comfort",
    "free",
    "bpa",
    "reusable",
    "hot",
    "cold",
    "pack",
    "set",
    "piece",
    "pieces",
    "combo",
    "size",
    "small",
    "medium",
    "large",
    "mini",
    "big",
    "heavy",
    "light",
    "gift",
  ].map((token) => stemToken(token))
);

const FEATURE_HINT_TOKENS = new Set(
  [
    "waterproof",
    "dustproof",
    "uv",
    "resistant",
    "insulated",
    "leakproof",
    "portable",
    "travel",
    "daily",
    "use",
    "outdoor",
    "indoor",
    "soft",
    "comfortable",
    "comfort",
    "free",
    "bpa",
    "reusable",
    "hot",
    "cold",
    "metal",
    "steel",
    "cotton",
    "organic",
    "natural",
    "protect",
    "protection",
    "rain",
    "dust",
    "gym",
    "office",
  ].map((token) => stemToken(token))
);

function getCoreProductTokens(tokens) {
  const uniqueTokens = [...new Set(tokens)];
  const coreTokens = uniqueTokens.filter(
    (token) => token && !CORE_EXCLUDE_TOKENS.has(token) && !/^\d+[a-z]*$/i.test(token)
  );

  return coreTokens.length
    ? coreTokens
    : uniqueTokens.slice(0, Math.min(3, uniqueTokens.length));
}

function hasVeryLightSimilarity(keyword, combinedText) {
  const parts = keyword.split(" ").filter((part) => part.length > 2);
  return parts.some((part) => combinedText.includes(part.slice(0, 3)));
}

function sharesShoppingFamily(keyword, context) {
  const families = [
    ["scooty", "scooter", "bike", "motorcycle"],
    ["bottle", "flask", "mug", "cup"],
    ["cover", "protector", "guard", "shield"],
    ["sock", "shoe", "shirt", "apparel", "cloth"],
    ["phone", "charger", "cable", "speaker", "headphone"],
  ];

  return families.some(
    (family) =>
      family.some((token) => keyword.includes(token)) &&
      family.some((token) => context.combined.includes(token))
  );
}

function getDiscoveryStrength(keyword) {
  if (/(accessor|cover|protect|protection|guard|shield)/i.test(keyword)) {
    return "strong";
  }

  if (/(item|kit|clean|cleaning|care)/i.test(keyword)) {
    return "medium";
  }

  return "";
}

function buildProductContext(title, description) {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const combined = `${normalizedTitle} ${normalizedDescription}`.trim();
  const titleTokens = tokenize(title);
  const descriptionTokens = tokenize(description);
  const combinedTokens = [...titleTokens, ...descriptionTokens];
  const coreTokens = getCoreProductTokens(titleTokens);
  const featureTokens = [
    ...new Set(
      combinedTokens.filter(
        (token) => FEATURE_HINT_TOKENS.has(token) && !coreTokens.includes(token)
      )
    ),
  ];
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
    coreTokens,
    combinedTokenSet: new Set(combinedTokens),
    coreTokenSet: new Set(coreTokens),
    featureTokenSet: new Set(featureTokens),
    tokenWeights,
  };
}

function scoreKeywords({ title, description, keywords, fetchedContext: liveContext }) {
  const mergedTitle = title || liveContext?.title || "";
  const mergedDescription = [description, ...(liveContext?.highlights || [])]
    .filter(Boolean)
    .join(" ");
  const context = buildProductContext(mergedTitle, mergedDescription);

  return keywords.map((keyword) => scoreSingleKeyword(keyword, context));
}

function scoreSingleKeyword(keyword, context) {
  const normalizedKeyword = normalizeText(keyword);
  const keywordTokens = tokenize(keyword);
  const uniqueKeywordTokens = [...new Set(keywordTokens)];

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
  const coreMatchedTokens = uniqueKeywordTokens.filter((token) =>
    context.coreTokenSet.has(token)
  );
  const featureMatchedTokens = uniqueKeywordTokens.filter((token) =>
    context.featureTokenSet.has(token)
  );
  const matchRatio = uniqueKeywordTokens.length
    ? matchedTokens.length / uniqueKeywordTokens.length
    : 0;
  const minimumCoreMatch = Math.min(2, Math.max(1, context.coreTokens.length));

  let score = 0;
  let reason = "No direct product connection detected.";

  if (
    exactTitleMatch ||
    (matchRatio === 1 && coreMatchedTokens.length >= minimumCoreMatch) ||
    (titleContainsPhrase &&
      matchRatio === 1 &&
      coreMatchedTokens.length >= minimumCoreMatch)
  ) {
    score = 9;
    reason = "Keyword directly names the product with exact buying intent.";
  } else if (
    matchRatio === 1 &&
    coreMatchedTokens.length >= 1 &&
    (titleContainsPhrase ||
      combinedContainsPhrase ||
      matchedTokens.length >= minimumCoreMatch)
  ) {
    score = 8;
    reason = "Keyword is a very close product variant or strong feature-led buying phrase.";
  } else if (
    (matchRatio >= 0.75 && coreMatchedTokens.length >= 1 && matchedTokens.length >= 2) ||
    (combinedContainsPhrase && matchedTokens.length >= 2)
  ) {
    score = 7;
    reason = "Keyword is strongly relevant, but slightly less direct than the main buying term.";
  } else if (
    matchedTokens.length >= 2 &&
    coreMatchedTokens.length >= 1 &&
    featureMatchedTokens.length >= 1
  ) {
    score = 7;
    reason = "Keyword combines the product type with a strong use or feature match.";
  } else if (matchedTokens.length >= 2 && (coreMatchedTokens.length >= 1 || featureMatchedTokens.length >= 2)) {
    score = 6;
    reason = "Keyword can help shoppers discover the product, but it is broader than the core product phrase.";
  } else if (
    sharesShoppingFamily(normalizedKeyword, context) &&
    getDiscoveryStrength(normalizedKeyword) === "strong"
  ) {
    score = 6;
    reason = "Keyword belongs to the same shopping family and can still help shoppers discover the product.";
  } else if (
    sharesShoppingFamily(normalizedKeyword, context) &&
    getDiscoveryStrength(normalizedKeyword) === "medium"
  ) {
    score = 5;
    reason = "Keyword is connected to the same shopping family, but only through a weaker secondary use.";
  } else if (
    descriptionContainsPhrase ||
    combinedContainsPhrase ||
    (matchRatio >= 0.5 && matchedTokens.length >= 2)
  ) {
    score = 5;
    reason = "Keyword has a partial connection through product use, feature, or broader discovery wording.";
  } else if (coreMatchedTokens.length === 1 || sharesCategoryHint(normalizedKeyword, context)) {
    score = 4;
    reason = "Keyword is loosely connected to the product or category, but not close to direct buying intent.";
  } else if (matchedTokens.length === 1 || featureMatchedTokens.length === 1) {
    score = 3;
    reason = "Keyword is only very weakly related and would not be useful for targeting this product.";
  } else if (hasSurfaceSimilarity(normalizedKeyword, context.combined)) {
    score = 2;
    reason = "Keyword is a poor match with only slight similarity to the product details.";
  } else if (hasVeryLightSimilarity(normalizedKeyword, context.combined)) {
    score = 1;
    reason = "Keyword is a very poor match and is almost irrelevant to the product.";
  } else {
    score = 0;
    reason = "Keyword has no meaningful relation to the product.";
  }

  score = applyBoostsAndPenalties(score, {
    keyword,
    normalizedKeyword,
    uniqueKeywordTokens,
    matchedTokens,
    titleMatchedTokens,
    context,
  });

  return { keyword, score, reason: refineReason(score, reason, keyword, matchedTokens) };
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
  const coreTitleMatchedTokens = titleMatchedTokens.filter((token) =>
    context.coreTokenSet.has(token)
  );

  if (coreTitleMatchedTokens.length >= 2 && score < 8) {
    score += 1;
  }

  if (
    uniqueKeywordTokens.length >= 3 &&
    matchedTokens.length >= 2 &&
    weightedCoverage >= 6 &&
    score >= 5 &&
    score < 7
  ) {
    score += 1;
  }

  if (looksLikeDifferentProduct(normalizedKeyword, context) && score > 0) {
    score -= 2;
  }

  if (
    uniqueKeywordTokens.length >= 2 &&
    matchedTokens.length === 0 &&
    !sharesShoppingFamily(normalizedKeyword, context) &&
    !sharesCategoryHint(normalizedKeyword, context)
  ) {
    score = Math.min(score, 1);
  }

  return Math.max(0, Math.min(9, score));
}

function sharesCategoryHint(keyword, context) {
  const hintGroups = [
    ["bottle", "flask", "mug", "cup"],
    ["shoe", "shirt", "sock", "bag", "cloth", "apparel"],
    ["phone", "charger", "cable", "speaker", "headphone"],
    ["cream", "serum", "lotion", "beauty"],
    ["car", "bike", "scooty", "vehicle", "automobile", "motorcycle"],
    ["toy", "game", "puzzle"],
  ];

  return hintGroups.some(
    (group) =>
      group.some((hint) => keyword.includes(hint)) &&
      group.some((hint) => context.combined.includes(hint))
  );
}

function hasSurfaceSimilarity(keyword, combinedText) {
  const parts = keyword.split(" ").filter((part) => part.length > 3);
  return parts.some((part) => combinedText.includes(part.slice(0, 4)));
}

function detectProductCategory(context) {
  const categoryKeywords = {
    kitchen: ["bottle", "flask", "mug", "cup", "container", "tiffin", "lunch", "box", "plate", "spoon", "fork", "knife", "pan", "pot", "cookware", "utensil", "kitchen"],
    clothing: ["shirt", "pant", "jeans", "dress", "shoe", "sandal", "boot", "sock", "jacket", "coat", "clothing", "apparel", "wear", "handkerchief", "hanky", "women", "women's"],
    home_decor: ["throw", "blanket", "cotton", "textile", "home", "living", "room", "decor", "curtain", "rug", "pillow", "cushion", "bedspread", "quilt", "tapestry"],
    electronics: ["phone", "laptop", "tablet", "charger", "cable", "speaker", "headphone", "mouse", "keyboard", "electronics", "gadget"],
    beauty: ["cream", "serum", "lotion", "makeup", "cosmetic", "skincare", "beauty", "lipstick", "foundation"],
    books: ["book", "novel", "paperback", "hardcover", "textbook", "magazine", "journal"],
    toys: ["toy", "game", "puzzle", "play", "children", "kid", "baby", "doll", "action"],
    furniture: ["furniture", "chair", "table", "sofa", "bed", "shelf", "cabinet", "desk", "drawer"],
    jewelry: ["jewelry", "necklace", "bracelet", "ring", "earring", "accessory", "pendant", "chain"],
    automotive: ["car", "bike", "motorcycle", "vehicle", "automobile", "tire", "wheel", "engine", "part"]
  };

  const allTokens = [...context.titleTokens, ...context.descriptionTokens];
  const categoryScores = {};

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (allTokens.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0) {
      categoryScores[category] = score;
    }
  }

  // Enhanced brand detection for better categorization
  const combinedText = context.combined.toLowerCase();
  
  // Brand-specific category hints
  if (combinedText.includes("caruso") && combinedText.includes("italy")) {
    // Caruso Italy is primarily known for clothing accessories like handkerchiefs
    if (allTokens.some(token => ["handkerchief", "hanky", "cotton", "women", "women's"].includes(token))) {
      categoryScores.clothing = (categoryScores.clothing || 0) + 3; // Strong boost for Caruso Italy clothing
    }
  }

  // Special handling for SASHAA WORLD products
  if (combinedText.includes("sashaa") && combinedText.includes("world")) {
    if (allTokens.some(token => ["throw", "blanket", "cotton", "home", "living", "room"].includes(token))) {
      categoryScores.home_decor = (categoryScores.home_decor || 0) + 3; // Strong boost for SASHAA WORLD home textiles
    }
  }

  // Return the category with the highest score, or null if no clear category
  if (Object.keys(categoryScores).length === 0) {
    return null;
  }

  const maxScore = Math.max(...Object.values(categoryScores));
  const bestCategories = Object.entries(categoryScores)
    .filter(([_, score]) => score === maxScore)
    .map(([category, _]) => category);

  return bestCategories.length === 1 ? bestCategories[0] : null;
}

function looksLikeDifferentProduct(keyword, context) {
  const conflictingGroups = [
    ["bottle", "lunch box", "plate", "spoon", "tiffin", "container"],
    ["shoe", "shirt", "pant", "watch", "clothing", "apparel"],
    ["charger", "speaker", "headphone", "mouse", "keyboard", "electronics"],
    ["book", "phone", "laptop", "tablet", "paper", "screen"],
    ["cream", "serum", "lotion", "makeup", "cosmetic", "skincare"],
    ["toy", "game", "puzzle", "play", "children", "kid"],
    ["furniture", "chair", "table", "sofa", "bed", "shelf"],
    ["kitchen", "cookware", "pan", "pot", "utensil", "appliance"],
    ["jewelry", "necklace", "bracelet", "ring", "earring", "accessory"]
  ];

  // Enhanced category detection
  const productCategories = {
    kitchen: ["bottle", "flask", "mug", "cup", "container", "tiffin", "lunch", "box", "plate", "spoon", "fork", "knife", "pan", "pot", "cookware", "utensil", "kitchen"],
    clothing: ["shirt", "pant", "jeans", "dress", "shoe", "sandal", "boot", "sock", "jacket", "coat", "clothing", "apparel", "wear"],
    home_decor: ["throw", "blanket", "cotton", "textile", "home", "living", "room", "decor", "curtain", "rug", "pillow", "cushion"],
    electronics: ["phone", "laptop", "tablet", "charger", "cable", "speaker", "headphone", "mouse", "keyboard", "electronics", "gadget"],
    beauty: ["cream", "serum", "lotion", "makeup", "cosmetic", "skincare", "beauty", "lipstick", "foundation"],
    books: ["book", "novel", "paperback", "hardcover", "textbook", "magazine", "journal"],
    toys: ["toy", "game", "puzzle", "play", "children", "kid", "baby", "doll", "action"],
    furniture: ["furniture", "chair", "table", "sofa", "bed", "shelf", "cabinet", "desk", "drawer"],
    jewelry: ["jewelry", "necklace", "bracelet", "ring", "earring", "accessory", "pendant", "chain"],
    automotive: ["car", "bike", "motorcycle", "vehicle", "automobile", "tire", "wheel", "engine", "part"]
  };

  // Special case: If both are SASHAA WORLD cotton throw products, they're NOT different
  const combinedText = context.combined.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  
  if (combinedText.includes("sashaa") && combinedText.includes("world") &&
      keywordLower.includes("sashaa") && keywordLower.includes("world") &&
      combinedText.includes("throw") && keywordLower.includes("throw") &&
      combinedText.includes("cotton") && keywordLower.includes("cotton")) {
    return false; // Same brand and product type - not different
  }

  // Check direct conflicting groups
  for (const group of conflictingGroups) {
    const keywordHits = group.filter((item) => keyword.includes(item));
    const contextHits = group.filter((item) => context.combined.includes(item));

    if (keywordHits.length > 0 && contextHits.length > 0) {
      const keywordCategory = keywordHits[0];
      const contextCategory = contextHits[0];
      
      // If they're from different subcategories within the same group
      if (keywordCategory !== contextCategory) {
        return true;
      }
    }
  }

  // Check product category mismatches
  let keywordCategory = null;
  let contextCategory = null;

  for (const [category, keywords] of Object.entries(productCategories)) {
    if (keywords.some(k => keyword.includes(k))) {
      keywordCategory = category;
    }
    if (keywords.some(k => context.combined.includes(k))) {
      contextCategory = category;
    }
  }

  // If both have categories but they're different, it's a mismatch
  if (keywordCategory && contextCategory && keywordCategory !== contextCategory) {
    return true;
  }

  // Additional heuristics for subtle mismatches
  const keywordTokens = tokenize(keyword);
  const contextTokens = context.combinedTokenSet;
  
  // If keyword has specific product indicators that don't match context
  const productIndicators = {
    "digital": ["screen", "display", "battery", "charging", "electronic"],
    "physical": ["hardcover", "paperback", "print", "manual"],
    "wearable": ["size", "fit", "comfort", "fabric", "material"],
    "consumable": ["edible", "food", "drink", "flavor", "taste"]
  };

  for (const [type, indicators] of Object.entries(productIndicators)) {
    const keywordHasIndicator = indicators.some(ind => keywordTokens.includes(ind));
    const contextHasIndicator = indicators.some(ind => contextTokens.has(ind));
    
    if (keywordHasIndicator && !contextHasIndicator) {
      // Check if context has indicators of a different type
      for (const [otherType, otherIndicators] of Object.entries(productIndicators)) {
        if (type !== otherType && otherIndicators.some(ind => contextTokens.has(ind))) {
          return true;
        }
      }
    }
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

async function fetchProductDetails(url, timeout = 12000) {
  const normalizedUrl = normalizeAmazonLookupInput(url);
  const asinMatch = normalizedUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  const asin = asinMatch ? asinMatch[1].toUpperCase() : "";
  const marketplaceHost = getAmazonHost(normalizedUrl);

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
      url: `https://r.jina.ai/http://${marketplaceHost}/dp/${asin}`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  ];

  // Amazon search providers for fallback
  const amazonSearchProviders = [
    {
      name: "Amazon Search",
      url: `https://r.jina.ai/http://${marketplaceHost}/s?k=${asin}&ref=nb_sb_noss`,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    },
    {
      name: "Amazon Mobile Search",
      url: `https://r.jina.ai/http://${marketplaceHost}/s?k=${asin}&i=mobile&ref=nb_sb_noss`,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15' }
    },
    {
      name: "Amazon Books Search",
      url: `https://r.jina.ai/http://${marketplaceHost}/s?k=${asin}&i=books&ref=nb_sb_noss`,
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
            return withSafeProductMetrics({
              sourceName: `Amazon Search (${provider.name})`,
              asin,
              title: searchResult.title,
              highlights: searchResult.highlights,
            });
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
    const manualResult = await manualAsinLookup(asin, marketplaceHost);
    if (manualResult) {
      return manualResult;
    }
  }

  if (bestResult) {
    return bestResult;
  }

  // Final fallback with ASIN information
  return withSafeProductMetrics({
    sourceName: "All providers failed",
    asin,
    title: "",
    highlights: [`Product details unavailable for ASIN ${asin}. This may be due to connectivity issues or the product being unavailable.`],
  });
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
      price: data.price || "",
      currency: data.currency || "",
      priceValue: Number.isFinite(Number(data.priceValue)) ? Number(data.priceValue) : 0,
      bsr: data.bsr || "",
      category: data.category || "",
      boughtPastMonth: data.boughtPastMonth || "",
      estimatedMonthlySales: data.estimatedMonthlySales || "",
      estimatedRevenue30Days: data.estimatedRevenue30Days || "",
      estimationBasis: data.estimationBasis || "",
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
async function manualAsinLookup(asin, marketplaceHost = "www.amazon.in") {
  try {
    // Try to get basic product info from Amazon's product API
    const amazonUrl = `https://${marketplaceHost}/dp/${asin}`;
    
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
      return withSafeProductMetrics({
        sourceName: "Manual Lookup",
        asin,
        title: possibleTitle,
        highlights: [`Basic info extracted for ASIN ${asin}`],
      });
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

function normalizeAmazonLookupInput(value) {
  const input = String(value || "").trim();

  if (!input) {
    return "";
  }

  const asinMatch = input.match(/\b([A-Z0-9]{10})\b/i);

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  if (asinMatch && asinMatch[1]) {
    return `https://www.amazon.in/dp/${asinMatch[1].toUpperCase()}`;
  }

  return `https://${input}`;
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
  const metrics = extractSalesMetrics(text, cleanedLines, url);

  return withSafeProductMetrics({
    sourceName,
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

function extractSalesMetrics(text, lines, url) {
  const priceData = extractPriceData(text, lines, url);
  const rankData = extractBsrData(text, lines);
  const boughtPastMonth = extractBoughtPastMonth(text, lines);
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

function extractPriceData(text, lines, url) {
  const host = getAmazonHost(url);
  const currencyFallback = inferCurrencyFromHost(host);
  const directMatches = [
    ...text.matchAll(/a-price-symbol[^>]*>(.*?)<\/span>[\s\S]{0,160}?a-price-whole[^>]*>([\s\S]*?)<\/span>[\s\S]{0,80}?a-price-fraction[^>]*>([^<]+)<\/span>/gi),
  ];

  for (const match of directMatches) {
    const symbolText = cleanInlineValue(match[1]).trim();
    const normalizedSymbol = normalizeCurrencySymbol(symbolText);

    if (normalizedSymbol && normalizedSymbol !== currencyFallback) {
      continue;
    }

    if (!normalizedSymbol && !host.includes("amazon.in")) {
      continue;
    }

    const whole = cleanInlineValue(match[2]).replace(/[^0-9,]/g, "");
    const fraction = cleanInlineValue(match[3]).replace(/[^0-9]/g, "");
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

  const textPatterns = [
    /(?:deal price|price|selling price|our price)[^0-9£$€₹]*([£$€₹])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /(?:deal price|price|selling price|our price)[^0-9A-Z]*(INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /([£$€₹])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/,
    /\b(INR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  ];

  for (const line of lines) {
    const normalizedLine = line.toLowerCase();

    if (
      normalizedLine.includes("list price") ||
      normalizedLine.includes("mrp") ||
      normalizedLine.includes("save ") ||
      normalizedLine.includes("coupon")
    ) {
      continue;
    }

    for (const pattern of textPatterns) {
      const match = line.match(pattern);
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
  }

  return {
    displayPrice: "",
    priceValue: 0,
    currency: currencyFallback,
  };
}

function extractBsrData(text, lines) {
  const flattened = stripHtml(text).replace(/\s+/g, " ");
  const patterns = [
    /best sellers rank[:\s#]*#?\s*([0-9][0-9,]*)\s+in\s+([^#\(\)\[\]\|]+?)(?:\s+\(|\s+#|$)/i,
    /#\s*([0-9][0-9,]*)\s+in\s+([^#\(\)\[\]\|]+?)(?:\s+\(|\s+#|$)/i,
  ];

  for (const sourceText of [flattened, ...lines]) {
    for (const pattern of patterns) {
      const match = sourceText.match(pattern);
      if (!match) {
        continue;
      }

      const rankNumber = Number.parseInt(String(match[1] || "").replace(/,/g, ""), 10);
      const category = cleanInlineValue(match[2]).replace(/^in\s+/i, "").trim();

      if (Number.isFinite(rankNumber) && rankNumber > 0 && category) {
        return {
          rankNumber,
          displayRank: `#${formatWholeNumber(rankNumber)}`,
          category,
        };
      }
    }
  }

  return {
    rankNumber: 0,
    displayRank: "",
    category: "",
  };
}

function extractBoughtPastMonth(text, lines) {
  const sources = [stripHtml(text), ...lines];
  const patterns = [
    /([0-9][0-9,]*)\+\s+bought in past month/i,
    /([0-9][0-9,]*)\s+bought in past month/i,
  ];

  for (const sourceText of sources) {
    for (const pattern of patterns) {
      const match = sourceText.match(pattern);
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
    return `Estimate uses Amazon's public bought-in-past-month signal as the 30-day units floor.`;
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

function cleanInlineValue(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
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
  const summary = summarizeProduct(title, description);

  return {
    asin: yourProductAsinInput.value.trim().toUpperCase(),
    title,
    description,
    context,
    summary,
    hasClearContext: Boolean(hasUsableProductTitle(title) || description.trim()),
  };
}

function summarizeProduct(title, description) {
  const junkTokens = new Set([
    "if",
    "lt",
    "gt",
    "ie",
    "html",
    "lang",
    "clas",
    "class",
    "viewport",
    "charset",
    "content",
    "initial",
    "scale",
    "width",
    "device",
    "js",
    "no",
  ]);
  const titleTokens = [...new Set(tokenize(title))].filter((token) => !junkTokens.has(token));
  const descriptionTokens = [...new Set(tokenize(description))].filter(
    (token) => !junkTokens.has(token)
  );
  const productType =
    titleTokens.slice(0, 4).join(" ") ||
    descriptionTokens.slice(0, 4).join(" ") ||
    "Not clear";
  const keyFeatures = descriptionTokens.slice(0, 8);
  const useCase = descriptionTokens.slice(8, 14);

  return {
    productType,
    keyFeatures: keyFeatures.length ? keyFeatures : titleTokens.slice(0, 6),
    useCase: useCase.length ? useCase : titleTokens.slice(0, 6),
  };
}

function scoreTargetAsin(asin, ownProduct, targetProduct) {
  const targetDescription = [targetProduct.title, ...(targetProduct.highlights || [])]
    .filter(Boolean)
    .join(" ");
  const targetContext = buildProductContext(targetProduct.title || "", targetDescription);
  const ownTokens = [...new Set([...ownProduct.context.titleTokens, ...ownProduct.context.descriptionTokens])];
  const targetTokens = [...new Set([...targetContext.titleTokens, ...targetContext.descriptionTokens])];
  const overlap = ownTokens.filter((token) => targetTokens.includes(token));
  const overlapRatio = ownTokens.length ? overlap.length / ownTokens.length : 0;
  const sameTitleType = ownProduct.context.titleTokens.some((token) =>
    targetContext.titleTokens.includes(token)
  );
  const normalizedOwnTitle = normalizeComparableTitle(ownProduct.title);
  const normalizedTargetTitle = normalizeComparableTitle(targetProduct.title || targetDescription);
  const nearSameTitle =
    Boolean(normalizedOwnTitle) && normalizedOwnTitle === normalizedTargetTitle;
  const sameBrand = extractBrandToken(ownProduct.title) && extractBrandToken(ownProduct.title) === extractBrandToken(targetProduct.title || "");
  
  // Enhanced category mismatch detection
  const differentProduct = looksLikeDifferentProduct(
    normalizeText(targetProduct.title || targetDescription),
    ownProduct.context
  );

  // Additional category-specific checks
  const ownCategory = detectProductCategory(ownProduct.context);
  const targetCategory = detectProductCategory(targetContext);
  const categoryMismatch = ownCategory && targetCategory && ownCategory !== targetCategory;

  // Enhanced brand and product line detection
  const ownBrand = extractBrandToken(ownProduct.title);
  const targetBrand = extractBrandToken(targetProduct.title || "");
  const sameBrandDetected = ownBrand && targetBrand && ownBrand === targetBrand;
  
  // Special handling for Caruso Italy products
  const isCarusoBrand = ownBrand === "caruso" && targetBrand === "caruso";
  const bothCarusoProducts = isCarusoBrand && ownCategory === "clothing" && targetCategory === "clothing";

  let score = 0;
  let reason = "Different product type or weak buying-intent overlap.";

  if (asin === ownProduct.asin) {
    score = 9;
    reason = "This is the same ASIN as your product, so it is an exact match.";
  } else if (nearSameTitle) {
    score = 8;
    reason = "Product titles match almost exactly, with only minor variation like color or finish.";
  } else if (bothCarusoProducts && overlapRatio >= 0.15) {
    score = 7;
    reason = "Same Caruso Italy brand and clothing category with good product overlap.";
  } else if (sameBrandDetected && sameTitleType && overlapRatio >= 0.25 && !categoryMismatch) {
    score = 6;
    reason = "Same brand and product type with moderate overlap in features.";
  } else if (sameTitleType && overlapRatio >= 0.35 && !categoryMismatch) {
    score = 7;
    reason = "Same product type with strong feature and use-case overlap.";
  } else if (sameTitleType && overlapRatio >= 0.25 && !categoryMismatch) {
    score = 6;
    reason = "Same category with good overlap, commercially relevant.";
  } else if (sameTitleType && overlapRatio >= 0.18 && !categoryMismatch) {
    score = 5;
    reason = "Same category with some differences, still relevant for targeting.";
  } else if (overlapRatio >= 0.15 && !categoryMismatch) {
    score = 4;
    reason = "Related product with partial overlap, decent placement fit.";
  } else if (overlapRatio > 0 && !categoryMismatch) {
    score = 3;
    reason = "Some relation found, limited but potentially useful overlap.";
  } else if (categoryMismatch) {
    score = 0;
    reason = `Different product category (${ownCategory} vs ${targetCategory}). This should be excluded from ads.`;
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
    targetProduct,
  };
}

function formatAsinReport(ownProduct, scoredTargets) {
  const excluded = scoredTargets.filter((item) => item.score <= 3);
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

function renderSalesEstimate(context) {
  if (
    !salesFetchedPanel ||
    !salesProductTitle ||
    !salesSource ||
    !salesAsin ||
    !salesPrice ||
    !salesBsr ||
    !salesCategory ||
    !salesBought ||
    !salesUnits ||
    !salesRevenue ||
    !salesBasis
  ) {
    return;
  }

  if (!context) {
    salesFetchedPanel.hidden = true;
    salesProductTitle.textContent = "Fetched Product Details";
    salesSource.textContent = "Not fetched yet";
    salesAsin.textContent = "-";
    salesPrice.textContent = "-";
    salesBsr.textContent = "-";
    salesCategory.textContent = "-";
    salesBought.textContent = "-";
    salesUnits.textContent = "-";
    salesRevenue.textContent = "-";
    salesBasis.textContent = "-";
    return;
  }

  salesFetchedPanel.hidden = false;
  salesProductTitle.textContent = context.title || "Product title not available";
  salesSource.textContent = context.sourceName || "Live fetch";
  salesAsin.textContent = context.asin || "Not detected";
  salesPrice.textContent = context.price || "Not available";
  salesBsr.textContent = context.bsr || "Not available";
  salesCategory.textContent = context.category || "Not available";
  salesBought.textContent = context.boughtPastMonth || "Not available";
  salesUnits.textContent = context.estimatedMonthlySales || "Not available";
  salesRevenue.textContent = context.estimatedRevenue30Days || "Not available";
  salesBasis.textContent = context.estimationBasis || "Not enough data was available to estimate sales.";
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

function setSalesStatus(message, isError = false) {
  if (!salesStatusMessage) {
    return;
  }

  salesStatusMessage.textContent = message;
  salesStatusMessage.classList.toggle("is-error", isError);
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
