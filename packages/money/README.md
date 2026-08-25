# `@assay/money`

Branded integer-paise primitives. Every rupee in ASSAY passes through this
package, and `THREAT_MODEL.md §4` names a bug here as the first thing that would
break the system's entire security argument — the invariants, the trial balance
and the hash chain all reduce to the correctness of this arithmetic.

## What this package guarantees

1. **All money is an exact integer number of paise.** `Paise` is
   `number & { readonly __paise: unique symbol }`, exactly as `DATA_MODEL.md §0`
   rule 1 defines it. A bare `number` is not assignable to `Paise`, so a float
   in a money position is a compile error rather than a review comment
   (`ARCHITECTURE.md §3`).
2. **No floating point anywhere, including intermediates.** Division is never
   performed on a money value directly. `roundHalfUp` takes a rational as its
   two integer terms and returns the rounded integer, so no caller ever holds a
   fractional value (`DECISION_BRIEF.md §L.1` rule 1).
3. **Nothing outside the safe-integer range is admitted.** Invariant `I7`
   forbids any `Paise` outside it; every constructor and every operation
   validates, and overflow throws instead of silently losing precision.
4. **Conservation.** `split` and `allocate` return parts that sum to exactly
   their input, for positive and negative totals alike. No paisa is created and
   none is lost.
5. **Determinism.** No `Date`, no `Math.random`, no `Intl`, no locale-dependent
   formatting, no I/O, no environment access and no mutable module state. The
   same inputs always produce the same outputs — the precondition for the
   byte-identical ledger root hash that metric 23 and invariant `I9` require.
   ESLint enforces the prohibited globals for this package.

## Public API

| Export | Meaning |
|---|---|
| `Paise` | The branded integer-paise type. |
| `paise(n)` | The only admitting constructor. Throws `RangeError` on a non-integer, an unsafe magnitude, `NaN` or `±Infinity`. |
| `isPaise(n)` | Whether `n` would be admitted. |
| `MAX_PAISE` / `MIN_PAISE` / `ZERO_PAISE` | Range bounds and zero. |
| `add(a, b)` / `sub(a, b)` | Checked sum and difference. |
| `abs(a)` | Magnitude, as gate `G3`'s gross `Σ \|item_net_paise\|` requires. |
| `sum(values)` | Total of a list; the empty list is zero. Every partial sum is range-checked. |
| `split(total, parts)` | Divide into `parts` amounts summing to `total`. |
| `allocate(total, weights)` | Divide in proportion to integer weights, summing to `total`. |
| `roundHalfUp(numerator, denominator)` | The normative rounding rule. |

Internal helpers (`assertPaise`, `floorDivMod`) are deliberately not exported; a
test asserts the surface above is exactly what the entry point exposes.

## Rounding

The mode is **half-up**, frozen by `PREREGISTRATION.md §4.2` and documented as an
ASSAY modelling assumption (`DATA_MODEL.md §22.2` M1) because Razorpay publishes
no rounding mode. An exact half rounds away from zero: `0.5 → 1`, `2.5 → 3`.
This is neither `Math.round` (which rounds halves toward `+∞`) nor banker's
rounding.

The specification's formulae map directly onto the signature:

```ts
const feeExGst = roundHalfUp(amount * rateBps, 10_000);
const tax = roundHalfUp(feeExGst * 1800, 10_000);
const closeThreshold = roundHalfUp(batchValuePaise * 5, 1000);
```

**Negative numerators are rejected.** Every rounding site in spec v1.3.0 is
non-negative, and "half-up" is ambiguous for negatives in a way the
specification never resolves. Throwing is the only behaviour that cannot
silently pick a direction the specification did not choose.

## Allocation

`allocate` uses the **largest-remainder rule**: each entry receives
`floor(|total| × wᵢ / Σw)`, and the leftover paise are handed out one each by
descending exact remainder, **ties broken by ascending index**. Because the
leftover count is strictly below the number of weights, no entry ever gains more
than one extra paisa. `split(total, n)` is `allocate(total, [1, …, 1])` and the
two agree by construction.

Weights are non-negative integers, not fractions, because floating point is
banned including in intermediates — a proportion is expressed as an integer
ratio such as basis points.

> Spec v1.3.0 requires `allocate` to exist and to conserve (`T0-1`,
> `ARCHITECTURE.md §3`) but does not state how leftover paise are distributed.
> The rule above is this package's documented contract, not a quotation from the
> specification.

## Errors

Every rejection throws `RangeError` with a deterministic message naming the
operation. Nothing is coerced, truncated, rounded, clamped or returned as `NaN`
or `Infinity`. The specification does not prescribe an error class; a single
standard one is used rather than a bespoke hierarchy.

## Serialization

None is provided, and none is required. A `Paise` is an integer `number` at
runtime, so it serializes as a JSON integer with no conversion and stores in a
SQLite `INTEGER` column directly. Canonical JSON for hashing belongs to
`packages/domain` (`DATA_MODEL.md §0` rule 5). Formatting for display happens at
render only.
