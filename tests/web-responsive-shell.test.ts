import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The responsive shell, checked where it is actually decided.
 *
 * **Why this is a source test and not a rendering test.** `vitest.config.ts`
 * runs this workspace in `environment: "node"`, and `apps/web`'s component
 * suites render through `renderToStaticMarkup` — there is no layout engine
 * anywhere in the run, so nothing here can measure a box or observe an
 * overflow. What CAN be checked, and is, is the two places a responsive layout
 * is actually decided: the stylesheet that declares the breakpoints, and the
 * markup that either uses those classes or hard-codes a column count past
 * them. A page that inlines `gridTemplateColumns: "repeat(4, 1fr)"` is
 * unreachable by any media query, and that is a defect a string can see.
 *
 * It lives at the workspace level for the reason
 * `product-surface-boundaries.test.ts` does: it reads one app's source tree as
 * text, which is not something that package's own suite is set up to do —
 * `apps/web/tsconfig.json` declares `"types": []`, so `node:fs` does not
 * typecheck there.
 *
 * **The six widths are the ones the shell was verified at**: 1440, 1200, 1024,
 * 900, 768 and 480. For each, this file resolves which `@media (max-width: N)`
 * blocks apply and asserts the mode that results, so a breakpoint moved or
 * deleted fails here rather than on someone's laptop.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");
const CSS = readFileSync(join(WEB_SRC, "design-system.css"), "utf8");

/** The widths the shell is verified at, widest first. */
const VERIFIED_WIDTHS = [1440, 1200, 1024, 900, 768, 480] as const;

/**
 * Every `@media (max-width: N)` block in the stylesheet, as `[N, body]`.
 *
 * Brace-matched rather than regex-terminated: these blocks contain nested
 * rules, and a lazy `[\s\S]*?}` would end at the first inner brace and report
 * a block that is mostly missing.
 */
function maxWidthBlocks(css: string): { limit: number; body: string }[] {
  const blocks: { limit: number; body: string }[] = [];
  const open = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(css)) !== null) {
    const limitText = match[1];
    if (limitText === undefined) continue;
    let depth = 1;
    let i = open.lastIndex;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ limit: Number(limitText), body: css.slice(open.lastIndex, i - 1) });
  }
  return blocks;
}

const BLOCKS = maxWidthBlocks(CSS);

/**
 * Everything declared at one breakpoint, joined.
 *
 * There is deliberately more than one block per limit — the shell rules and
 * the layout rules are written next to the things they belong to rather than
 * merged into one giant query — so a lookup that took only the first match
 * would silently miss half of a breakpoint.
 */
function blockAt(limit: number): string {
  const bodies = BLOCKS.filter((b) => b.limit === limit).map((b) => b.body);
  return bodies.join("\n");
}

/** Everything that applies at one viewport width: the base rules plus each block whose limit it is within. */
function cssAt(width: number): string {
  const base = CSS.replace(/@media[\s\S]*$/, (tail) => tail.replace(/[\s\S]*/, ""));
  return [base, ...BLOCKS.filter((b) => width <= b.limit).map((b) => b.body)].join("\n");
}

/** The last declaration of one property to survive the cascade at this width. */
function resolved(width: number, property: string): string | null {
  const decls = [...cssAt(width).matchAll(new RegExp(`${property}\\s*:\\s*([^;}]+)`, "g"))];
  const last = decls.at(-1);
  return last?.[1]?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// The stylesheet declares three shell modes, and each verified width lands in one
// ---------------------------------------------------------------------------

describe("the stylesheet declares the breakpoints the shell is built on", () => {
  it("parses media blocks out of the stylesheet at all", () => {
    // Guards the degenerate case: every assertion below is vacuous if the
    // parser found nothing.
    expect(BLOCKS.length).toBeGreaterThan(0);
  });

  it("declares a rail breakpoint and a drawer breakpoint", () => {
    const limits = BLOCKS.map((b) => b.limit);
    expect(limits).toContain(1200);
    expect(limits).toContain(900);
  });

  it("contracts the sidebar to a rail at the medium breakpoint", () => {
    const rail = blockAt(1200);
    expect(rail).toContain("--sidebar-width: var(--sidebar-rail-width)");
    // Icon above a short label: the full label is hidden and the short one
    // takes its place, so the rail is legible rather than an icon guessing game.
    expect(rail).toContain(".sidebar-nav-label-full { display: none; }");
    expect(rail).toContain(".sidebar-nav-label-short {");
  });

  it("takes the sidebar out of flow and behind a menu button at the narrow breakpoint", () => {
    const drawer = blockAt(900);
    // Zero width in flow, off-canvas, and back on screen only when opened.
    expect(drawer).toContain("--sidebar-width: 0px");
    expect(drawer).toContain("transform: translateX(-100%)");
    expect(drawer).toContain('.app-sidebar[data-open="true"] { transform: translateX(0);');
    expect(drawer).toContain(".app-menu-button { display: inline-flex; }");
    expect(drawer).toContain('.app-scrim[data-open="true"] { display: block; }');
  });

  it("puts a closed drawer out of reach of the keyboard, not merely out of sight", () => {
    // `transform: translateX(-100%)` moves the sidebar off screen and does
    // nothing else: the five nav links stay in the tab order, so a keyboard
    // reviewer at 900px or below tabbed through an invisible menu before
    // reaching any page content, and a screen reader announced a navigation
    // the page was not offering. `visibility: hidden` is the one property
    // that removes an element from BOTH the tab order and the accessibility
    // tree, and it is what this asserts — the transform alone is not enough
    // and must never be allowed to become the whole of the rule again.
    const drawer = blockAt(900);
    expect(drawer).toContain("visibility: hidden;");
    expect(drawer).toContain(
      '.app-sidebar[data-open="true"] { transform: translateX(0); visibility: visible; }',
    );
  });

  it("leaves the sidebar reachable at every width where it is on screen", () => {
    // The closed-drawer rule is scoped to the drawer breakpoint. The rail and
    // the full sidebar are always visible, so hiding them from the keyboard
    // would remove the navigation outright rather than gate it behind a
    // control — the failure this asserts against.
    for (const width of VERIFIED_WIDTHS.filter((w) => w > 900)) {
      expect(resolved(width, "visibility"), `visibility at ${String(width)}px`).not.toBe("hidden");
    }
  });

  it("delays the drawer's disappearance until the slide-out has finished", () => {
    // `visibility` is a discrete property: transitioned alongside `transform`
    // it flips at the END of the animation, so the drawer slides away instead
    // of blanking mid-close.
    expect(blockAt(900)).toContain("transition: transform 180ms ease-out, visibility 180ms ease-out;");
  });

  it("hides the menu button and the scrim wherever the sidebar is in flow", () => {
    // Both are `display: none` in the base rules; only the drawer block turns
    // them on. A menu control beside a permanently visible menu is furniture.
    expect(CSS).toMatch(/\.app-menu-button \{\s*display: none;/);
    expect(CSS).toMatch(/\.app-scrim \{\s*display: none;/);
  });

  it.each(VERIFIED_WIDTHS)("resolves a defined sidebar mode at %ipx", (width) => {
    const sidebar = resolved(width, "--sidebar-width");
    expect(sidebar).not.toBeNull();
    const expected =
      width <= 900 ? "0px" : width <= 1200 ? "var(--sidebar-rail-width)" : "288px";
    expect(sidebar).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Content reflows rather than being clipped
// ---------------------------------------------------------------------------

describe("content reflows instead of overflowing the viewport", () => {
  it("collapses the four-across metric row twice on the way down", () => {
    expect(blockAt(1200)).toContain(
      ".grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
    );
    expect(blockAt(560)).toContain(
      ".grid-4 { grid-template-columns: minmax(0, 1fr); }",
    );
  });

  it("collapses two- and three-across rows to one column", () => {
    expect(blockAt(768)).toContain(
      ".grid-2, .grid-3 { grid-template-columns: minmax(0, 1fr); }",
    );
  });

  it("collapses the evidence split before either column is narrower than a hash", () => {
    expect(blockAt(1100)).toContain(
      ".split { grid-template-columns: minmax(0, 1fr);",
    );
  });

  it("gives every grid track a zero floor, so one long cell cannot widen the page", () => {
    // `1fr` floors at the content's intrinsic width; `minmax(0, 1fr)` does not.
    // A 64-hex string in one cell is exactly the content that exploits the
    // difference.
    expect(CSS).toContain(".grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }");
    expect(CSS).toContain(".grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }");
    expect(CSS).toContain(".grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }");
  });

  it("scrolls a wide table inside its own container rather than clipping it", () => {
    expect(CSS).toMatch(/\.scroll-x \{[^}]*overflow-x: auto;/);
    expect(CSS).toMatch(/\.scroll-x \{[^}]*max-width: 100%;/);
  });

  it("wraps identifiers at any character", () => {
    expect(CSS).toContain(".cell-id { overflow-wrap: anywhere;");
  });

  it("does NOT wrap an identifier inside a data table", () => {
    // A hash in a card has to wrap; the card is as wide as it is. A column is
    // different: the browser answers a squeezed column by breaking the value,
    // which rendered `setl_AMBIG0000000` over `00` at 1024px and over three
    // lines at 480px. The table scrolls locally instead — every `.data-table`
    // here is inside a `.scroll-x` with a `min-width` floor.
    expect(CSS).toContain(".data-table .cell-id { white-space: nowrap;");
  });

  it("gives the detail panel the full viewport once it would cover its own table", () => {
    expect(blockAt(768)).toContain(".detail-panel { width: 100vw;");
  });

  it("lets action rows wrap rather than pushing a button off the edge", () => {
    expect(CSS).toMatch(/\.actions \{[^}]*flex-wrap: wrap;/);
  });

  it("reduces page padding at narrow widths instead of shrinking the text", () => {
    // The type scale is touched once, at 560px, and only the display metric —
    // body copy stays at its designed size at every width.
    expect(blockAt(768)).toContain(".page { padding: var(--space-md); }");
    expect(blockAt(560)).toContain("--font-display-metric-size: 26px");
    for (const block of BLOCKS) {
      expect(block.body, `${String(block.limit)}px block`).not.toContain("--font-body-md-size");
      expect(block.body, `${String(block.limit)}px block`).not.toContain("--font-body-sm-size");
    }
  });
});

// ---------------------------------------------------------------------------
// The markup uses the breakpoints rather than reaching past them
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const FILES = sourceFiles(WEB_SRC);

/** Source with block and line comments removed, so prose cannot trip a check. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const name = (path: string): string => relative(WEB_SRC, path);

describe("no component hard-codes a column count past the breakpoints", () => {
  it("has source to check", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)("%s declares no fixed grid template inline", (path) => {
    const body = code(path);
    const inline = [...body.matchAll(/gridTemplateColumns:\s*"([^"]+)"/g)].map((m) => m[1] ?? "");
    for (const template of inline) {
      // `auto-fit`/`auto-fill` tracks are responsive by construction and stay.
      // Anything else — `repeat(4, 1fr)`, `1.2fr 1fr` — is a column count no
      // media query can reach, which is how the two-column pages lost a column
      // off the right edge of the viewport.
      expect(template, `${name(path)}: ${template}`).toMatch(/auto-fit|auto-fill/);
    }
  });

  it.each(FILES.filter((p) => code(p).includes("<table")))(
    "%s puts its table in a local scroll container",
    (path) => {
      expect(code(path), name(path)).toContain('className="scroll-x"');
    },
  );
});

/**
 * A truncated identifier's full text must not be recoverable from the DOM.
 *
 * `AuditLogs` abbreviates the recomputed and stored roots *only* while the
 * response reports them equal, and its own suite asserts that the full hash is
 * then absent from the markup. A copy affordance implemented as `title={value}`
 * or `data-value={value}` would put both hashes straight back — so the copy
 * control carries the value in its click handler and nowhere else, and this is
 * the check that keeps it that way.
 */
describe("copy affordances do not leak a truncated value into the document", () => {
  it("keeps the copied value out of every attribute", () => {
    const body = code(join(WEB_SRC, "components", "CopyId.tsx"));
    expect(body).toContain("onClick");
    expect(body).not.toMatch(/title=\{\s*value\s*\}/);
    expect(body).not.toMatch(/data-[a-z-]+=\{\s*value\s*\}/);
  });
});
