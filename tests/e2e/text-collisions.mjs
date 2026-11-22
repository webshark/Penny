// Text collision / clipping / RTL audit against a running Penny (read-only: never saves data).
// Run: node tests/e2e/text-collisions.mjs                 (BASE defaults to http://127.0.0.1:3002)
//      BASE=http://127.0.0.1:3000 OUT=./collisions node tests/e2e/text-collisions.mjs
//      QUICK=1 node tests/e2e/text-collisions.mjs           (widths 320/768/1440, light only)
//      THEMES=dark ONLY=/budget node tests/e2e/text-collisions.mjs  (dark only; forces the "midnight" theme over saved appearance)
//      ONLY=/budget,/fi node tests/e2e/text-collisions.mjs  (subset of routes)
// Needs Google Chrome (playwright-core, channel "chrome"). Writes OUT/report.json, OUT/summary.txt
// and a screenshot crop per unique issue. Exits 1 when non-allowlisted issues remain.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BASE = process.env.BASE ?? "http://127.0.0.1:3002";
const OUT = process.env.OUT ?? join(tmpdir(), "penny-text-collisions");
const QUICK = !!process.env.QUICK;
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
mkdirSync(OUT, { recursive: true });

const CALCS = ["compound", "fees", "inflation", "goal", "mortgage", "loan", "credit", "leaseBuy", "net", "budget", "emergency", "fire"];
const SETTINGS = ["", "/general", "/appearance", "/categories", "/data", "/privacy", "/ai", "/bank", "/household", "/rules", "/telegram", "/legacy"];
let ROUTES = [
  "/", "/?view=detail", "/transactions", "/budget",
  "/overview", "/overview?tab=period", "/overview?tab=ahead", "/overview?tab=recurring",
  "/investments", "/investments?tab=tools", "/fi", "/journey", "/life", "/more", "/tips", "/profiles",
  ...CALCS.map((c) => `/calculators/${c}`), ...SETTINGS.map((s) => `/settings${s}`),
];
if (process.env.ONLY) ROUTES = process.env.ONLY.split(",");
const WIDTHS = QUICK ? [320, 768, 1440] : [320, 375, 390, 768, 1024, 1280, 1440, 1920];
const THEMES = process.env.THEMES?.split(",") ?? (QUICK ? ["light"] : ["light", "dark"]);
const LANGS = ["he", "en"];
const ZOOM_WIDTHS = QUICK ? [] : [390, 1440];

// Justified exceptions: { type, route?: RegExp, selector?: RegExp, text?: RegExp, reason }.
const ALLOW = [
  { type: "clipped", selector: /recharts/, reason: "chart SVG internals are clipped by design" },
  // 390px at 200% text is a ~195px-wide layout, below the 320px WCAG 1.4.10 reflow floor; kept as advisory in report.json.
  { config: (i) => i.zoom > 1 && i.width < 768, reason: "390px + 200% text is narrower than the 320px reflow minimum; advisory only" },
  { type: "element-overlap", selector: /cn-toast/, reason: "sonner toast caught mid enter-animation (one-off recap toast); settles without overlap" },
];
const allowed = (i) => ALLOW.find((a) => (!a.type || a.type === i.type) && (!a.config || a.config(i)) && (!a.route || a.route.test(i.route)) && (!a.selector || a.selector.test(i.selector)) && (!a.text || a.text.test(i.text)));

// Runs inside the page; returns issues with rects in page coordinates (scrollY=0 unless noted).
function audit() {
  const vw = document.documentElement.clientWidth, issues = [];
  const sel = (el) => {
    const parts = [];
    for (let e = el, i = 0; e && e.nodeType === 1 && e !== document.body && i < 4; e = e.parentElement, i++) {
      const cls = [...e.classList].filter((c) => !/[:[\]/]/.test(c)).slice(0, 3).join(".");
      parts.unshift(e.tagName.toLowerCase() + (e.id ? `#${e.id}` : "") + (cls ? `.${cls}` : ""));
    }
    return parts.join(" > ");
  };
  const visible = (el) => {
    // checkVisibility also hides the contents of closed <details> and content-visibility:hidden.
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true })) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
      if (s.overflow.includes("hidden") && e.offsetWidth <= 1 && e.offsetHeight <= 1) return false; // sr-only
      if (e.getAttribute("aria-hidden") === "true" && e.tagName !== "svg") return false;
      if (e.hasAttribute("inert") || e.closest("[data-state=closed]")) return false;
    }
    return true;
  };
  const rectOf = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const hit = (a, b, m = 2) => a.left + m < b.right && b.left + m < a.right && a.top + m < b.bottom && b.top + m < a.bottom;
  const add = (type, el, text, r, extra = "") => issues.push({ type, selector: sel(el), text: text.trim().slice(0, 80), rect: rectOf(r), extra });
  const fixedAncestor = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "fixed" || p === "sticky") return e; } return null; };

  // Text nodes and their line boxes.
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.data.trim() && !n.parentElement.closest("script,style,noscript,svg,template") ? 1 : 2) });
  for (let n; (n = walker.nextNode()); ) {
    const el = n.parentElement;
    if (!visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    let rects = [...range.getClientRects()];
    // Ranges report the full, untruncated run; an ellipsis/line-clamp box only paints what fits inside it.
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.textOverflow === "ellipsis" || (s.webkitLineClamp !== "none" && s.webkitLineClamp !== "")) {
        const b = e.getBoundingClientRect();
        rects = rects.map((r) => new DOMRect(Math.max(r.left, b.left), Math.max(r.top, b.top), Math.min(r.right, b.right) - Math.max(r.left, b.left), Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)));
        break;
      }
    }
    rects = rects.filter((r) => r.width > 1 && r.height > 1);
    if (rects.length) texts.push({ n, el, rects, fixed: fixedAncestor(el) });
  }
  // Obstacles: icons, controls, chips. Inputs use their content box (prefix/suffix adornments live in the padding).
  const obstacles = [];
  for (const el of document.querySelectorAll("svg, img, button, input, select, textarea, [role=switch], [role=checkbox], [class*=badge], [class*=chip]")) {
    if (el.closest("svg") !== el && el.tagName !== "svg" && el.closest("svg")) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    let box = r;
    // A bare button (no fill, no border) is only a hit area, often widened with negative margins; its icon/text are checked on their own.
    if (el.tagName === "BUTTON") { const s = getComputedStyle(el); if (s.backgroundColor === "rgba(0, 0, 0, 0)" && parseFloat(s.borderTopWidth) === 0 && !s.boxShadow.includes("rgb")) continue; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const s = getComputedStyle(el);
      box = new DOMRect(r.left + parseFloat(s.paddingLeft), r.top + parseFloat(s.paddingTop), r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), r.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom));
      if (el.type === "range" || el.type === "checkbox" || el.type === "radio" || el.type === "hidden") continue;
    }
    obstacles.push({ el, r: box, fixed: fixedAncestor(el) });
  }
  const related = (a, b) => a === b || a.contains(b) || b.contains(a);
  // Text inside a control (label, chip, button) stacks on it on purpose.
  const owner = (el) => el.closest("button, a, label, [role=button], [role=tab], [role=option], [class*=badge], [class*=chip]") ?? el;
  // Both inside the same fixed layer, or both outside: content scrolling under a fixed bar is not a collision.
  const sameLayer = (a, b) => a.fixed === b.fixed || (!a.fixed && !b.fixed);
  const seen = new Set();
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    for (let j = i + 1; j < texts.length; j++) {
      const u = texts[j];
      if (related(t.el, u.el) || !sameLayer(t, u)) continue;
      if (t.rects.some((a) => u.rects.some((b) => hit(a, b)))) {
        const k = `tt${sel(t.el)}|${sel(u.el)}`; if (seen.has(k)) continue; seen.add(k);
        add("text-overlap", t.el, t.n.data, t.rects[0], `with text "${u.n.data.trim().slice(0, 40)}" (${sel(u.el)})`);
      }
    }
    for (const o of obstacles) {
      if (o.el.contains(t.el) || owner(t.el).contains(o.el) || owner(o.el).contains(t.el) || !sameLayer(t, o)) continue;
      // A label centered inside a chart/ring (svg/img fully containing it) is an intentional overlay.
      if (/^(svg|IMG)$/.test(o.el.tagName) && t.rects.every((a) => a.left >= o.r.left && a.right <= o.r.right && a.top >= o.r.top && a.bottom <= o.r.bottom)) continue;
      if (t.rects.some((a) => hit(a, o.r))) {
        const k = `to${sel(t.el)}|${sel(o.el)}`; if (seen.has(k)) continue; seen.add(k);
        add("element-overlap", t.el, t.n.data, t.rects[0], `with <${o.el.tagName.toLowerCase()}> ${sel(o.el)}`);
      }
    }
    // Fixed top headers covering page content at the top of the page.
    if (!t.fixed) for (const f of document.querySelectorAll("header, [role=banner]")) {
      if (getComputedStyle(f).position !== "fixed" || f.contains(t.el)) continue;
      if (t.rects.some((a) => hit(a, f.getBoundingClientRect()))) add("under-fixed-header", t.el, t.n.data, t.rects[0], sel(f));
    }
  }

  // Clipping / overflow per text node.
  for (const t of texts) {
    const all = t.rects.reduce((a, r) => ({ left: Math.min(a.left, r.left), right: Math.max(a.right, r.right), top: Math.min(a.top, r.top), bottom: Math.max(a.bottom, r.bottom) }), { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 });
    let reported = false;
    for (let e = t.el; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      const ox = s.overflowX, oy = s.overflowY;
      if (/auto|scroll/.test(ox) || /auto|scroll/.test(oy)) break; // scroll container: reachable
      const r = e.getBoundingClientRect();
      const clipsX = /hidden|clip/.test(ox), clipsY = /hidden|clip/.test(oy);
      const outX = all.left < r.left - 1 || all.right > r.right + 1, outY = all.top < r.top - 1 || all.bottom > r.bottom + 1;
      const ellipsis = s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none" && s.webkitLineClamp !== "";
      if ((clipsX && outX) || (clipsY && outY && r.height > 4)) {
        if (!ellipsis) { add("clipped", t.el, t.n.data, r, `by ${sel(e)} (overflow ${ox}/${oy})`); reported = true; }
        break;
      }
    }
    if (!reported && !t.fixed && (all.right > vw + 1 || all.left < -1)) {
      let scroller = false;
      for (let e = t.el; e && e !== document.body; e = e.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(e).overflowX)) { scroller = true; break; }
      if (!scroller) add("off-viewport", t.el, t.n.data, t.rects[0], `x ${Math.round(all.left)}..${Math.round(all.right)} of ${vw}`);
    }
  }
  // Text spilling out of its card (an ancestor with its own background/border, overflow visible).
  for (const t of texts) {
    for (let e = t.el.parentElement; e && e !== document.body; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (/auto|scroll|hidden|clip/.test(s.overflowX)) break;
      const card = (s.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(s.borderTopWidth) > 0) && parseFloat(s.borderRadius) >= 8;
      if (!card) continue;
      const r = e.getBoundingClientRect();
      if (t.rects.some((a) => a.right > r.right + 2 || a.left < r.left - 2)) add("overflows-card", t.el, t.n.data, t.rects[0], `card ${sel(e)}`);
      break;
    }
  }
  // Truncated labels must expose the full text.
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    const ell = s.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1;
    const clamp = s.webkitLineClamp !== "none" && s.webkitLineClamp !== "" && el.scrollHeight > el.clientHeight + 1;
    if (!(ell || clamp) || !visible(el) || !el.textContent.trim()) continue;
    const named = (e) => e && (e.title || e.getAttribute("aria-label") || e.getAttribute("aria-description"));
    if (named(el) || named(el.parentElement) || named(el.closest("[title],[aria-label]"))) continue;
    add("truncated-no-title", el, el.textContent, el.getBoundingClientRect(), ell ? "ellipsis" : "line-clamp");
  }

  // Contrast (WCAG 1.4.3): text color vs. the solid backgrounds under it. Any CSS color (oklch too) resolves through a 1px canvas.
  const cx = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d", { willReadFrequently: true });
  const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, a, base) => base.map((v, i) => top[i] * a + v * (1 - a));
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const pageBg = rgba(getComputedStyle(document.body).backgroundColor);
  for (const t of texts) {
    const s = getComputedStyle(t.el);
    if (t.el.closest(":disabled, [aria-disabled=true]")) continue; // WCAG exempts inactive controls
    let opacity = 1, layers = [], unknown = false;
    for (let e = t.el; e && e !== document.documentElement; e = e.parentElement) {
      const es = getComputedStyle(e);
      opacity *= Number(es.opacity);
      if (es.backgroundImage !== "none" || es.backdropFilter !== "none" && rgba(es.backgroundColor)[3] < 0.9) { unknown = true; break; } // gradients/images/glass: can't tell
      const bg = rgba(es.backgroundColor);
      if (bg[3] > 0) { layers.push(bg); if (bg[3] >= 0.99) break; }
    }
    if (unknown) continue;
    let bg = pageBg.slice(0, 3);
    for (const l of layers.reverse()) bg = over(l, l[3], bg);
    const fg = rgba(s.color), text = over(fg, fg[3] * opacity, bg);
    const [a, b] = [lum(text), lum(bg)].sort((x, y) => y - x), ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) add("low-contrast", t.el, t.n.data, t.rects[0], `${ratio.toFixed(2)}:1 (${s.color} on rgb(${bg.map(Math.round)}))`);
  }

  // RTL/LTR: app convention is "₪1,234" (₪ visually left of the digits) and "-₪"; punctuation at the logical end.
  const rtl = document.documentElement.dir === "rtl";
  const charRect = (n, i) => { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); return r.getClientRects()[0]; };
  for (const t of texts) {
    const d = t.n.data;
    for (const m of d.matchAll(/₪\s?\d|\d\s?₪/g)) {
      const iS = m[0][0] === "₪" ? m.index : m.index + m[0].length - 1;
      const iD = m[0][0] === "₪" ? m.index + m[0].length - 1 : m.index;
      const rs = charRect(t.n, iS), rd = charRect(t.n, iD);
      if (rs && rd && Math.abs(rs.top - rd.top) < 4 && rs.left > rd.left) { add("rtl-currency", t.el, d, t.rects[0], "₪ renders right of its number"); break; }
    }
    // Amount split across nodes: "₪" and the number in sibling text nodes that end up reversed.
    if (rtl && /^\s*[\d,.\-−]+\s*$/.test(d) && t.n.previousSibling?.textContent?.trim() === "₪") {
      const sym = t.n.previousSibling; const r = document.createRange(); r.selectNodeContents(sym); const rs = r.getClientRects()[0];
      if (rs && rs.left > t.rects[0].left) add("rtl-currency", t.el, `₪${d}`, t.rects[0], "₪ and number split, rendered reversed");
    }
    const minus = d.search(/[-−]₪|₪[-−]/);
    if (minus >= 0 && d[minus + 1] === "-") add("rtl-currency", t.el, d, t.rects[0], "minus after ₪");
    if (rtl && /[֐-׿]/.test(d) && /[.:?!]\s*$/.test(d) && t.rects.length === 1) {
      const dir = getComputedStyle(t.el).direction;
      const last = d.trimEnd().length - 1, rp = charRect(t.n, last), r0 = t.rects[0];
      const startsHebrew = /^[^A-Za-z֐-׿]*[֐-׿]/.test(d);
      if (rp && startsHebrew && dir === "ltr") add("rtl-punctuation", t.el, d, r0, "Hebrew text in an LTR box");
      else if (rp && startsHebrew && dir === "rtl" && rp.left > r0.left + 2) add("rtl-punctuation", t.el, d, r0, "punctuation not at the line end");
    }
  }
  return issues;
}

// Scroll to the bottom; the last content must sit above the mobile dock / floating bottom bar.
async function dockCheck(p) {
  return p.evaluate(async () => {
    const dock = [...document.querySelectorAll(".mobile-dock")].find((d) => getComputedStyle(d).display !== "none");
    if (!dock) return [];
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    await new Promise((r) => setTimeout(r, 300));
    const top = dock.getBoundingClientRect().top;
    const main = document.querySelector("#main-content") ?? document.querySelector("main");
    let last = null, bottom = -1;
    for (const el of main.querySelectorAll("a, button, input, select, textarea, p, h1, h2, h3, h4, li, td, span")) {
      if (el.closest(".mobile-dock") || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) || !el.textContent.trim() && !/INPUT|SELECT|TEXTAREA/.test(el.tagName)) continue;
      const s = getComputedStyle(el); if (s.position === "fixed" || el.closest("[style*='position: fixed'], .fixed")) continue;
      const r = el.getBoundingClientRect(); if (r.height && r.bottom > bottom) { bottom = r.bottom; last = el; }
    }
    const out = [];
    if (last && bottom > top + 1) out.push({ type: "behind-dock", selector: last.tagName.toLowerCase() + "." + [...last.classList].slice(0, 3).join("."), text: last.textContent.trim().slice(0, 80), rect: { x: 0, y: top - 60, w: innerWidth, h: 120 }, extra: `last element bottom ${Math.round(bottom)} > dock top ${Math.round(top)}` });
    window.scrollTo({ top: 0, behavior: "instant" });
    return out;
  });
}

const browser = await chromium.launch({ channel: "chrome" });
const jobs = [];
for (const lang of LANGS) for (const theme of THEMES) for (const width of WIDTHS) jobs.push({ lang, theme, width, zoom: 1 });
for (const lang of LANGS) for (const theme of THEMES) for (const width of ZOOM_WIDTHS) jobs.push({ lang, theme, width, zoom: 2 });

const unique = new Map(), allowedHits = [];
let total = 0, shots = 0;
async function runJob({ lang, theme, width, zoom }) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, locale: lang === "he" ? "he-IL" : "en-US" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: lang, url: BASE }]);
  const studioTheme = theme === "dark" ? "midnight" : "pearl";
  // Force the app's own theme the way its pre-paint script reads it (studio prefs in localStorage, the mirror and every per-profile copy).
  await ctx.addInitScript((studioTheme) => {
    try {
      const k = "shekel.budget-studio.v1";
      for (const key of [k, ...Object.keys(localStorage).filter((x) => x.startsWith(k))]) {
        const p = JSON.parse(localStorage.getItem(key) || "{}"); p.theme = studioTheme; localStorage.setItem(key, JSON.stringify(p));
      }
    } catch {}
  }, studioTheme);
  // The saved appearance from the server (loaded after a profile is picked) would win over localStorage: rewrite its theme in flight.
  // Read-only: preference writes never reach the server.
  await ctx.route(/\/api\/preferences/, async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ revision: 0 }) }).catch(() => {});
    if (!new URL(req.url()).searchParams.get("key")?.startsWith("studio")) return route.continue().catch(() => {});
    // A dev-server hiccup (ECONNRESET) must not crash the run: fall back to the forced theme alone.
    const res = await route.fetch().catch(() => null);
    const body = res ? await res.json().catch(() => ({ value: null, revision: 0 })) : { value: null, revision: 0 };
    body.value = { ...(body.value && typeof body.value === "object" ? body.value : {}), theme: studioTheme };
    return route.fulfill(res ? { response: res, json: body } : { json: body }).catch(() => {});
  });
  const p = await ctx.newPage();
  // Text zoom = the browser's default font size (Settings > Font size), so rem sizes and rem/em media queries both scale.
  if (zoom !== 1) await (await ctx.newCDPSession(p)).send("Page.setFontSizes", { fontSizes: { standard: 16 * zoom, fixed: 13 * zoom } });
  await p.goto(`${BASE}/profiles`, { waitUntil: "load" }).catch(() => {});
  const pick = p.getByRole("button").filter({ hasText: /./ }).first();
  if (p.url().includes("/profiles") && (await pick.count())) { await pick.click().catch(() => {}); await p.waitForTimeout(800); }
  for (const route of ROUTES) {
    await p.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(900); // let entrance transitions settle
    await p.evaluate(() => document.fonts.ready);
    let issues = [];
    // Guard: a config labelled dark must really render dark (and light, light).
    if ((await p.evaluate(() => document.documentElement.classList.contains("dark")).catch(() => null)) !== (theme === "dark"))
      issues.push({ type: "theme-not-applied", selector: "html", text: `expected ${theme}`, rect: { x: 0, y: 0, w: 10, h: 10 }, extra: "" });
    let ok = false;
    try { issues.push(...(await p.evaluate(audit)), ...(await dockCheck(p))); ok = true; }
    catch { await p.waitForTimeout(1500); } // a late client redirect/refresh can destroy the context once; retry below
    if (!ok) try { issues.push(...(await p.evaluate(audit)), ...(await dockCheck(p))); } catch (e) { issues.push({ type: "audit-error", selector: "", text: String(e).slice(0, 80), rect: { x: 0, y: 0, w: 10, h: 10 }, extra: "" }); }
    for (const i of issues) {
      Object.assign(i, { route, width, lang, theme, zoom });
      const a = allowed(i);
      if (a) { allowedHits.push({ ...i, reason: a.reason }); continue; }
      total++;
      const key = `${i.type}|${route}|${i.selector}|${i.text}`;
      const u = unique.get(key);
      if (u) { if (!u.combos.includes(`${width}/${lang}/${theme}${zoom > 1 ? "/zoom" : ""}`)) u.combos.push(`${width}/${lang}/${theme}${zoom > 1 ? "/zoom" : ""}`); continue; }
      i.combos = [`${width}/${lang}/${theme}${zoom > 1 ? "/zoom" : ""}`];
      if (shots < 400) {
        const file = `${String(++shots).padStart(3, "0")}-${i.type}.png`;
        const r = i.rect, pad = 24;
        const clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(width, r.w + pad * 2), height: Math.min(600, r.h + pad * 2) };
        if (i.type === "behind-dock") await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        if (clip.width > 2 && clip.height > 2 && clip.x < width) await p.screenshot({ path: join(OUT, file), clip, fullPage: i.type !== "behind-dock" }).then(() => (i.screenshot = file)).catch(() => {});
        if (i.type === "behind-dock") await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      }
      unique.set(key, i);
    }
  }
  await ctx.close();
  process.stdout.write(".");
}
const queue = [...jobs];
// One crashed config (dev-server hiccup, closed page) must not lose the whole run; retry it once.
const safeRun = async (job) => { try { await runJob(job); } catch (e) { if (!job.retried) { job.retried = true; return safeRun(job); } console.error(`config ${JSON.stringify(job)} failed: ${String(e.message).split(String.fromCharCode(10))[0]}`); } };
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await safeRun(queue.shift()); }));
await browser.close();

const list = [...unique.values()];
const byType = list.reduce((a, i) => ((a[i.type] = (a[i.type] ?? 0) + 1), a), {});
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, total, unique: list.length, byType, issues: list, allowlisted: allowedHits.map(({ rect: _rect, ...x }) => x) }, null, 2));
const lines = [`Text collision audit: ${list.length} unique issues (${total} occurrences) over ${jobs.length} configs x ${ROUTES.length} routes; ${allowedHits.length} allowlisted occurrences`, JSON.stringify(byType), ""];
for (const i of list.sort((a, b) => a.type.localeCompare(b.type) || a.route.localeCompare(b.route)))
  lines.push(`[${i.type}] ${i.route}  "${i.text}"\n   ${i.selector}\n   ${i.extra}\n   in ${i.combos.length} configs: ${i.combos.slice(0, 6).join(", ")}${i.combos.length > 6 ? " ..." : ""}${i.screenshot ? `\n   shot ${i.screenshot}` : ""}`);
writeFileSync(join(OUT, "summary.txt"), lines.join("\n"));
console.log(`\n${lines[0]}\n${lines[1]}\nReport: ${join(OUT, "summary.txt")}`);
process.exit(list.length ? 1 : 0);
