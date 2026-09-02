/**
 * `@assay/domain` — the shared definition of ASSAY's domain.
 *
 * `ARCHITECTURE.md §3`: "One definition of truth for shapes and constraints,
 * shared by generator, engine, oracle and eval."
 *
 * The quarantined text store is deliberately NOT re-exported here. It is
 * reachable only through the `@assay/domain/untrusted-text` subpath, which
 * `packages/engine` is forbidden to import (`DECISION_BRIEF.md §L.1` rule 3).
 * Re-exporting it from the package root would make that ban unenforceable,
 * because the engine legitimately imports the rest of this package.
 */

export {
  type AccountCode,
  ACCOUNT_CODES,
  SUSPENSE_ACCOUNT,
  isAccountCode,
} from "./accounts.js";

export {
  type PaymentId,
  type OrderId,
  type RefundId,
  type SettlementId,
  type AdjustmentId,
  type DisputeId,
  type BankLineId,
  type LedgerEntryId,
  type ObservationId,
  ID_PREFIXES,
  isPaymentId,
  isOrderId,
  isRefundId,
  isSettlementId,
  isAdjustmentId,
  isDisputeId,
  isBankLineId,
  isLedgerEntryId,
  isObservationId,
  isSourceEntityId,
  hasRazorpayPrefix,
  hasAssayPrefix,
} from "./ids.js";

export { type CanonicalValue, canonicalJson } from "./canonical-json.js";

export {
  type ConstraintId,
  type ProvenanceClass,
  type AgentSideBinding,
  type ConstraintClause,
  type ConstraintDeclaration,
  type SettledAtNullRule,
  HARD_CONSTRAINTS,
  CONSTRAINT_IDS,
  SETTLED_AT_NULL_CONSTRAINTS,
  SETTLED_AT_NULL_RULE,
  canonicalConstraintSet,
  nonBindingClauses,
  conditionallyBindingClauses,
} from "./constraints.decl.js";

export {
  type InvariantId,
  INVARIANT_IDS,
  isInvariantId,
} from "./invariants.decl.js";

export * from "./schemas/index.js";
