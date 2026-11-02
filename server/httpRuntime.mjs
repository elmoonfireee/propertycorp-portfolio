import { createReadStream } from "node:fs";
import { lstat, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGoogleReviewsService } from "./googleReviewsService.mjs";
import { createRuntimeOfferRepository, RuntimeOfferSnapshotError } from "./offerSnapshotRepository.mjs";
import { resolvePropertyCorpStatePaths } from "./statePaths.mjs";

const defaultProjectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RUNTIME_OFFERS_SCHEMA_VERSION = 1;

const contentTypes = Object.freeze({
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
});

function contentType(path) {
  return contentTypes[extname(path).toLowerCase()] || "application/octet-stream";
}

function safeDecodedPathname(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

function isSafeBasename(value) {
  return Boolean(value)
    && value === basename(value)
    && !/[\\/\0]/u.test(value)
    && value !== "."
    && value !== "..";
}

function isWithin(root, path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function sendJson(request, response, status, payload, headers = {}) {
  const body = payload == null ? "" : `${JSON.stringify(payload)}\n`;
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  if (request.method !== "HEAD") response.end(body);
  else response.end();
}

function sendEmpty(response, status, headers = {}) {
  response.writeHead(status, headers);
  response.end();
}

async function sendFile(request, response, path, { cacheControl } = {}) {
  let info;
  try { info = await stat(path); } catch { return false; }
  if (!info.isFile()) return false;
  response.writeHead(200, {
    "Content-Type": contentType(path),
    "Content-Length": info.size,
    "Cache-Control": cacheControl || "public, max-age=3600",
  });
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  const stream = createReadStream(path);
  stream.on("error", () => {
    if (!response.headersSent) sendJson(request, response, 500, { error: "internal_error" });
    else response.destroy();
  });
  stream.pipe(response);
  return true;
}

async function sendMediaFile(request, response, path) {
  // Do not follow a symlink from the persistent media bind mount to another
  // host path. PC-12 writes regular files here, so rejecting a link is safe.
  try {
    if ((await lstat(path)).isSymbolicLink()) return false;
  } catch {
    return false;
  }
  return sendFile(request, response, path, { cacheControl: "public, max-age=3600" });
}

function staticCacheControl(path) {
  return path.includes(`${sep}assets${sep}`) && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/iu.test(path)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function isStaticNamespace(pathname) {
  return pathname === "/assets" || pathname.startsWith("/assets/") || Boolean(extname(pathname));
}

function methodNotAllowed(request, response) {
  sendEmpty(response, 405, { Allow: "GET, HEAD" });
}

/**
 * Small same-origin production server for the Vite client and live accepted
 * IMO state. It deliberately has no route which can mutate snapshots.
 */
export function createPropertyCorpRuntime({
  projectRoot = defaultProjectRoot,
  distDirectory = join(projectRoot, "dist"),
  mediaDirectory,
  offerRepository,
  reviewsService = createGoogleReviewsService(),
  stateRoot,
  environment = process.env,
} = {}) {
  const statePaths = resolvePropertyCorpStatePaths({ projectRoot, stateRoot, environment });
  const resolvedDistDirectory = resolve(distDirectory);
  const resolvedMediaDirectory = resolve(mediaDirectory || statePaths.publicMediaDirectory);
  const activeOfferRepository = offerRepository || createRuntimeOfferRepository({ projectRoot, stateRoot, environment });

  return async function propertyCorpRuntime(request, response) {
    if (!["GET", "HEAD"].includes(request.method || "GET")) {
      methodNotAllowed(request, response);
      return;
    }
    const requestUrl = new URL(request.url || "/", "http://runtime.local");
    const pathname = requestUrl.pathname;

    try {
      if (pathname === "/healthz") {
        try {
          const health = await activeOfferRepository.getHealth();
          sendJson(request, response, 200, health, { "Cache-Control": "no-store" });
        } catch (error) {
          if (error instanceof RuntimeOfferSnapshotError) sendJson(request, response, 503, { status: "unavailable", snapshotReadable: false }, { "Cache-Control": "no-store" });
          else throw error;
        }
        return;
      }

      if (pathname === "/api/offers") {
        try {
          const snapshot = await activeOfferRepository.load();
          const headers = { "Cache-Control": "no-cache, max-age=0, must-revalidate", ETag: snapshot.etag };
          if (request.headers["if-none-match"] === snapshot.etag) {
            sendEmpty(response, 304, headers);
            return;
          }
          sendJson(request, response, 200, { schemaVersion: RUNTIME_OFFERS_SCHEMA_VERSION, offers: snapshot.offers }, headers);
        } catch (error) {
          if (error instanceof RuntimeOfferSnapshotError) sendJson(request, response, 503, { error: "offers_unavailable" }, { "Cache-Control": "no-store" });
          else throw error;
        }
        return;
      }

      if (pathname === "/api/google-reviews") {
        const result = await reviewsService.getResponse();
        if (result.body == null) sendEmpty(response, result.status, result.headers);
        else sendJson(request, response, result.status, result.body, result.headers);
        return;
      }

      if (pathname.startsWith("/api/")) {
        sendJson(request, response, 404, { error: "not_found" }, { "Cache-Control": "no-store" });
        return;
      }

      if (pathname === "/media/offers" || pathname.startsWith("/media/offers/")) {
        const filename = safeDecodedPathname(pathname.slice("/media/offers/".length));
        if (!isSafeBasename(filename)) {
          sendJson(request, response, 404, { error: "not_found" }, { "Cache-Control": "no-store" });
          return;
        }
        const mediaPath = resolve(resolvedMediaDirectory, filename);
        if (!isWithin(resolvedMediaDirectory, mediaPath) || !(await sendMediaFile(request, response, mediaPath))) {
          sendJson(request, response, 404, { error: "not_found" }, { "Cache-Control": "no-store" });
        }
        return;
      }

      const decodedPathname = safeDecodedPathname(pathname);
      if (decodedPathname == null) {
        sendJson(request, response, 400, { error: "bad_request" }, { "Cache-Control": "no-store" });
        return;
      }
      const requestedStaticPath = resolve(resolvedDistDirectory, `.${decodedPathname}`);
      if (isWithin(resolvedDistDirectory, requestedStaticPath) && await sendFile(request, response, requestedStaticPath, { cacheControl: staticCacheControl(requestedStaticPath) })) return;
      if (isStaticNamespace(decodedPathname)) {
        sendJson(request, response, 404, { error: "not_found" }, { "Cache-Control": "no-store" });
        return;
      }
      if (!(await sendFile(request, response, join(resolvedDistDirectory, "index.html"), { cacheControl: "no-cache" }))) {
        sendJson(request, response, 503, { error: "runtime_unavailable" }, { "Cache-Control": "no-store" });
      }
    } catch {
      if (!response.headersSent) sendJson(request, response, 500, { error: "internal_error" }, { "Cache-Control": "no-store" });
      else response.destroy();
    }
  };
}
