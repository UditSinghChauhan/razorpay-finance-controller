/**
 * Why an explanation attempt produced no explanation.
 *
 * One union rather than one per module, because the product requirement is a
 * single question — *what does the analyst see instead of an explanation?* —
 * and a code that only some layers can express is a code the UI has to guess
 * at. The three groups below are the three places an attempt can stop, and they
 * are meaningfully different to a reader:
 *
 * - **Configuration** — the server has no provider to call. Nothing was sent.
 *   A configuration code always names the variable the operator must change,
 *   because this is the one group whose remedy is entirely in their hands.
 * - **Transport** — the provider was called and did not answer usefully.
 *   `ARCHITECTURE.md §12`'s first row, split finely enough for a UI to say
 *   *"rate-limited"* rather than *"unavailable"*.
 * - **Verification** — the provider answered and `§4` boundary 2 discarded the
 *   answer. This is the system working, not failing, and the UI says so.
 *
 * In every case the deterministic decision is unchanged and is what the page
 * keeps showing. None of these is a reason to soften a certificate.
 */
export type ExplainFailureCode =
  // Configuration
  | "MISSING_CREDENTIAL"
  | "UNSUPPORTED_PROVIDER"
  | "INVALID_MODEL_ID"
  // Transport
  | "AUTHENTICATION"
  | "BAD_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  // Verification (ARCHITECTURE.md §4 boundary 2)
  | "MALFORMED_RESPONSE"
  | "UNGROUNDED_NUMERAL"
  | "UNKNOWN_ENTITY_ID";

/** One failure, in the shape the route reports and the page renders. */
export interface ExplainFailure {
  readonly code: ExplainFailureCode;
  /**
   * Safe to put on screen.
   *
   * `THREAT_MODEL.md §T11` keeps prompt text and configuration out of records;
   * the same rule governs an error string, which is a record a user reads. No
   * message in this codebase interpolates a key, a header, a base URL or a
   * prompt.
   */
  readonly message: string;
}
