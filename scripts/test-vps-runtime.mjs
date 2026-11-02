import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGoogleReviewsVercelHandler } from "../api/google-reviews.js";
import { createGoogleReviewsService } from "../server/googleReviewsService.mjs";
import { createPropertyCorpRuntime } from "../server/httpRuntime.mjs";
import { createRuntimeOfferRepository } from "../server/offerSnapshotRepository.mjs";
import { bootstrapPersistentState } from "./lib/persistentStateBootstrap.mjs";
import { createRuntimeOfferRepository as createBrowserRuntimeOfferRepository, RuntimeOffersRepositoryError } from "../src/services/offers/runtimeOfferRepository.js";

function rawOffer(id, { title = `Oferta ${id}`, price = "500000" } = {}) {
  return {
    id: String(id), typ: "sprzedaz", kategoria: "mieszkania", nazwaF: title,
    cena: price, powierzchnia: "50", liczbapokoi: "2", n_geo_x: "17.038", n_geo_y: "51.108",
    opis: "Opis", agent_nazwisko: "Jan Testowy", agent_tel_kom: "123456789", agent_email: "jan@example.test",
    datawprowadzenia: "2026-01-01 12:00:00", zdjecie1: `offer-${id}.jpg`,
  };
}

function snapshot(...offers) {
  return Object.fromEntries(offers.map((offer) => [`offer-${offer.id}`, offer]));
}

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function withServer(handler, action) {
  const server = createServer(handler);
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try { return await action(origin); } finally { await new Promise((resolvePromise) => server.close(resolvePromise)); }
}

function rawGet(origin, path) {
  const url = new URL(origin);
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest({ hostname: url.hostname, port: url.port, path, method: "GET" }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolvePromise({ status: response.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("error", reject);
    request.end();
  });
}

const root = await mkdtemp(join(tmpdir(), "propertycorp-vps-runtime-"));
try {
  const snapshotPath = join(root, "imo-current", "oferty.json");
  const mediaDirectory = join(root, "media", "offers");
  const distDirectory = join(root, "dist");
  await writeJson(snapshotPath, snapshot(rawOffer(1)));
  await mkdir(mediaDirectory, { recursive: true });
  await writeFile(join(mediaDirectory, "offer-1.jpg"), "jpg-bytes");
  await mkdir(join(distDirectory, "assets"), { recursive: true });
  await writeFile(join(distDirectory, "index.html"), "<html>SPA</html>");
  await writeFile(join(distDirectory, "assets", "main-abcdefgh.js"), "asset");

  const offers = createRuntimeOfferRepository({ snapshotPath });
  const first = await offers.load();
  assert.equal(first.offers[0].title, "Oferta 1");
  assert.equal("source" in first.offers[0], false, "runtime response omits adapter provenance");
  assert.equal("imageIssues" in first.offers[0], false, "runtime response omits operational image issues");
  await writeJson(snapshotPath, snapshot(rawOffer(1, { title: "Oferta po imporcie" })));
  assert.equal((await offers.load()).offers[0].title, "Oferta po imporcie", "repository reloads a promoted snapshot without a process restart");

  const reviewsService = { getResponse: async () => ({ status: 200, headers: { "Cache-Control": "no-cache" }, body: { reviews: [] } }) };
  const runtime = createPropertyCorpRuntime({ distDirectory, mediaDirectory, offerRepository: offers, reviewsService });
  await withServer(runtime, async (origin) => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", snapshotReadable: true, offerCount: 1 });

    const api = await fetch(`${origin}/api/offers`);
    assert.equal(api.status, 200);
    assert.match(api.headers.get("cache-control"), /no-cache/);
    const etag = api.headers.get("etag");
    const payload = await api.json();
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.offers[0].title, "Oferta po imporcie");
    assert.equal(payload.offers[0].price.amount, 500000, "runtime response is the normalized offer model");
    assert.equal(payload.offers[0].images[0].url, "/media/offers/offer-1.jpg");
    assert.equal((await fetch(`${origin}/api/offers`, { headers: { "If-None-Match": etag } })).status, 304);

    assert.equal(await (await fetch(`${origin}/api/google-reviews`)).json().then((body) => body.reviews.length), 0);
    assert.equal(await (await fetch(`${origin}/media/offers/offer-1.jpg`)).text(), "jpg-bytes");
    assert.equal((await rawGet(origin, "/media/offers/%2e%2e%2fsecret.jpg")).status, 404, "encoded traversal is rejected");
    assert.equal((await rawGet(origin, "/oferty/test--%ZZ")).status, 400, "invalid URL encoding is rejected before the SPA");
    assert.equal(await (await fetch(`${origin}/oferty/example--1`)).text(), "<html>SPA</html>", "client route falls back to index");
    assert.equal((await fetch(`${origin}/api/missing`)).status, 404, "unknown API never falls back to index");
    assert.equal((await fetch(`${origin}/assets/missing.js`)).status, 404, "unknown static asset never falls back to index");
  });

  const localProjectRoot = join(root, "repository-local-mode");
  const configuredStateRoot = join(root, "configured-state-root");
  await writeJson(join(localProjectRoot, "_input", "imo-current", "oferty.json"), snapshot(rawOffer(2, { title: "Lokalny snapshot" })));
  await mkdir(join(localProjectRoot, "public", "media", "offers"), { recursive: true });
  await writeFile(join(localProjectRoot, "public", "media", "offers", "offer-2.jpg"), "local-jpg");
  await writeJson(join(configuredStateRoot, "imo-current", "oferty.json"), snapshot(rawOffer(3, { title: "Snapshot stanu VPS" })));
  await mkdir(join(configuredStateRoot, "media", "offers"), { recursive: true });
  await writeFile(join(configuredStateRoot, "media", "offers", "offer-3.jpg"), "state-root-jpg");

  const localFallbackRepository = createRuntimeOfferRepository({ projectRoot: localProjectRoot, environment: {} });
  assert.equal((await localFallbackRepository.load()).offers[0].title, "Lokalny snapshot", "unset state root retains repository-local snapshots");
  const localFallbackRuntime = createPropertyCorpRuntime({
    projectRoot: localProjectRoot, distDirectory, environment: {}, reviewsService,
  });
  await withServer(localFallbackRuntime, async (origin) => {
    assert.equal((await (await fetch(`${origin}/api/offers`)).json()).offers[0].title, "Lokalny snapshot");
    assert.equal(await (await fetch(`${origin}/media/offers/offer-2.jpg`)).text(), "local-jpg");
  });

  const stateRootEnvironment = { PROPERTYCORP_STATE_ROOT: configuredStateRoot };
  const stateRootRepository = createRuntimeOfferRepository({
    projectRoot: localProjectRoot, environment: stateRootEnvironment,
  });
  assert.equal((await stateRootRepository.load()).offers[0].title, "Snapshot stanu VPS", "configured state root overrides separate repository-local snapshots");
  await writeJson(join(configuredStateRoot, "imo-current", "oferty.json"), snapshot(rawOffer(3, { title: "Snapshot po promocji" })));
  assert.equal((await stateRootRepository.load()).offers[0].title, "Snapshot po promocji", "state-root repository reloads replacement snapshots");
  const stateRootRuntime = createPropertyCorpRuntime({
    projectRoot: localProjectRoot, distDirectory, environment: stateRootEnvironment, reviewsService,
  });
  await withServer(stateRootRuntime, async (origin) => {
    assert.equal((await (await fetch(`${origin}/healthz`)).json()).offerCount, 1);
    assert.equal((await (await fetch(`${origin}/api/offers`)).json()).offers[0].title, "Snapshot po promocji");
    assert.equal(await (await fetch(`${origin}/media/offers/offer-3.jpg`)).text(), "state-root-jpg");
  });

  const missingRuntime = createPropertyCorpRuntime({
    distDirectory,
    mediaDirectory,
    offerRepository: createRuntimeOfferRepository({ snapshotPath: join(root, "missing", "oferty.json") }),
    reviewsService,
  });
  await withServer(missingRuntime, async (origin) => {
    assert.equal((await fetch(`${origin}/healthz`)).status, 503);
    assert.equal((await fetch(`${origin}/api/offers`)).status, 503);
  });

  const malformedPath = join(root, "malformed", "oferty.json");
  await mkdir(join(malformedPath, ".."), { recursive: true });
  await writeFile(malformedPath, "not-json");
  await assert.rejects(() => createRuntimeOfferRepository({ snapshotPath: malformedPath }).getHealth(), /snapshot_invalid/);
  const malformedRuntime = createPropertyCorpRuntime({
    distDirectory,
    mediaDirectory,
    offerRepository: createRuntimeOfferRepository({ snapshotPath: malformedPath }),
    reviewsService,
  });
  await withServer(malformedRuntime, async (origin) => {
    assert.equal((await fetch(`${origin}/healthz`)).status, 503, "malformed accepted state fails health");
    assert.equal((await fetch(`${origin}/api/offers`)).status, 503, "malformed accepted state fails offers API");
  });

  const browserPayload = { schemaVersion: 1, offers: [
    { id: "2", externalId: "2", slug: "druga", title: "Druga", price: { amount: 200 }, flags: { featured: false }, location: {}, attributes: {}, dates: {} },
    { id: "1", externalId: "1", slug: "pierwsza", title: "Pierwsza", price: { amount: 100 }, flags: { featured: true }, location: {}, attributes: {}, dates: {} },
  ] };
  const browserCalls = [];
  const browserRepository = createBrowserRuntimeOfferRepository({ fetchImpl: async (...argumentsList) => {
    browserCalls.push(argumentsList);
    return new Response(JSON.stringify(browserPayload), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  assert.deepEqual((await browserRepository.getAllOffers({ sort: "price-asc" })).map((offer) => offer.id), ["1", "2"]);
  assert.equal((await browserRepository.getOfferById(2)).slug, "druga");
  assert.equal((await browserRepository.getOfferBySlug("pierwsza")).id, "1");
  assert.equal((await browserRepository.getFeaturedOffers()).length, 1);
  assert.equal(browserCalls[0][0], "/api/offers");
  assert.equal(browserCalls[0][1].cache, "no-cache");
  const failingBrowserRepository = createBrowserRuntimeOfferRepository({ fetchImpl: async () => new Response("", { status: 503 }) });
  await assert.rejects(() => failingBrowserRepository.getAllOffers(), RuntimeOffersRepositoryError);

  const bootstrapSource = join(root, "bootstrap-source");
  await writeJson(join(bootstrapSource, "_input", "imo-current", "oferty.json"), snapshot(rawOffer(99)));
  await mkdir(join(bootstrapSource, "_input", "imo-current", "photos"), { recursive: true });
  await writeFile(join(bootstrapSource, "_input", "imo-current", "photos", "offer-99.jpg"), "source-photo");
  await mkdir(join(bootstrapSource, "public", "media", "offers"), { recursive: true });
  await writeFile(join(bootstrapSource, "public", "media", "offers", "offer-99.jpg"), "public-photo");
  const bootstrapDestination = join(root, "persistent-state");
  await bootstrapPersistentState({ sourceRoot: bootstrapSource, destination: bootstrapDestination });
  assert.match(await readFile(join(bootstrapDestination, "imo-current", "oferty.json"), "utf8"), /"99"/);
  assert.equal(await readFile(join(bootstrapDestination, "media", "offers", "offer-99.jpg"), "utf8"), "public-photo");
  await writeFile(join(bootstrapDestination, "imo-current", "sentinel.txt"), "do-not-overwrite");
  await assert.rejects(() => bootstrapPersistentState({ sourceRoot: bootstrapSource, destination: bootstrapDestination }), /Refusing to overwrite/);
  await bootstrapPersistentState({ sourceRoot: bootstrapSource, destination: bootstrapDestination, force: true });
  await assert.rejects(() => readFile(join(bootstrapDestination, "imo-current", "sentinel.txt")), /ENOENT/);

  const missingCredentialsService = createGoogleReviewsService({ environment: {}, logger: { error() {} }, fetchImpl: async () => { throw new Error("must not fetch"); } });
  assert.equal((await missingCredentialsService.getResponse()).status, 204);
  let reviewFetches = 0;
  const configuredReviewsService = createGoogleReviewsService({
    environment: {
      GOOGLE_BUSINESS_ACCOUNT_ID: "account", GOOGLE_BUSINESS_CLIENT_ID: "client", GOOGLE_BUSINESS_CLIENT_SECRET: "secret",
      GOOGLE_BUSINESS_LOCATION_ID: "location", GOOGLE_BUSINESS_REFRESH_TOKEN: "refresh", GOOGLE_BUSINESS_REVIEWS_URL: "https://example.test/reviews",
    },
    logger: { error() {} },
    fetchImpl: async (url) => {
      reviewFetches += 1;
      if (String(url).includes("oauth2.googleapis.com")) return new Response(JSON.stringify({ access_token: "token" }), { status: 200 });
      return new Response(JSON.stringify({ averageRating: 5, totalReviewCount: 1, reviews: [{ reviewId: "r1", starRating: "FIVE", comment: "Świetnie. (Translated by Google) Great.", reviewer: { displayName: "Anna" } }] }), { status: 200 });
    },
  });
  const reviews = await configuredReviewsService.getResponse();
  assert.equal(reviews.body.reviews[0].text, "Świetnie.");
  await configuredReviewsService.getResponse();
  assert.equal(reviewFetches, 2, "shared service caches its one-hour successful response");

  const vercelHandler = createGoogleReviewsVercelHandler({ service: { getResponse: async () => ({ status: 200, headers: { "Cache-Control": "no-cache" }, body: { reviews: [] } }) } });
  const vercelResponse = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; }, end() { this.ended = true; } };
  await vercelHandler({ method: "GET" }, vercelResponse);
  assert.equal(vercelResponse.statusCode, 200);
  assert.deepEqual(vercelResponse.body, { reviews: [] });
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("VPS runtime: live accepted snapshots, HTTP boundaries, browser repository, review service, and persistent-state bootstrap passed.");
