import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Four ranks of label, checked where the rank is actually decided.
 *
 * **The defect this file pins.** `apps/web` had one caps class and used it for
 * two different jobs. `CLOSE GATES` titled a card and `STATE` labelled a field
 * inside one, and both rendered at 11px, weight 600, `--color-on-surface-variant`
 * and 0.05em — identical in every property a reader can see. A page whose
 * headings and row labels carry the same rank carries no rank: the reviewer has
 * to read both strings to find out which one was the heading, on every card.
 *
 * `.font-label-section` is the fix and it is deliberately small — weight,
 * colour and tracking on top of the existing caps token. **No size moves.** The
 * assertions below are what keeps it that way, because the obvious "fix" for a
 * flat hierarchy is a second type scale, and that is the change this project
 * does not want.
 *
 * It lives at the workspace level for the reason `web-responsive-shell.test.ts`
 * does: it reads one app's source tree as text, and `apps/web/tsconfig.json`
 * declares `"types": []`, so `node:fs` does not typecheck there.
 */

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps", "web", "src");
const CSS = readFileSync(join(WEB_SRC, "design-system.css"), "utf8");

/** One class body, brace-matched from its selector. */
function rule(selector: string): string {
  const open = CSS.indexOf(`${selector} {`);
  expect(open, `${selector} is declared`).toBeGreaterThan(-1);
  const start = CSS.indexOf("{", open) + 1;
  return CSS.slice(start, CSS.indexOf("}", start));
}

/** A `--token: value;` declaration from `:root`. */
function token(name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(CSS);
  expect(match, `${name} is declared`).not.toBeNull();
  return (match?.[1] ?? "").trim();
}

// ---------------------------------------------------------------------------
// The stylesheet declares a section rank, and it is not a second type scale
// ---------------------------------------------------------------------------

describe("the section rank is weight, colour and tracking — never size", () => {
  it("declares the modifier at all", () => {
    const body = rule(".font-label-section");
    expect(body).toContain("font-weight");
    expect(body).toContain("letter-spacing");
    expect(body).toContain("color");
  });

  it("sets no font-size, so 11px stays 11px", () => {
    // The whole point. A section rank bought with a larger label would undo
    // the targeted 11px fixes and inflate every card heading on every page.
    expect(rule(".font-label-section")).not.toContain("font-size");
  });

  it("leaves the caps token itself untouched", () => {
    expect(token("--font-label-caps-size")).toBe("11px");
    expect(token("--font-label-caps-weight")).toBe("600");
    expect(token("--font-label-caps-line-height")).toBe("16px");
  });

  it("outranks the field label on weight and tracking", () => {
    // The ordering is the assertion: a modifier that landed at or below the
    // base label would restate the defect in a new class.
    const sectionWeight = Number(token("--font-label-section-weight"));
    const fieldWeight = Number(token("--font-label-caps-weight"));
    expect(sectionWeight).toBeGreaterThan(fieldWeight);

    const em = (v: string): number => Number(v.replace("em", ""));
    expect(em(token("--font-label-section-letter-spacing"))).toBeGreaterThan(
      em(token("--font-label-caps-letter-spacing")),
    );
  });

  it("changes no other rank in the scale", () => {
    // SECTION and VALUE are the ranks either side of the two this touches.
    expect(token("--font-headline-sm-size")).toBe("18px");
    expect(token("--font-body-md-size")).toBe("14px");
    expect(token("--font-body-sm-size")).toBe("13px");
    expect(token("--font-numeric-mono-size")).toBe("14px");
  });

  it("keeps one typeface", () => {
    expect(rule(".font-label-section")).not.toContain("font-family");
  });
});

// ---------------------------------------------------------------------------
// The markup uses the two ranks as two ranks
// ---------------------------------------------------------------------------

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

const FILES = sourceFiles(WEB_SRC);
const name = (path: string): string => relative(WEB_SRC, path);
const body = (path: string): string => readFileSync(path, "utf8");

describe("a section label and a field label are told apart in the markup", () => {
  it("has source to check", () => {
    expect(FILES.length).toBeGreaterThan(0);
  });

  it.each(FILES)("%s never combines the section rank with the field colour", (path) => {
    // `.text-muted` is declared later in the stylesheet and would win the
    // colour, silently returning a section heading to the field rank — the one
    // distinction the modifier exists to make.
    const source = body(path);
    expect(source, name(path)).not.toMatch(/font-label-section[^"]*text-muted/);
    expect(source, name(path)).not.toMatch(/text-muted[^"]*font-label-section/);
  });

  it.each(FILES)("%s always uses the modifier on top of the caps class", (path) => {
    // It is a modifier, not a class of its own: alone it would inherit the
    // body size and lose the uppercase transform.
    for (const [, classes] of body(path).matchAll(/className="([^"]*font-label-section[^"]*)"/g)) {
      expect(classes, `${name(path)}: ${classes ?? ""}`).toContain("font-label-caps");
    }
  });

  it("promotes the card and panel headings on every page that has one", () => {
    // One per page at minimum. A page where every caps string stayed at the
    // field rank is a page the fix did not reach.
    const promoted = FILES.filter((p) => body(p).includes("font-label-section")).map(name);
    for (const page of [
      "pages/CommandCenter.tsx",
      "pages/InvestigationQueue.tsx",
      "pages/AmbiguityCertificate.tsx",
      "pages/EvidenceTrail.tsx",
      "pages/AuditLogs.tsx",
      "components/ControllerPanel.tsx",
    ]) {
      expect(promoted).toContain(page);
    }
  });

  it("leaves the field labels at the field rank", () => {
    // The other half of a hierarchy: promoting everything is the same as
    // promoting nothing. These are row labels beside a value, and they stay.
    const trail = body(join(WEB_SRC, "pages", "EvidenceTrail.tsx"));
    for (const label of ["Evidence Gap", "Epsilon", "Materiality", "Tau", "Actor"]) {
      const line = trail.split("\n").find((l) => l.includes(`>${label}<`));
      expect(line, label).toBeDefined();
      expect(line, label).toContain("font-label-caps text-muted");
    }
  });

  it("does not undo the targeted 11px labels", () => {
    // Three labels were pinned at 11px by an earlier fix, against a rule that
    // would otherwise have shrunk them. A hierarchy change must not reach them.
    const controller = body(join(WEB_SRC, "components", "ControllerPanel.tsx"));
    expect([...controller.matchAll(/fontSize:\s*11\b/g)].length).toBeGreaterThanOrEqual(3);
  });
});
