/**
 * Broker — Client-side application
 *
 * Responsibilities:
 *  • Email-based login via localStorage
 *  • Socket.IO connection for real-time price streaming
 *  • Per-user stock subscription management
 *  • Dynamic stock card rendering with price-movement indicators
 *  • 60-second rolling sparkline chart per stock card
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Full list of available tickers (must match the server list) */
const AVAILABLE_STOCKS = [
  { symbol: "GOOG", name: "Alphabet Inc." },
  { symbol: "TSLA", name: "Tesla, Inc." },
  { symbol: "AMZN", name: "Amazon.com, Inc." },
  { symbol: "META", name: "Meta Platforms" },
  { symbol: "NVDA", name: "NVIDIA Corp." },
];

/** Pastel accent colour assigned to each ticker card */
const STOCK_COLORS = {
  GOOG: "var(--sky)",
  TSLA: "var(--rose)",
  AMZN: "var(--peach)",
  META: "var(--lavender)",
  NVDA: "var(--mint)",
};

/** How many price samples to keep in the sparkline buffer (1 per second) */
const SPARKLINE_MAX = 60;

const LS_KEY = "broker_email";

// ─── State ────────────────────────────────────────────────────────────────────

let socket = null;
let subscribedSymbols = new Set();

/**
 * Rolling price history per symbol — at most SPARKLINE_MAX entries.
 * Populated on every "price-update" event from the server.
 * @type {Record<string, number[]>}
 */
const priceHistory = {};

// ─── DOM References ───────────────────────────────────────────────────────────

const loginScreen     = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginForm       = document.getElementById("login-form");
const emailInput      = document.getElementById("email-input");
const logoutBtn       = document.getElementById("logout-btn");
const userEmailPill   = document.getElementById("user-email-pill");
const welcomeName     = document.getElementById("welcome-name");
const stockChecklist  = document.getElementById("stock-checklist");
const subscribeBtn    = document.getElementById("subscribe-btn");
const subscribeHint   = document.getElementById("subscribe-hint");
const liveSection     = document.getElementById("live-section");
const stockGrid       = document.getElementById("stock-grid");
const statusDot       = document.getElementById("status-dot");
const statusText      = document.getElementById("status-text");

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function formatPrice(price) {
  return "$" + price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(pct) {
  const sign = pct >= 0 ? "+" : "";
  return sign + pct.toFixed(2) + "%";
}

function flashCard(symbol, direction) {
  const card = document.getElementById("card-" + symbol);
  if (!card) return;
  card.classList.remove("flash-up", "flash-down");
  void card.offsetWidth;
  if (direction === "up")   card.classList.add("flash-up");
  if (direction === "down") card.classList.add("flash-down");
}

// ─── Login / Auth ─────────────────────────────────────────────────────────────

function getStoredEmail() { return localStorage.getItem(LS_KEY) || ""; }
function setStoredEmail(email) { localStorage.setItem(LS_KEY, email); }
function clearStoredEmail() { localStorage.removeItem(LS_KEY); }

function showDashboard(email) {
  userEmailPill.textContent = email;
  welcomeName.textContent   = email.split("@")[0];
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  renderChecklist();
  connectSocket();
}

function showLogin() {
  dashboardScreen.classList.add("hidden");
  loginScreen.classList.remove("hidden");
  if (socket) { socket.disconnect(); socket = null; }
  subscribedSymbols.clear();
  stockGrid.innerHTML = "";
  liveSection.classList.add("hidden");
  setConnectionStatus("disconnected");
}

// ─── Checklist Rendering ──────────────────────────────────────────────────────

function renderChecklist() {
  stockChecklist.innerHTML = "";
  for (const { symbol, name } of AVAILABLE_STOCKS) {
    const item = document.createElement("label");
    item.className = "check-item";
    item.dataset.symbol = symbol;

    item.innerHTML = `
      <input type="checkbox" value="${symbol}" />
      <span class="check-box"></span>
      <span>
        <span class="check-symbol">${symbol}</span>
        <br/>
        <span class="check-name">${name}</span>
      </span>
    `;

    item.addEventListener("click", () => toggleCheckItem(item));
    stockChecklist.appendChild(item);
  }
  updateSubscribeHint();
}

function toggleCheckItem(item) {
  const cb = item.querySelector("input[type='checkbox']");
  cb.checked = !cb.checked;
  item.classList.toggle("selected", cb.checked);
  updateSubscribeHint();
}

function getCheckedSymbols() {
  return Array.from(stockChecklist.querySelectorAll("input:checked")).map(cb => cb.value);
}

function updateSubscribeHint() {
  const count = getCheckedSymbols().length;
  if (count === 0) {
    subscribeHint.textContent = "Select at least one stock above.";
  } else {
    subscribeHint.textContent = count === 1 ? "1 stock selected" : count + " stocks selected";
  }
}

// ─── Socket.IO Connection ─────────────────────────────────────────────────────

function connectSocket() {
  socket = io();

  socket.on("connect", () => {
    setConnectionStatus("connected");
    if (subscribedSymbols.size > 0) {
      socket.emit("subscribe", Array.from(subscribedSymbols));
    }
  });

  socket.on("disconnect", () => setConnectionStatus("disconnected"));

  socket.on("price-update", ({ symbol, price, changePct, direction }) => {
    if (!priceHistory[symbol]) priceHistory[symbol] = [];
    priceHistory[symbol].push(price);
    if (priceHistory[symbol].length > SPARKLINE_MAX) {
      priceHistory[symbol].shift();
    }

    updateStockCard(symbol, price, changePct, direction);
    drawSparkline(symbol, priceHistory[symbol]);
    flashCard(symbol, direction);
  });
}

function setConnectionStatus(state) {
  statusDot.className   = "status-dot " + state;
  statusText.textContent =
    state === "connected"    ? "Connected" :
    state === "disconnected" ? "Disconnected" :
                               "Connecting…";
}

// ─── Subscription ─────────────────────────────────────────────────────────────

function handleSubscribe() {
  const symbols = getCheckedSymbols();
  if (symbols.length === 0) {
    subscribeHint.textContent = "⚠ Please select at least one stock first.";
    return;
  }

  subscribedSymbols = new Set(symbols);

  Array.from(document.querySelectorAll(".stock-card"))
    .filter(c => !subscribedSymbols.has(c.dataset.symbol))
    .forEach(c => c.remove());

  for (const { symbol } of AVAILABLE_STOCKS) {
    if (subscribedSymbols.has(symbol) && !document.getElementById("card-" + symbol)) {
      createStockCard(symbol);
    }
  }

  liveSection.classList.remove("hidden");

  if (socket && socket.connected) {
    socket.emit("subscribe", symbols);
  }
}

// ─── Stock Card Rendering ─────────────────────────────────────────────────────

function createStockCard(symbol) {
  const accent = STOCK_COLORS[symbol] || "var(--lavender)";
  const card   = document.createElement("div");
  card.className      = "stock-card";
  card.id             = "card-" + symbol;
  card.dataset.symbol = symbol;
  card.style.setProperty("--card-accent", accent);

  card.innerHTML = `
    <div class="card-top">
      <span class="card-symbol">${symbol}</span>
      <span class="card-badge">NASDAQ</span>
    </div>
    <div class="card-price" id="price-${symbol}">—</div>
    <div class="card-change flat" id="change-${symbol}">
      <span class="card-arrow">—</span>
      <span>Loading…</span>
    </div>
    <div class="sparkline-wrap">
      <svg
        id="sparkline-${symbol}"
        class="sparkline"
        viewBox="0 0 300 56"
        preserveAspectRatio="none"
        aria-hidden="true"
      ></svg>
      <div class="sparkline-labels">
        <span class="spark-label" id="spark-hi-${symbol}"></span>
        <span class="spark-label" id="spark-lo-${symbol}"></span>
      </div>
    </div>
  `;

  stockGrid.appendChild(card);
}

function updateStockCard(symbol, price, changePct, direction) {
  const priceEl  = document.getElementById("price-"  + symbol);
  const changeEl = document.getElementById("change-" + symbol);
  if (!priceEl || !changeEl) return;

  priceEl.textContent = formatPrice(price);

  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "●";
  changeEl.className = "card-change " + direction;
  changeEl.innerHTML = `<span class="card-arrow">${arrow}</span><span>${formatPct(changePct)}</span>`;
}

function drawSparkline(symbol, prices) {
  const svg = document.getElementById("sparkline-" + symbol);
  if (!svg || prices.length < 2) return;

  const W = 300;
  const H = 56;
  const PAD = 4;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 0.01;
  const n = prices.length;

  function pt(p, i) {
    const x = (i / (n - 1)) * W;
    const y = PAD + (1 - (p - min) / range) * (H - PAD * 2);
    return { x, y };
  }

  let linePath = "";
  let areaPath = "";

  for (let i = 0; i < n; i++) {
    const { x, y } = pt(prices[i], i);
    if (i === 0) {
      linePath += `M ${x} ${y}`;
      areaPath += `M ${x} ${H} L ${x} ${y}`;
    } else {
      const prev = pt(prices[i - 1], i - 1);
      const cpX  = (prev.x + x) / 2;
      linePath += ` C ${cpX} ${prev.y} ${cpX} ${y} ${x} ${y}`;
      areaPath += ` C ${cpX} ${prev.y} ${cpX} ${y} ${x} ${y}`;
    }
  }

  const last = pt(prices[n - 1], n - 1);
  areaPath += ` L ${last.x} ${H} Z`;

  const gradId = "sg-" + symbol;

  svg.innerHTML = `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="currentColor" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="currentColor" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gradId})" />
    <path d="${linePath}" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  `;

  const hiEl = document.getElementById("spark-hi-" + symbol);
  const loEl = document.getElementById("spark-lo-" + symbol);
  if (hiEl) hiEl.textContent = formatPrice(max);
  if (loEl) loEl.textContent = formatPrice(min);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  if (!email) return;
  setStoredEmail(email);
  showDashboard(email);
});

logoutBtn.addEventListener("click", () => {
  clearStoredEmail();
  showLogin();
});

subscribeBtn.addEventListener("click", handleSubscribe);

// ─── Initialisation ───────────────────────────────────────────────────────────

(function init() {
  const saved = getStoredEmail();
  if (saved) showDashboard(saved);
})();
