/**
 * The ingest schemas.
 *
 * `untrusted-text.ts` is deliberately NOT re-exported. It is reachable only as
 * `@assay/domain/untrusted-text`, which is the module path
 * `packages/engine` is forbidden to import (`DECISION_BRIEF.md §L.1` rule 3).
 * Re-exporting it here would route it through `@assay/domain`, which the engine
 * imports legitimately, and the ban would stop being enforceable.
 */

export {
  type UnixSeconds,
  type Sha256,
  paiseField,
  unixSecondsField,
  sha256Field,
  currencyField,
  countField,
  paymentIdField,
  orderIdField,
  refundIdField,
  settlementIdField,
  adjustmentIdField,
  disputeIdField,
  bankLineIdField,
  ledgerEntryIdField,
  observationIdField,
} from "./primitives.js";

export {
  type Payment,
  type Order,
  type Refund,
  type Settlement,
  type ReconLine,
  type BankStatementLine,
  type MerchantLedgerEntry,
  type Adjustment,
  type Dispute,
  PaymentSchema,
  OrderSchema,
  RefundSchema,
  SettlementSchema,
  ReconLineSchema,
  BankStatementLineSchema,
  MerchantLedgerEntrySchema,
  AdjustmentSchema,
  DisputeSchema,
  PAYMENT_METHODS,
  RECON_LINE_TYPES,
  CARD_NETWORKS,
  ADJUSTMENT_REASONS,
} from "./entities.js";

export {
  type Observation,
  type ObservationKind,
  type SourceSystem,
  ObservationSchema,
  ReconLinePayloadSchema,
  AdjustmentPayloadSchema,
  OBSERVATION_KINDS,
  SOURCE_SYSTEMS,
  KIND_SOURCE_SYSTEM,
  RECONCILABLE_KINDS,
  REFERENCE_KINDS,
  isReconcilableKind,
  isReferenceKind,
} from "./observation.js";

export {
  type InvariantViolation,
  checkPaymentInvariants,
  checkOrderInvariants,
  checkRefundInvariants,
  checkReconLineInvariants,
  gstIdentityHolds,
} from "./invariants.js";
