const scrapForm = document.querySelector("#scrap-form");
const scrapMarketplaceSelect = document.querySelector("#scrap-marketplace");
const scrapMarketplaceBase = document.querySelector("#scrap-marketplace-base");
const scrapMarketplaceTemplate = document.querySelector("#scrap-marketplace-template");
const scrapAsinsInput = document.querySelector("#scrap-asins");
const scrapStatusMessage = document.querySelector("#scrap-status-message");
const scrapResultsBody = document.querySelector("#scrap-results-body");
const scrapSummaryCards = document.querySelector("#scrap-summary-cards");
const scrapCardGrid = document.querySelector("#scrap-card-grid");
const scrapExportOutput = document.querySelector("#scrap-export-output");
const loadScrapSampleButton = document.querySelector("#load-scrap-sample");
const resetScrapFormButton = document.querySelector("#reset-scrap-form");
const copyScrapCsvButton = document.querySelector("#copy-scrap-csv");
const downloadScrapCsvButton = document.querySelector("#download-scrap-csv");

const SCRAP_SAMPLE_ASINS = [
  "B086PV1KWJ",
  "B0DRPC49DP",
  "B0FT3SGTM7",
].join("\n");

const SCRAP_CONCURRENCY = 3;
const SCRAP_RETRY_LIMIT = 3;
const SCRAP_MARKETPLACE_MAP = {
  IN: "https://www.amazon.in/dp/",
  US: "https://www.amazon.com/dp/",
  CA: "https://www.amazon.ca/dp/",
  AU: "https://www.amazon.com.au/dp/",
  UK: "https://www.amazon.co.uk/dp/",
  DE: "https://www.amazon.de/dp/",
  FR: "https://www.amazon.fr/dp/",
  IT: "https://www.amazon.it/dp/",
  ES: "https://www.amazon.es/dp/",
  PL: "https://www.amazon.pl/dp/",
};
const SCRAP_HOST_TO_MARKETPLACE = Object.entries(SCRAP_MARKETPLACE_MAP).reduce(
  (map, [code, baseUrl]) => {
    map[new URL(baseUrl).host] = code;
    return map;
  },
  {}
);
const SCRAP_DEFAULT_MARKETPLACE = "IN";

let currentScrapResults = [];

initializeScrapPage();

function initializeScrapPage() {
  if (!scrapForm || !scrapAsinsInput) {
    return;
  }

  scrapForm.addEventListener("submit", handleScrapSubmit);
  updateScrapMarketplaceDisplay();

  scrapMarketplaceSelect?.addEventListener("change", () => {
    updateScrapMarketplaceDisplay();
  });

  loadScrapSampleButton?.addEventListener("click", () => {
    scrapAsinsInput.value = SCRAP_SAMPLE_ASINS;
    if (scrapMarketplaceSelect) {
      scrapMarketplaceSelect.value = SCRAP_DEFAULT_MARKETPLACE;
      updateScrapMarketplaceDisplay();
    }
    setScrapStatus("Sample ASINs loaded.");
  });

  resetScrapFormButton?.addEventListener("click", () => {
    scrapForm.reset();
    if (scrapMarketplaceSelect) {
      scrapMarketplaceSelect.value = SCRAP_DEFAULT_MARKETPLACE;
      updateScrapMarketplaceDisplay();
    }
    currentScrapResults = [];
    renderScrapEmptyState();
    setScrapStatus("Product detail scraper cleared.");
  });

  copyScrapCsvButton?.addEventListener("click", async () => {
    if (!scrapExportOutput.value.trim()) {
      setScrapStatus("Nothing to copy yet.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(scrapExportOutput.value);
      setScrapStatus("CSV copied.");
    } catch (error) {
      setScrapStatus("Copy failed in this browser. You can still copy from the preview box.", true);
    }
  });

  downloadScrapCsvButton?.addEventListener("click", () => {
    if (!currentScrapResults.length) {
      setScrapStatus("Nothing to download yet.", true);
      return;
    }

    const csv = buildScrapCsv(currentScrapResults);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "product-details-scrap.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setScrapStatus("CSV downloaded.");
  });

  renderScrapEmptyState();
}

async function handleScrapSubmit(event) {
  event.preventDefault();

  const marketplace = normalizeScrapMarketplace(scrapMarketplaceSelect?.value);
  const parsedInputs = parseScrapInputs(scrapAsinsInput.value, marketplace);

  if (!parsedInputs.length) {
    currentScrapResults = [];
    renderScrapEmptyState();
    setScrapStatus("Add at least one valid ASIN or Amazon URL.", true);
    return;
  }

  currentScrapResults = parsedInputs.map((item) => ({
    asin: item.asin,
    input: item.input,
    marketplace: item.marketplace,
    url: item.url,
    status: item.valid ? "queued" : "failed",
    sourceName: "",
    title: "",
    sellingPrice: "",
    mrp: "",
    discountPercent: "",
    numberOfReviews: "",
    rating: "",
    availabilityStatus: "",
    buyBoxAvailable: false,
    buyBoxWinner: "",
    dealStatus: "",
    errorMessage: item.valid ? "" : "Invalid ASIN or Amazon URL.",
  }));

  renderScrapResults(currentScrapResults);
  setScrapStatus(`Queued ${parsedInputs.length} item${parsedInputs.length === 1 ? "" : "s"} for scraping.`);

  await runScrapQueue();
}

async function runScrapQueue() {
  let cursor = 0;

  async function worker() {
    while (cursor < currentScrapResults.length) {
      const index = cursor;
      cursor += 1;

      const item = currentScrapResults[index];
      if (item.status === "failed") {
        renderScrapResults(currentScrapResults);
        continue;
      }

      updateScrapItem(index, { status: "fetching", errorMessage: "" });

      const result = await fetchScrapItem(item);
      updateScrapItem(index, result);
    }
  }

  const workerCount = Math.min(SCRAP_CONCURRENCY, Math.max(1, currentScrapResults.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const successCount = currentScrapResults.filter((item) => item.status === "success").length;
  const failedCount = currentScrapResults.filter((item) => item.status === "failed").length;
  setScrapStatus(`Finished. ${successCount} success, ${failedCount} failed.`);
}

async function fetchScrapItem(item) {
  for (let attempt = 1; attempt <= SCRAP_RETRY_LIMIT; attempt += 1) {
    try {
      const params = new URLSearchParams();
      params.set("asin", item.asin);
      params.set("marketplace", item.marketplace || SCRAP_DEFAULT_MARKETPLACE);
      const response = await fetch(`/api/scrape-product?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await safeJson(response);
        const detail = errorData?.details || errorData?.error || `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const data = await response.json();
      return {
        asin: item.asin,
        input: item.input,
        url: data.url || item.url,
        status: "success",
        sourceName: data.sourceName || "Scrape API",
        title: data.title || "",
        sellingPrice: data.sellingPrice || "",
        mrp: data.mrp || "",
        discountPercent: data.discountPercent || "",
        numberOfReviews: data.numberOfReviews || "",
        rating: data.rating || "",
        availabilityStatus: data.availabilityStatus || "",
        buyBoxAvailable: Boolean(data.buyBoxAvailable),
        buyBoxWinner: data.buyBoxWinner || "",
        dealStatus: data.dealStatus || "",
        errorMessage: "",
      };
    } catch (error) {
      if (attempt < SCRAP_RETRY_LIMIT) {
        await delay(350 * attempt);
      } else {
        return {
          ...item,
          status: "failed",
          errorMessage: classifyScrapError(error),
        };
      }
    }
  }

  return {
    ...item,
    status: "failed",
    errorMessage: "Data could not be fetched.",
  };
}

function parseScrapInputs(input, selectedMarketplace = SCRAP_DEFAULT_MARKETPLACE) {
  const lines = input
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set();

  return lines
    .map((value) => {
      const asin = extractAsinFromInput(value);
      const valid = /^[A-Z0-9]{10}$/.test(asin);
      const marketplace =
        inferScrapMarketplace(value) || normalizeScrapMarketplace(selectedMarketplace);

      return {
        input: value,
        asin,
        valid,
        marketplace,
        url: valid ? buildScrapProductUrl(asin, marketplace) : "",
      };
    })
    .filter((item) => {
      if (!item.asin) {
        return true;
      }

      if (seen.has(item.asin)) {
        return false;
      }

      seen.add(item.asin);
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

  const urlMatch = cleaned.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  if (urlMatch?.[1]) {
    return urlMatch[1].toUpperCase();
  }

  const fallbackMatch = cleaned.match(/\b([A-Z0-9]{10})\b/i);
  return fallbackMatch?.[1]?.toUpperCase() || "";
}

function normalizeScrapMarketplace(value) {
  const code = String(value || "").trim().toUpperCase();
  return SCRAP_MARKETPLACE_MAP[code] ? code : SCRAP_DEFAULT_MARKETPLACE;
}

function getScrapMarketplaceBaseUrl(value) {
  return SCRAP_MARKETPLACE_MAP[normalizeScrapMarketplace(value)];
}

function buildScrapProductUrl(asin, marketplace) {
  const normalizedAsin = extractAsinFromInput(asin);
  return normalizedAsin ? `${getScrapMarketplaceBaseUrl(marketplace)}${normalizedAsin}` : "";
}

function inferScrapMarketplace(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue || !/amazon\./i.test(rawValue)) {
    return "";
  }

  try {
    const normalized = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;
    const hostname = new URL(normalized).hostname.toLowerCase();
    return SCRAP_HOST_TO_MARKETPLACE[hostname] || "";
  } catch (error) {
    return "";
  }
}

function updateScrapMarketplaceDisplay() {
  const baseUrl = getScrapMarketplaceBaseUrl(scrapMarketplaceSelect?.value);

  if (scrapMarketplaceBase) {
    scrapMarketplaceBase.textContent = baseUrl;
  }

  if (scrapMarketplaceTemplate) {
    scrapMarketplaceTemplate.textContent = `${baseUrl}{ASIN}`;
  }
}

function updateScrapItem(index, next) {
  currentScrapResults[index] = {
    ...currentScrapResults[index],
    ...next,
  };
  renderScrapResults(currentScrapResults);
}

function renderScrapResults(rows) {
  if (!rows.length) {
    renderScrapEmptyState();
    return;
  }

  scrapResultsBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.asin || "Invalid")}</td>
          <td><span class="scrap-status-badge scrap-status-${escapeHtml(row.status)}">${escapeHtml(capitalize(row.status))}</span></td>
          <td>${escapeHtml(row.title || row.errorMessage || "Waiting for data")}</td>
          <td>${escapeHtml(row.sellingPrice || "-")}</td>
          <td>${escapeHtml(row.mrp || "-")}</td>
          <td>${escapeHtml(row.discountPercent || "-")}</td>
          <td>${escapeHtml(row.rating || "-")}</td>
          <td>${escapeHtml(row.numberOfReviews || "-")}</td>
          <td>${escapeHtml(getBuyBoxDisplayValue(row))}</td>
          <td>${escapeHtml(row.dealStatus || "No active deal detected")}</td>
        </tr>
      `
    )
    .join("");

  scrapSummaryCards.innerHTML = buildScrapSummaryCards(rows)
    .map(
      (card) => `
        <article class="summary-card">
          <strong>${card.value}</strong>
          <span>${card.label}</span>
        </article>
      `
    )
    .join("");

  scrapCardGrid.innerHTML = rows
    .map(
      (row) => `
        <article class="panel scrap-card">
          <div class="scrap-card-header">
            <div>
              <p class="eyebrow">${escapeHtml(row.asin || "Invalid ASIN")}</p>
              <h2>${escapeHtml(row.title || "Title not available")}</h2>
            </div>
            <span class="scrap-status-badge scrap-status-${escapeHtml(row.status)}">${escapeHtml(capitalize(row.status))}</span>
          </div>
          <div class="scrap-meta-grid">
            <article><strong>Source</strong><span>${escapeHtml(row.sourceName || "-")}</span></article>
            <article><strong>Selling Price</strong><span>${escapeHtml(row.sellingPrice || "-")}</span></article>
            <article><strong>MRP</strong><span>${escapeHtml(row.mrp || "-")}</span></article>
            <article><strong>Discount</strong><span>${escapeHtml(row.discountPercent || "-")}</span></article>
            <article><strong>Rating</strong><span>${escapeHtml(row.rating || "-")}</span></article>
            <article><strong>Reviews</strong><span>${escapeHtml(row.numberOfReviews || "-")}</span></article>
          </div>
          <div class="scrap-section">
            <strong>Product URL</strong>
            <p>${row.url ? `<a href="${escapeHtml(row.url)}" target="_blank" rel="noreferrer">${escapeHtml(row.url)}</a>` : "-"}</p>
          </div>
          <div class="scrap-section">
            <strong>Buy Box Winner</strong>
            <p>${escapeHtml(getBuyBoxDisplayValue(row))}</p>
          </div>
          <div class="scrap-section">
            <strong>Availability</strong>
            <p>${escapeHtml(row.availabilityStatus || "Availability not clear")}</p>
          </div>
          <div class="scrap-section">
            <strong>Deal Detection</strong>
            <p>${escapeHtml(row.dealStatus || "No active deal detected")}</p>
          </div>
        </article>
      `
    )
    .join("");

  scrapExportOutput.value = buildScrapCsv(rows);
}

function renderScrapEmptyState() {
  scrapResultsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="10">Add ASINs and click <strong>Fetch Product Details</strong>.</td>
    </tr>
  `;
  scrapSummaryCards.innerHTML = "";
  scrapCardGrid.innerHTML = `
    <article class="scrap-empty-card">
      Product cards with selling price, MRP, discount, reviews, rating, Buy Box winner, and deal status will appear here.
    </article>
  `;
  scrapExportOutput.value = "";
}

function buildScrapSummaryCards(rows) {
  const queued = rows.filter((row) => row.status === "queued").length;
  const fetching = rows.filter((row) => row.status === "fetching").length;
  const success = rows.filter((row) => row.status === "success").length;
  const failed = rows.filter((row) => row.status === "failed").length;

  return [
    { value: String(rows.length), label: "Total ASINs" },
    { value: String(success), label: "Success" },
    { value: String(failed), label: "Failed" },
    { value: String(queued + fetching), label: "In Queue / Fetching" },
  ];
}

function buildScrapCsv(rows) {
  const header = [
    "ASIN",
    "Status",
    "Source",
    "Product URL",
    "Product Title",
    "Selling Price",
    "MRP",
    "Discount %",
    "Number of Reviews",
    "Rating",
    "Buy Box Winner",
    "Availability Status",
    "Deal Status",
    "Error Message",
  ];

  const lines = [
    header,
    ...rows.map((row) => [
      row.asin,
      row.status,
      row.sourceName,
      row.url,
      row.title,
      row.sellingPrice,
      row.mrp,
      row.discountPercent,
      row.numberOfReviews,
      row.rating,
      getBuyBoxDisplayValue(row),
      row.availabilityStatus || "",
      row.dealStatus || "No active deal detected",
      row.errorMessage,
    ]),
  ];

  return lines.map((line) => line.map(escapeCsv).join(",")).join("\n");
}

function classifyScrapError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  if (message.includes("blocked") || message.includes("challenge") || message.includes("captcha")) {
    return "Blocked page detected. Retry later.";
  }

  if (message.includes("invalid")) {
    return "Invalid ASIN or unsupported URL.";
  }

  if (message.includes("timeout")) {
    return "Request timed out while fetching data.";
  }

  return "Product data not available for this ASIN right now.";
}

function setScrapStatus(message, isError = false) {
  if (!scrapStatusMessage) {
    return;
  }

  scrapStatusMessage.textContent = message;
  scrapStatusMessage.classList.toggle("is-error", isError);
}

function safeJson(response) {
  return response
    .json()
    .catch(() => null);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeCsv(value) {
  const safe = String(value ?? "");
  return `"${safe.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBuyBoxDisplayValue(row) {
  if (row.buyBoxWinner) {
    return row.buyBoxWinner;
  }

  if (row.buyBoxAvailable) {
    return "Seller visible but not extracted";
  }

  if (/out of stock|currently unavailable|temporarily out of stock|unavailable/i.test(String(row.availabilityStatus || ""))) {
    return "Buy Box not available";
  }

  return "Buy Box not available";
}
