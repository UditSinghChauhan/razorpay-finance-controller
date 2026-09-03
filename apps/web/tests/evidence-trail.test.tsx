import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActorLine } from "../src/pages/EvidenceTrail.js";
import { formatActor } from "../src/lib/format.js";
import { DECISION_DETAIL } from "./fixtures.js";

/**
 * The Evidence Trail's actor line — F4.
 *
 * `DATA_MODEL.md §16`'s actor block has `type` and `component` and no `id`, so
 * the panel must show the component and must not display an identifier the
 * record does not carry.
 */

describe("ledger event actor", () => {
  const actor = DECISION_DETAIL.event?.actor;

  it("renders type and component", () => {
    expect(actor).toBeDefined();
    if (actor === undefined) return;
    const html = renderToStaticMarkup(<ActorLine actor={actor} />);
    expect(html).toContain("deterministic / engine.s5_validate");
  });

  it("renders no actor id, because the record has none", () => {
    expect(actor).toBeDefined();
    if (actor === undefined) return;
    expect(actor).not.toHaveProperty("id");
    const html = renderToStaticMarkup(<ActorLine actor={actor} />);
    expect(html).not.toMatch(/undefined/);
  });

  it("formats the two fields and nothing else", () => {
    expect(
      formatActor({ type: "deterministic", component: "engine.s5_validate" }),
    ).toBe("deterministic / engine.s5_validate");
  });
});
