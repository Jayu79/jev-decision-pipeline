// Loads the built site in Chromium and checks the page never scrolls sideways:
// document.documentElement.scrollWidth must equal the viewport width. Runs with
// JavaScript off too, because that is what a phone paints before the page hydrates.
//
//   npm run build && npm run check:layout
//
// Exits non-zero on any failure.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(site, "out");
const BASE = "/jev-decision-pipeline";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };

// A static server for out/ under the basePath, as GitHub Pages serves it.
const server = createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!url.startsWith(BASE)) return res.writeHead(404).end();
  let file = normalize(join(out, url.slice(BASE.length)));
  if (!file.startsWith(out)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PAGE = `http://127.0.0.1:${server.address().port}${BASE}/`;

const CASES = [
  { width: 390, js: false, mobile: true },
  { width: 390, js: true, mobile: true },
  { width: 1024, js: false, mobile: false },
  { width: 1024, js: true, mobile: false },
  { width: 1440, js: true, mobile: false },
];

const browser = await chromium.launch();
const failures = [];
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: c.width, height: 844 }, javaScriptEnabled: c.js, isMobile: c.mobile, hasTouch: c.mobile });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: c.js ? "networkidle" : "load" });
  if (c.js) await page.waitForSelector("canvas");
  const r = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    culprits: [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5 && !e.closest(".overflow-x-auto, .sr-only"))
      .slice(0, 3)
      .map((e) => `${e.tagName.toLowerCase()} ${Math.round(e.getBoundingClientRect().width)}px`),
  }));
  const ok = r.scroll === r.viewport;
  console.log(`${ok ? "ok  " : "FAIL"} ${c.width}px, JavaScript ${c.js ? "on " : "off"}: scrollWidth ${r.scroll}, viewport ${r.viewport}${ok ? "" : ` (${r.culprits.join(", ")})`}`);
  if (!ok) failures.push(`${c.width}px JS ${c.js ? "on" : "off"}`);
  await ctx.close();
}
await browser.close();
server.close();

if (failures.length) {
  console.error(`\nThe page scrolls sideways at: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("\nNo horizontal scroll at any width.");
