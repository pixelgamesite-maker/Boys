import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = fileURLToPath(new URL("./dist", import.meta.url));

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY || "";
const OPENSEA_SLUG = process.env.OPENSEA_COLLECTION_SLUG || "boymeetshood";
const CACHE_MS = (Number(process.env.FLOOR_PRICE_CACHE_SECONDS) || 180) * 1000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

let cache = null;

let inFlight = null;

async function getFloorPrice() {
  const fresh = cache && Date.now() - cache.fetchedAt < CACHE_MS;
  if (fresh) return { ok: true, ...cache, stale: false };

  if (!OPENSEA_API_KEY) {
    return cache
      ? { ok: true, ...cache, stale: true }
      : { ok: false, reason: "not_configured" };
  }

  if (!inFlight) {
    inFlight = fetchFromOpenSea().finally(() => {
      inFlight = null;
    });
  }

  try {
    const result = await inFlight;
    cache = result;
    return { ok: true, ...result, stale: false };
  } catch (err) {
    console.error("[floor-price] OpenSea fetch failed:", err instanceof Error ? err.message : err);
    return cache
      ? { ok: true, ...cache, stale: true }
      : { ok: false, reason: "upstream_error" };
  }
}

async function fetchFromOpenSea() {
  const res = await fetch(
    `https://api.opensea.io/api/v2/collections/${OPENSEA_SLUG}/stats`,
    { headers: { accept: "application/json", "x-api-key": OPENSEA_API_KEY } },
  );

  if (!res.ok) {
    throw new Error(`OpenSea responded ${res.status}`);
  }

  const body = await res.json();
  const value = body?.total?.floor_price;
  const symbol = body?.total?.floor_price_symbol;

  if (typeof value !== "number" || !symbol) {
    throw new Error("Unexpected OpenSea response shape");
  }

  return { value, symbol, fetchedAt: Date.now() };
}

function serveFile(res, path) {
  const type = MIME[extname(path)] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  createReadStream(path).pipe(res);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(DIST_DIR, safePath);

  if (candidate.startsWith(DIST_DIR) && existsSync(candidate) && statSync(candidate).isFile()) {
    return serveFile(res, candidate);
  }

  return serveFile(res, join(DIST_DIR, "index.html"));
}


const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/floor-price")) {
    try {
      const result = await getFloorPrice();
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, reason: "internal_error" }));
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Serving ${DIST_DIR} on :${PORT}`);
  if (!OPENSEA_API_KEY) {
    console.warn(
      "[floor-price] OPENSEA_API_KEY is not set — the floor price card will show as unavailable until it is.",
    );
  }
});
