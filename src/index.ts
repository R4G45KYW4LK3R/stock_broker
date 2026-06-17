/**
 * Entry point: creates the HTTP server, attaches Socket.IO,
 * and drives the real-time stock price simulation.
 */
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const httpServer = createServer(app);

// ─── Socket.IO ───────────────────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── Stock Data ──────────────────────────────────────────────────────────────
/** Base (initial) prices for each supported ticker */
const BASE_PRICES: Record<string, number> = {
  GOOG: 178.54,
  TSLA: 248.32,
  AMZN: 195.71,
  META:  558.20,
  NVDA:  875.43,
};

/** Live prices, mutated every second */
const currentPrices: Record<string, number> = { ...BASE_PRICES };

/** Track previous prices to compute direction */
const previousPrices: Record<string, number> = { ...BASE_PRICES };

// ─── Subscriptions ───────────────────────────────────────────────────────────
/** Maps socket.id → Set of subscribed ticker symbols */
const subscriptions = new Map<string, Set<string>>();

// ─── Price Simulation ────────────────────────────────────────────────────────
/**
 * Every second, apply a small random fluctuation (±1.5 %) to each stock,
 * then push updates only to the sockets that subscribed to each symbol.
 */
setInterval(() => {
  for (const symbol of Object.keys(currentPrices)) {
    previousPrices[symbol] = currentPrices[symbol]!;
    const drift = (Math.random() - 0.5) * 0.03; // –1.5 % to +1.5 %
    currentPrices[symbol] = Math.max(1, currentPrices[symbol]! * (1 + drift));
  }

  for (const [socketId, symbols] of subscriptions) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;

    for (const symbol of symbols) {
      const price    = currentPrices[symbol]!;
      const prev     = previousPrices[symbol]!;
      const change   = price - prev;
      const changePct = ((price - prev) / prev) * 100;
      const direction: "up" | "down" | "flat" =
        change > 0.005 ? "up" : change < -0.005 ? "down" : "flat";

      socket.emit("price-update", { symbol, price, change, changePct, direction });
    }
  }
}, 1000);

// ─── Socket.IO Event Handlers ────────────────────────────────────────────────
io.on("connection", (socket) => {
  logger.info({ socketId: socket.id }, "Client connected");
  subscriptions.set(socket.id, new Set());

  /** Client sends the list of tickers it wants to track */
  socket.on("subscribe", (symbols: string[]) => {
    const valid = symbols.filter((s) => s in BASE_PRICES);
    subscriptions.set(socket.id, new Set(valid));
    logger.info({ socketId: socket.id, symbols: valid }, "Client subscribed");

    // Immediately push current prices so the UI populates instantly
    for (const symbol of valid) {
      socket.emit("price-update", {
        symbol,
        price: currentPrices[symbol],
        change: 0,
        changePct: 0,
        direction: "flat",
      });
    }
  });

  socket.on("disconnect", () => {
    subscriptions.delete(socket.id);
    logger.info({ socketId: socket.id }, "Client disconnected");
  });
});

// ─── Start Listening ─────────────────────────────────────────────────────────
httpServer.listen(port, () => {
  logger.info({ port }, "Server listening");
});
