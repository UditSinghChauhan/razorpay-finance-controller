/**
 * `@assay/money` — branded integer-paise primitives.
 *
 * The public surface is deliberately small: the type, its constructor, the
 * range constants, the four arithmetic operations `ARCHITECTURE.md §3` names,
 * the two summation helpers the specification's own formulae require, and the
 * normative half-up rounding rule. Internal helpers are not re-exported.
 */

export {
  type Paise,
  MAX_PAISE,
  MIN_PAISE,
  ZERO_PAISE,
  isPaise,
  paise,
} from "./paise.js";

export { add, sub, abs, sum, split, allocate } from "./ops.js";

export { roundHalfUp } from "./round.js";
