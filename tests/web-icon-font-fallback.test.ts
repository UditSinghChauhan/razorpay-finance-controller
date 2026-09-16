import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The icon font can fail to arrive, and the page must not print its ligatures.
 *
 * **The defect this file pins.** `apps/web/index.html` loads `Material Symbols
 * Outlined` from `fonts.googleapis.com` and nowhere else, and every icon is a
 * ligature: the span's text is the icon's NAME. When that request is refused —
 * corporate proxy, offline laptop, GDPR-blocked Google Fonts — the family is
 * never defined and the name renders as a word. The Command Center hero shows
 * "monitoring" at 72px, the sidebar reads dashboard / search_check /
 * receipt_long / workspace_premium / history_edu, and the primary button reads
 * "play_arrow Run Demo". Not degraded: broken.
 *
 * `apps/web/src/lib/icon-font.ts` measures the width of a probe ligature after
 * the fonts settle and stamps `data-icon-font` on `:root`; `design-system.css`
 * hides the icon spans under the `unavailable` verdict. This file asserts the
 * shape of that arrangement from the source text, because the properties that
 * make it safe — the probe that was rejected is not used, every uncertain path
 * resolves to "font is fine", the verdict is given once — are properties of
 * the code, not of any one rendered state, and a browser test that blocked the
 * font would prove the fallback fires without proving it cannot misfire.
 *
 * It lives at the workspace level for the reason `web-label-hierarchy.test.ts`
 * does: it reads one app's source tree as text, and `apps/web/tsconfig.json`
 * declares `"types": []`, so `node:fs` does not typecheck there.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const WEB_SRC = join(WEB, "src");

const INDEX_HTML = readFileSync(join(WEB, "index.html"), "utf8");
const CSS = readFileSync(join(WEB_SRC, "design-system.css"), "utf8");
const MAIN = readFileSync(join(WEB_SRC, "main.tsx"), "utf8");
const COMMAND_CENTER = readFileSync(join(WEB_SRC, "pages", "CommandCenter.tsx"), "utf8");
const GUARD_SOURCE = readFileSync(join(WEB_SRC, "lib", "icon-font.ts"), "utf8");

/**
 * The guard with block and line comments removed. Its docblock legitimately
 * names `fonts.check()` — to say why it is NOT used — so the assertion that the
 * broken probe is absent has to look at code, not prose.
 */
const GUARD_CODE = GUARD_SOURCE
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

/**
 * One rule body, brace-matched from its selector.
 *
 * Anchored to `"\n" + selector + " {"` deliberately: `.material-symbols-outlined`
 * is a substring of `.sidebar-nav-link .material-symbols-outlined`, which is
 * declared EARLIER in the stylesheet, so an unanchored `indexOf` returns the
 * sidebar's rule body and every assertion below reads the wrong rule.
 */
function rule(selector: string): string {
  const open = CSS.indexOf(`\n${selector} {`);
  expect(open, `${selector} is declared at the start of a line`).toBeGreaterThan(-1);
  const start = CSS.indexOf("{", open) + 1;
  return CSS.slice(start, CSS.indexOf("}", start));
}

/** A `const NAME = value;` literal from the guard's source. */
function constant(name: string): string {
  const match = new RegExp(`const ${name}\\s*=\\s*([^;]+);`).exec(GUARD_CODE);
  expect(match, `${name} is declared`).not.toBeNull();
  return (match?.[1] ?? "").trim();
}

// ---------------------------------------------------------------------------
// The premise: the icon font is third-party, and the icons are ligatures
// ---------------------------------------------------------------------------

describe("the premise still holds", () => {
  it("index.html loads Material Symbols from Google Fonts and nowhere else", () => {
    // If this stops being true — the font is self-hosted, or replaced with
    // SVGs — the guard is measuring for a failure that cannot happen and
    // should be revisited rather than left running.
    expect(INDEX_HTML).toContain("fonts.googleapis.com");
    expect(INDEX_HTML).toContain("Material+Symbols+Outlined");
    expect(INDEX_HTML).not.toMatch(/@font-face|\.woff2?/);
  });

  it("the Command Center still renders the `monitoring` ligature the probe measures", () => {
    expect(COMMAND_CENTER).toMatch(/className="material-symbols-outlined"[^>]*>monitoring</);
  });
});

// ---------------------------------------------------------------------------
// The guard is installed before anything renders
// ---------------------------------------------------------------------------

describe("main.tsx installs the guard first", () => {
  it("imports guardIconFont and calls it before the root is created", () => {
    expect(MAIN).toContain('from "./lib/icon-font.js"');
    // Compared against `createRoot(root)`, the CALL, not `createRoot`: the
    // identifier is imported on line 2 and would put the "before" test in the
    // import block, where it is trivially true and asserts nothing.
    const guard = MAIN.indexOf("guardIconFont();");
    const render = MAIN.indexOf("createRoot(root)");
    expect(guard).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(render);
  });
});

// ---------------------------------------------------------------------------
// The guard measures; it does not ask
// ---------------------------------------------------------------------------

describe("the guard measures a ligature's width", () => {
  it("does not use document.fonts.check(), which reports true for an undefined family", () => {
    // `check()` answers whether the text can be rendered without a pending
    // load; a browser that never heard of the family renders it with a
    // fallback and says yes. The docblock names it to say why it is absent,
    // so this reads the code with comments stripped.
    expect(GUARD_CODE).not.toContain("fonts.check");
  });

  it("reads the probe's laid-out width", () => {
    expect(GUARD_CODE).toContain("getBoundingClientRect");
    expect(constant("PROBE_TEXT")).toBe('"monitoring"');
  });

  it("probes at the size the stylesheet gives the icon class", () => {
    // A collapsed ligature is one glyph at the icon size; the threshold is
    // reasoned from that size, so the two must not drift apart.
    expect(constant("PROBE_PX")).toBe("20");
    expect(rule(".material-symbols-outlined")).toContain("font-size: 20px");
  });

  it("sits the threshold between one glyph and one word", () => {
    // ~20px collapsed, 88.9px uncollapsed (Chromium). 40 has ~2x either side.
    const max = Number(constant("LIGATURE_MAX_PX"));
    expect(max).toBeGreaterThan(20);
    expect(max).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// Every uncertain path assumes the font is fine
// ---------------------------------------------------------------------------

describe("the guard fails towards leaving the icons alone", () => {
  it("gives the safe verdict with no body, on a zero width, and on any exception", () => {
    expect(GUARD_CODE).toContain("if (!host) return true;");
    expect(GUARD_CODE).toMatch(/width === 0\)\s*return true;/);
    expect(GUARD_CODE).toMatch(/catch\s*(\([^)]*\))?\s*\{\s*return true;/);
    // And removes the probe whether or not the measurement threw.
    expect(GUARD_CODE).toMatch(/finally\s*\{\s*probe\.remove\(\);/);
  });
});

// ---------------------------------------------------------------------------
// The verdict is given once, by whichever route fires first
// ---------------------------------------------------------------------------

describe("the guard decides once", () => {
  it("settles from fonts.ready AND from a timer, after asking for the face", () => {
    // Two routes to one decision: a browser without the `fonts` API, or a
    // `ready` that never resolves, still gets one. A rejected `ready` is a
    // browser that has stopped waiting, so both arms settle.
    expect(GUARD_CODE).toContain("fonts.ready");
    expect(GUARD_CODE).toContain(".then(settle, settle)");
    expect(GUARD_CODE).toContain("setTimeout(settle, SETTLE_MS)");
    // The load is requested before it is awaited. The guard runs before the
    // first render, when nothing uses the family and `ready` would resolve at
    // once — the first version measured the fallback face in that tick and hid
    // every icon on a page whose font arrived 300ms later. `fonts.load` starts
    // the request (it is not `fonts.check`, which only reports).
    expect(GUARD_CODE).toContain("doc.fonts.load(");
    // And an uncollapsed reading while a face is still in flight is an early
    // reading, not a verdict: re-arm, do not commit.
    expect(GUARD_CODE).toContain('doc.fonts.status === "loading"');
  });

  it("is monotonic — the first verdict is the only verdict", () => {
    expect(GUARD_CODE).toContain("if (resolved) return;");
  });
});

// ---------------------------------------------------------------------------
// The probe is not subject to the rule it triggers
// ---------------------------------------------------------------------------

describe("the probe is styled inline", () => {
  it("sets its style through cssText, not through the icon class", () => {
    // The class would make the measurement depend on stylesheet injection
    // order, and would put the probe under the very rule its verdict switches.
    expect(GUARD_CODE).toContain("probe.style.cssText");
    expect(GUARD_CODE).toContain("font-family:'Material Symbols Outlined'");
    expect(GUARD_CODE).not.toContain("probe.className");
    expect(GUARD_CODE).not.toContain("material-symbols-outlined");
  });
});

// ---------------------------------------------------------------------------
// The stylesheet hides the word without moving the layout
// ---------------------------------------------------------------------------

describe("the fallback rule keeps the glyph's box", () => {
  it("uses visibility: hidden, not display: none, under the unavailable verdict only", () => {
    // The two states must be identical in layout: a button the same width, a
    // KPI label slot the same height. `display: none` would collapse the box
    // and the page would reflow depending on whether a third-party request
    // succeeded.
    const body = rule(':root[data-icon-font="unavailable"] .material-symbols-outlined');
    expect(body).toContain("visibility: hidden");
    expect(body).not.toContain("display: none");
    // The icon class itself stays exactly as it was, so the ready state
    // renders as before the guard existed.
    const icon = rule(".material-symbols-outlined");
    expect(icon).toContain("font-family: 'Material Symbols Outlined'");
    expect(icon).toContain("display: inline-block");
    expect(icon).not.toContain("visibility");
  });
});
