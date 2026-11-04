import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createServer } from "vite";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://portfolio.example.test/polityka-cookies" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Event = dom.window.Event;
globalThis.Image = dom.window.Image;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
let nextFrame = 0;
const frames = new Map();
window.requestAnimationFrame = (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; };
window.cancelAnimationFrame = (id) => frames.delete(id);
const scrolls = [];
const errors = [];
window.addEventListener("error", (event) => { errors.push(event.error); event.preventDefault(); });
window.HTMLElement.prototype.scrollIntoView = function (options) { scrolls.push({ id: this.id, options }); };
const { createRoot } = await import("react-dom/client");
const server = await createServer({ optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
const { default: FinalSite } = await server.ssrLoadModule("/src/pages/HomePage.jsx");
const { ConsentProvider } = await server.ssrLoadModule("/src/consent/ConsentProvider.jsx");
const container = document.getElementById("root");

async function flushFrames() {
  while (frames.size) {
    const batch = [...frames.values()];
    frames.clear();
    await act(async () => batch.forEach((callback) => callback(0)));
  }
}
async function open(path) {
  window.history.replaceState({}, "", path);
  scrolls.length = 0;
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(ConsentProvider, null, React.createElement(FinalSite))));
  await flushFrames();
  assert.ok(document.getElementById("main-content"), `page remains rendered for ${path}`);
  return root;
}
async function close(root) { await act(async () => root.unmount()); frames.clear(); }

try {
  window.matchMedia = (query) => ({ matches: query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} });
  {
    const root = await open("/");
    assert.deepEqual(scrolls, [], "ordinary homepage does not scroll to an anchor");
    await close(root);
  }
  {
    const root = await open("/#%ZZ");
    assert.deepEqual(scrolls, [], "malformed homepage fragment does not scroll");
    assert.deepEqual(errors, [], "malformed homepage fragment raises no error");
    await close(root);
  }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  for (const path of ["/polityka-cookies", "/polityka-cookies#"]) {
    const root = await open(path);
    assert.deepEqual(scrolls, [], `no anchor scroll for ${path}`);
    await close(root);
  }
  {
    const root = await open("/polityka-cookies#main%2Dcontent");
    assert.deepEqual(scrolls, [{ id: "main-content", options: { behavior: "smooth", block: "start" } }]);
    await act(async () => window.history.replaceState({}, "", "/polityka-cookies#%ZZ"));
    await act(async () => window.dispatchEvent(new window.HashChangeEvent("hashchange")));
    await flushFrames();
    assert.deepEqual(errors, [], "malformed hashchange raises no error");
    assert.ok(document.querySelector("main"), "malformed hashchange keeps the page visible");
    assert.equal(scrolls.length, 1, "malformed hashchange does not scroll");
    await act(async () => window.history.replaceState({}, "", "/polityka-cookies#main-content"));
    await act(async () => window.dispatchEvent(new window.HashChangeEvent("hashchange")));
    await flushFrames();
    assert.equal(scrolls.length, 2, "valid navigation still works after a malformed fragment");
    await close(root);
  }
  {
    const root = await open("/polityka-cookies#%ZZ");
    assert.deepEqual(scrolls, [], "malformed fragment does not scroll");
    await close(root);
  }
} finally {
  await server.close();
  dom.window.close();
}
console.log("Hash navigation: ordinary, empty, valid and malformed fragments passed.");
