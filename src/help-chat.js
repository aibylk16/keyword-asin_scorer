(function initializeHelpChat() {
  const pageContext = detectPageContext();
  const widget = buildWidget(pageContext);
  document.body.appendChild(widget.shell);

  const state = {
    open: false,
    errorHint: "",
  };

  const quickActions = buildQuickActions(pageContext);
  renderQuickActions(quickActions);
  addAssistantMessage(
    `Hi, I’m your tool helper. ${pageContext.intro} Ask me about setup, scrape errors, marketplaces, Buy Box, ACoS, or exports.`
  );

  widget.bubble.addEventListener("click", toggleWidget);
  widget.minimizeButton.addEventListener("click", closeWidget);
  widget.quickActions.addEventListener("click", handleQuickActionClick);
  widget.form.addEventListener("submit", handleSubmit);
  widget.suggestionButton.addEventListener("click", () => {
    openWidget();
    handleQuestion(widget.suggestionButton.dataset.question || "How to use this page?");
  });

  watchStatusMessages();

  function detectPageContext() {
    const path = window.location.pathname.toLowerCase();

    if (path.includes("/product-details-scrap")) {
      return {
        key: "scrap",
        label: "Product Details Scrap",
        intro:
          "You’re on Product Details Scrap. I can help with ASIN input, marketplace selection, Buy Box, and deal detection.",
      };
    }

    if (path.includes("/asin")) {
      return {
        key: "asin",
        label: "ASIN Targeting Scoring",
        intro:
          "You’re on ASIN Targeting Scoring. I can guide you through your product ASIN, target ASINs, and relevancy results.",
      };
    }

    if (path.includes("/keyword")) {
      return {
        key: "keyword",
        label: "Keyword Relevancy Scoring",
        intro:
          "You’re on Keyword Relevancy Scoring. I can help with marketplace selection, product details, and keyword scoring workflow.",
      };
    }

    return {
      key: "home",
      label: "Home",
      intro:
        "You’re on the home page. I can tell you which tool to open and how each workflow works.",
    };
  }

  function buildWidget(context) {
    const shell = document.createElement("div");
    shell.className = "help-chat";
    shell.innerHTML = `
      <button class="help-chat-suggestion" type="button" hidden>Need help?</button>
      <section class="help-chat-panel" hidden>
        <header class="help-chat-header">
          <div>
            <p class="help-chat-eyebrow">AI Assistant</p>
            <h2>${escapeHtml(context.label)}</h2>
          </div>
          <button class="help-chat-minimize" type="button" aria-label="Minimize help chat">-</button>
        </header>
        <div class="help-chat-messages" aria-live="polite"></div>
        <div class="help-chat-quick-actions"></div>
        <form class="help-chat-form">
          <input
            class="help-chat-input"
            type="text"
            name="helpQuestion"
            placeholder="Ask about ASINs, errors, Buy Box, ACoS..."
            autocomplete="off"
          />
          <button class="button button-primary help-chat-send" type="submit">Send</button>
        </form>
      </section>
      <button class="help-chat-bubble" type="button" aria-label="Open AI help chat">
        <span class="help-chat-bubble-icon">?</span>
        <span>AI Help</span>
      </button>
    `;

    return {
      shell,
      bubble: shell.querySelector(".help-chat-bubble"),
      panel: shell.querySelector(".help-chat-panel"),
      minimizeButton: shell.querySelector(".help-chat-minimize"),
      messages: shell.querySelector(".help-chat-messages"),
      quickActions: shell.querySelector(".help-chat-quick-actions"),
      form: shell.querySelector(".help-chat-form"),
      input: shell.querySelector(".help-chat-input"),
      suggestionButton: shell.querySelector(".help-chat-suggestion"),
    };
  }

  function buildQuickActions(context) {
    const common = [
      "How to use this page?",
      "Supported marketplaces",
      "Common errors",
      "Export data help",
    ];

    if (context.key === "scrap") {
      return [
        "Paste ASIN here",
        "Select marketplace first",
        "Why is my ASIN not working?",
        "What is Buy Box?",
        ...common,
      ];
    }

    if (context.key === "asin") {
      return [
        "How to use this page?",
        "Why is my ASIN not working?",
        "What is Buy Box?",
        "Supported marketplaces",
        "Common errors",
      ];
    }

    if (context.key === "keyword") {
      return [
        "How to use this page?",
        "Select marketplace first",
        "Why is my ASIN not working?",
        "Export data help",
        "Common errors",
      ];
    }

    return ["Which tool should I use?", "How to use this page?", "Supported marketplaces"];
  }

  function renderQuickActions(actions) {
    widget.quickActions.innerHTML = actions
      .map(
        (action) =>
          `<button class="help-chat-chip" type="button" data-question="${escapeHtml(action)}">${escapeHtml(action)}</button>`
      )
      .join("");
  }

  function handleQuickActionClick(event) {
    const button = event.target.closest("[data-question]");
    if (!button) {
      return;
    }

    const question = button.dataset.question || "";
    openWidget();
    handleQuestion(question);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const question = widget.input.value.trim();

    if (!question) {
      return;
    }

    handleQuestion(question);
    widget.input.value = "";
  }

  function handleQuestion(question) {
    addUserMessage(question);
    const answer = answerQuestion(question, pageContext, state.errorHint);
    addAssistantMessage(answer);
  }

  function answerQuestion(question, context, errorHint) {
    const normalized = question.toLowerCase().trim();

    if (normalized.includes("which tool")) {
      return "Use Keyword Relevancy Scoring for search terms, ASIN Targeting Scoring for target ASIN relevance, and Product Details Scrap for product data like title, price, Buy Box, and deal status.";
    }

    if (normalized.includes("how to use") || normalized.includes("step by step")) {
      return getHowToUseAnswer(context);
    }

    if (normalized.includes("paste asin") || normalized.includes("where do i paste")) {
      return getPasteAsinAnswer(context);
    }

    if (normalized.includes("marketplace")) {
      return "Select the marketplace first, then paste your ASIN or Amazon URL. Supported marketplaces are IN, US, CA, AU, UK, DE, FR, IT, ES, and PL.";
    }

    if (
      normalized.includes("asin not working") ||
      normalized.includes("not fetching") ||
      normalized.includes("not loading") ||
      normalized.includes("failed") ||
      normalized.includes("error")
    ) {
      return getErrorHelpAnswer(context, errorHint);
    }

    if (normalized.includes("buy box")) {
      return "Buy Box is the main seller Amazon shows near Buy Now or Add to Cart. If Seller A owns the Buy Box, most shoppers will buy from Seller A even if other sellers are listed.";
    }

    if (normalized.includes("deal") || normalized.includes("discount") || normalized.includes("offer")) {
      return "Deal detection looks for active offers like Limited Time Deal, Lightning Deal, coupon text, save amounts, or percent-off discounts. If nothing clear is found, the tool shows No active deal detected.";
    }

    if (normalized.includes("acos")) {
      return "ACoS means Advertising Cost of Sales. Formula: ad spend divided by ad sales, then multiplied by 100. Example: spend 200 and sales 1000 gives 20% ACoS.";
    }

    if (normalized.includes("export") || normalized.includes("csv") || normalized.includes("download")) {
      return "Use Copy or Download CSV on the results panel. If the export is empty, run the tool first so the table can generate fresh output.";
    }

    if (normalized.includes("scrape result") || normalized.includes("status")) {
      return "Status usually means: Queued = waiting, Fetching = processing now, Success = data extracted, Failed = scrape could not complete. Failed items often need a retry, correct marketplace, or a clearer ASIN.";
    }

    if (normalized.includes("supported marketplace")) {
      return "Supported marketplaces: IN, US, CA, AU, UK, DE, FR, IT, ES, and PL.";
    }

    if (normalized.includes("common errors")) {
      return getErrorHelpAnswer(context, errorHint);
    }

    return "I can help with this tool, Amazon ASIN input, scraping issues, Buy Box, deals, ACoS, marketplaces, and exports. Ask me in that area and I’ll keep it short and practical.";
  }

  function getHowToUseAnswer(context) {
    if (context.key === "scrap") {
      return "1. Select marketplace. 2. Paste one or many ASINs or Amazon URLs. 3. Click Fetch Product Details. 4. Review title, price, rating, reviews, Buy Box, and deal status. 5. Use Copy CSV or Download CSV if needed.";
    }

    if (context.key === "asin") {
      return "1. Select marketplace. 2. Paste your product ASIN or URL. 3. Add your title and description if needed. 4. Paste target ASINs. 5. Click Score Target ASINs and review relevant vs irrelevant results.";
    }

    if (context.key === "keyword") {
      return "1. Select marketplace. 2. Paste your product ASIN or URL. 3. Fetch or fill title and description. 4. Paste keywords. 5. Click Score Keywords and copy or download the final table.";
    }

    return "Choose the workflow you need first. Keyword tool is for search terms, ASIN tool is for ASIN targeting relevance, and Product Details Scrap is for raw product intelligence.";
  }

  function getPasteAsinAnswer(context) {
    if (context.key === "scrap") {
      return "Paste ASINs in the large ASIN / Amazon URL Input box. One per line is best. Plain ASINs are fine, and the selected marketplace will build the correct Amazon URL automatically.";
    }

    if (context.key === "asin") {
      return "Paste your own product ASIN in Your Product ASIN, then paste competitor or target ASINs in Target ASIN List. One per line is easiest to review.";
    }

    if (context.key === "keyword") {
      return "Paste your product ASIN or Amazon URL in Product URL / ASIN, then fetch details or fill them manually before scoring keywords.";
    }

    return "Open one of the tools first, then paste the ASIN in the main input box for that workflow.";
  }

  function getErrorHelpAnswer(context, errorHint) {
    const extra = errorHint ? ` Current page hint: ${errorHint}` : "";

    if (context.key === "scrap") {
      return `Possible reasons: wrong marketplace, invalid ASIN, temporary Amazon block, product page challenge, or missing public data. Try changing marketplace first, confirm the ASIN is 10 characters, then retry.${extra}`;
    }

    if (context.key === "asin") {
      return `Possible reasons: marketplace mismatch, fetch block, invalid ASIN, or incomplete product context. Try selecting the correct marketplace, fetching your base product first, then retrying the target ASINs.${extra}`;
    }

    if (context.key === "keyword") {
      return `Possible reasons: wrong marketplace, invalid ASIN/URL, or missing product details. Try the correct marketplace, fetch the product again, or paste title and description manually.${extra}`;
    }

    return `Common reasons: wrong ASIN, wrong marketplace, or temporary fetch block. Open the right tool, check the input, and retry.${extra}`;
  }

  function addUserMessage(message) {
    widget.messages.insertAdjacentHTML(
      "beforeend",
      `<article class="help-chat-message help-chat-message-user"><p>${escapeHtml(message)}</p></article>`
    );
    scrollMessagesToBottom();
  }

  function addAssistantMessage(message) {
    widget.messages.insertAdjacentHTML(
      "beforeend",
      `<article class="help-chat-message help-chat-message-assistant"><p>${escapeHtml(message)}</p></article>`
    );
    scrollMessagesToBottom();
  }

  function scrollMessagesToBottom() {
    widget.messages.scrollTop = widget.messages.scrollHeight;
  }

  function toggleWidget() {
    if (state.open) {
      closeWidget();
      return;
    }

    openWidget();
  }

  function openWidget() {
    state.open = true;
    widget.panel.hidden = false;
    widget.shell.classList.add("is-open");
    widget.suggestionButton.hidden = true;
    widget.input.focus();
  }

  function closeWidget() {
    state.open = false;
    widget.panel.hidden = true;
    widget.shell.classList.remove("is-open");
    if (state.errorHint) {
      widget.suggestionButton.hidden = false;
    }
  }

  function watchStatusMessages() {
    const statusTargets = [
      document.querySelector("#status-message"),
      document.querySelector("#asin-status-message"),
      document.querySelector("#scrap-status-message"),
    ].filter(Boolean);

    statusTargets.forEach((target) => {
      const observer = new MutationObserver(() => {
        updateSuggestionFromStatus(target);
      });

      observer.observe(target, {
        characterData: true,
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });

      updateSuggestionFromStatus(target);
    });
  }

  function updateSuggestionFromStatus(target) {
    const text = target.textContent.trim();
    const hasErrorClass = target.classList.contains("is-error");
    const looksBad = hasErrorClass || /fail|error|blocked|invalid|not available|not working|timeout/i.test(text);

    if (!looksBad || !text) {
      if (!state.open) {
        widget.suggestionButton.hidden = true;
      }
      state.errorHint = "";
      return;
    }

    state.errorHint = text;
    widget.suggestionButton.textContent = "Looks like something failed. Need help?";
    widget.suggestionButton.dataset.question = "Why is my ASIN not working?";

    if (!state.open) {
      widget.suggestionButton.hidden = false;
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
