import { hasRazorpayPrefix, hasAssayPrefix } from "@assay/domain";

/**
 * Boundary 2, check 2 — the allowlist check (`ARCHITECTURE.md §4`).
 *
 * *"Any entity ID in the response must be a member of the allowlist passed in
 * that call. A reference to an ID that does not exist in the observation set is
 * a **hallucination event** — counted, logged, response discarded. This is the
 * structural defence against invented transaction IDs."*
 *
 * **This is not `I6`, and the difference is load-bearing.**
 * `DECISION_BRIEF.md §L.1` rule 8: *"Every LLM-referenced entity ID must exist
 * in the observation set (invariant `I6`), **independently of any allowlist
 * check**."* Two checks over one fact, on purpose — this one runs here and
 * discards the response; `I6` runs in `S5` and rejects the allocation. Neither
 * substitutes for the other, and this module does not claim to satisfy `I6`.
 *
 * `THREAT_MODEL.md §T3` is the threat: hallucinated transaction IDs.
 */

/** One id in a response that was not on the call's allowlist. */
export interface AllowlistViolation {
  readonly id: string;
  /** Where in the response the id appeared. */
  readonly path: string;
}

/** The outcome of the allowlist check over one parsed response. */
export type AllowlistCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "LLM_ALLOWLIST_REJECT";
      readonly violations: readonly AllowlistViolation[];
    };

/**
 * Whether a string is an **entity id** the allowlist governs.
 *
 * `§4` boundary 2 scopes the check to *"any entity ID in the response"*, not to
 * every string: `R1`'s `counterparty_hint` is a fragment of bank narration and
 * `R2`'s `analyst_question` is prose, and neither is an identifier. The test is
 * the frozen grammar itself — `DATA_MODEL.md §0` rule 3's documented Razorpay
 * prefixes plus ASSAY's internal ones — read from `@assay/domain` rather than
 * re-spelled here, so a new prefix cannot drift out of this check.
 */
export function isEntityIdShaped(value: string): boolean {
  return hasRazorpayPrefix(value) || hasAssayPrefix(value);
}

/**
 * Collect every entity-id-shaped string in a parsed response, with its path.
 *
 * Walks the whole value rather than named fields: a role schema added later
 * must not silently escape the check by putting its ids somewhere new.
 */
export function collectEntityIds(value: unknown, path = "$"): readonly AllowlistViolation[] {
  const out: AllowlistViolation[] = [];
  const visit = (node: unknown, at: string): void => {
    if (typeof node === "string") {
      if (isEntityIdShaped(node)) out.push({ id: node, path: at });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => {
        visit(child, `${at}[${String(i)}]`);
      });
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, child] of Object.entries(node)) visit(child, `${at}.${k}`);
    }
  };
  visit(value, path);
  return out;
}

/**
 * Check every entity id in `value` against `idAllowlist`.
 *
 * An **empty allowlist with ids present** is a violation, not a pass: `§4`
 * requires membership, and treating "nothing was allowed" as "everything is
 * allowed" would invert the control at exactly the call a caller forgot to
 * populate.
 */
export function checkAllowlist(value: unknown, idAllowlist: readonly string[]): AllowlistCheck {
  const allowed = new Set(idAllowlist);
  const violations = collectEntityIds(value).filter((v) => !allowed.has(v.id));
  if (violations.length === 0) return { ok: true };
  return { ok: false, reason: "LLM_ALLOWLIST_REJECT", violations };
}
