# Broker — Real-Time Stock Dashboard

A full-stack real-time stock broker client dashboard built with Node.js, Express, and Socket.IO. Features live price streaming, per-user stock subscriptions, sparkline price history charts, and a sophisticated dark/pastel UI.

![Login Screen](https://img.shields.io/badge/UI-Dark%20Pastel-c4b5fd?style=flat-square) ![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socketdotio) ![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=flat-square&logo=nodedotjs) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)

---

## Features

- **Email login** — sign in with just an email address, stored in `localStorage` (no password, no server session)
- **Stock subscriptions** — choose any combination of GOOG, TSLA, AMZN, META, NVDA via checkboxes
- **Real-time prices** — Socket.IO pushes price updates every second; only your subscribed stocks are streamed to you
- **Multi-user** — open in multiple tabs/browsers simultaneously; each session has its own isolated subscription
- **Sparkline charts** — each stock card shows a smooth 60-second rolling price history chart in SVG
- **Price indicators** — green ▲ / red ▼ arrows with percentage change; card background flashes on each tick
- **Persistent session** — refreshing the page keeps you logged in and re-subscribes automatically

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 |
| Language | TypeScript 5.9 |
| HTTP server | Express 5 |
| WebSockets | Socket.IO 4 |
| Build | esbuild |
| Package manager | pnpm (workspaces) |
| Frontend | Vanilla HTML / CSS / JS |
| Database | PostgreSQL + Drizzle ORM *(available, not used by dashboard)* |

---

## Project Structure

```
artifacts/
└── api-server/
    ├── src/
    │   ├── index.ts        # HTTP server, Socket.IO, stock simulation, subscriptions
    │   └── app.ts          # Express app, static file serving, /api router
    ├── client/
    │   ├── index.html      # Login screen + dashboard HTML
    │   ├── style.css       # Dark/pastel theme, card layout, sparkline styles
    │   └── app.js          # Socket.IO client, subscription logic, sparkline renderer
    └── build.mjs           # esbuild config — bundles TS and copies client/ → dist/client/
lib/
└── api-spec/
    └── openapi.yaml        # OpenAPI contract (source of truth for REST API)
```

---

## Getting Started

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm](https://pnpm.io/) — install with `npm install -g pnpm`
- PostgreSQL (optional — not required for the dashboard to run)

### Install dependencies

```bash
pnpm install
```

### Run in development

```bash
pnpm --filter @workspace/api-server run dev
```

The server builds and starts on **port 8080**. Open [http://localhost:8080](http://localhost:8080) in your browser.

### Build for production

```bash
pnpm --filter @workspace/api-server run build
```

Then start the compiled output:

```bash
PORT=8080 node --enable-source-maps artifacts/api-server/dist/index.mjs
```

---

## How It Works

### Backend (`src/index.ts`)

- Creates an HTTP server and attaches Socket.IO to it
- Maintains a `Map<socketId, Set<symbol>>` of per-user subscriptions in memory
- Runs a `setInterval` every second that applies a random ±1.5% drift to each stock price
- On each tick, only pushes updates to the sockets that subscribed to each symbol

### Frontend (`client/app.js`)

- Connects to Socket.IO on page load
- Emits a `subscribe` event with the selected symbols when the user clicks Subscribe
- Listens for `price-update` events and updates the DOM in real time
- Maintains a 60-entry rolling buffer per symbol and redraws the SVG sparkline on every tick

### Stock Simulation

| Symbol | Base Price |
|--------|------------|
| GOOG   | $178.54    |
| TSLA   | $248.32    |
| AMZN   | $195.71    |
| META   | $558.20    |
| NVDA   | $875.43    |

Prices drift randomly each second. No real market data is used.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Port the HTTP server listens on (default `8080`) |
| `NODE_ENV` | No | Set to `production` to enable caching; omit for development |
| `DATABASE_URL` | No | PostgreSQL connection string (only needed if using DB features) |

---

## Scripts

| Command | Description |
|---|---|
| `pnpm --filter @workspace/api-server run dev` | Build + start dev server |
| `pnpm --filter @workspace/api-server run build` | Production build |
| `pnpm run typecheck` | TypeScript check across all packages |

---

## License

MIT
