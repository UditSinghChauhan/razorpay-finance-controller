/**
 * `node scripts/predict-bench-v2-md.mjs` — the prediction interval for bench-v2
 * metric M-D (`docs/BENCH_V2_PREREGISTRATION.md §5`), reproducible.
 *
 * **Reads the frozen amount table and nothing else.** No dataset is generated,
 * no agent runs, nothing is scored: the inputs are
 * `packages/generator/src/amount-table.ts`'s 2,048 atoms, the fee arithmetic of
 * `amount.ts` (`round_half_up` on `amount × rate`, GST 18 % on the fee), and the
 * construction's coins as `docs/BENCH_V2_DESIGN.md §C` observed them at test
 * seeds:
 *
 * ```
 *   per block-P seed   A01 3 pairs · A02 3 pairs · A04 3 pairs (S1 only is documented-TA)
 *   per block-S seed   A01 3 pairs
 *   A2-NOABSTAIN commits exactly one target of each coupled pair; the other fails I2 (E05)
 *   A04: the committed target is S1 (TA) with probability 1/2, else S2 (D, not in M-D)
 *   the committed allocation is the wrong one with probability 1/2 (the twin-batch coin)
 *   A01/A04 wrong value: the other twin's gross — A (200 bps, credit >= Rs 9,000) or B (300 bps, same credit), 1/2 each
 *   A02: the engine's best is the refund-carrying {P2, R1} on BOTH targets of a pair (§C.2 finding),
 *        so A2 is wrong exactly when P's target posts first (1/2), and the wrong value is amount(P2) + R
 * ```
 *
 * The RNG is a fixed-seed xorshift128+ for this model only — not the
 * generator's — so the printed interval is identical on every run.
 *
 * Plain `.mjs`, `scripts/`'s convention: `process` imported, output through
 * `process.stdout.write`.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

const TABLE = "packages/generator/src/amount-table.ts";
const DRAWS = 200_000;
const SEEDS_PER_BLOCK = 5;

const src = readFileSync(TABLE, "utf8");
const start = src.indexOf("Object.freeze([", src.indexOf("export const AMOUNT_QUANTILES")) + "Object.freeze(".length;
const atoms = (src.slice(start, src.indexOf("]", start)).match(/\d[\d_]*/g) ?? []).map((s) => Number(s.replaceAll("_", "")));
if (atoms.length !== 2048) throw new Error(`expected 2048 atoms in ${TABLE}, read ${String(atoms.length)}`);

/** `round_half_up(num / den)` for non-negative integers. */
const rhu = (num, den) => Math.floor((2 * num + den) / (2 * den));
const fee = (amount, rate) => {
  const ex = rhu(amount * rate, 10_000);
  return ex + rhu(ex * 1_800, 10_000);
};
const credit = (amount, rate) => amount - fee(amount, rate);
function amountForCredit(c, rate) {
  const keep = 10_000 * 10_000 - rate * (10_000 + 1_800);
  const centre = Math.floor((c * 1e8) / keep);
  for (let a = centre - 4; a <= centre + 4; a += 1) if (a > 0 && credit(a, rate) === c) return a;
  throw new Error(`amountForCredit: no gross nets ${String(c)} at ${String(rate)} bps`);
}
/** `AMB1_MIN_CREDIT_PAISE` = 900,000 at twin A's 200 bps. */
const amb1 = atoms.filter((a) => credit(a, 200) >= 900_000);

let s0 = 0x9e3779b97f4a7c15n;
let s1 = 0xbf58476d1ce4e5b9n;
const MASK = (1n << 64n) - 1n;
function next() {
  let x = s0;
  const y = s1;
  s0 = y;
  x ^= (x << 23n) & MASK;
  s1 = x ^ y ^ (x >> 17n) ^ (y >> 26n);
  return Number(((s1 + y) & MASK) >> 11n) / 2 ** 53;
}
const below = (n) => Math.floor(next() * n);
const coin = () => next() < 0.5;

/** One coupled AMB-1-shaped pair: the wrong value if A2's commit is wrong, else 0. */
function twinPair(tally) {
  const a = amb1[below(amb1.length)];
  const b = amountForCredit(credit(a, 200), 300);
  if (coin()) {
    tally.wrong += 1;
    tally.paise += coin() ? a : b;
  }
}

function blockP() {
  const t = { paise: 0, wrong: 0, committed: 0, excepted: 0 };
  for (let seed = 0; seed < SEEDS_PER_BLOCK; seed += 1) {
    for (let p = 0; p < 3; p += 1) { t.committed += 1; t.excepted += 1; twinPair(t); } // A01
    for (let p = 0; p < 3; p += 1) { // A02
      t.committed += 1;
      t.excepted += 1;
      const aP = atoms[below(atoms.length)];
      const cP = credit(aP, 200);
      const r = Math.max(25_000, rhu(cP * 500, 10_000));
      const aP2 = amountForCredit(cP + r, 200);
      if (coin()) { t.wrong += 1; t.paise += aP2 + r; }
    }
    for (let p = 0; p < 3; p += 1) { // A04 S1
      if (coin()) { t.committed += 1; twinPair(t); } else { t.excepted += 1; next(); next(); next(); }
    }
  }
  return t;
}

function blockS() {
  const t = { paise: 0, wrong: 0, committed: 0, excepted: 0 };
  for (let k = 0; k < 3 * SEEDS_PER_BLOCK; k += 1) { t.committed += 1; t.excepted += 1; twinPair(t); }
  return t;
}

const sample = (fn) => Array.from({ length: DRAWS }, fn);
const quantile = (xs, p) => [...xs].sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const out = (line) => process.stdout.write(`${line}\n`);

out(`frozen table: ${String(atoms.length)} atoms; AMB-1-admitted ${String(amb1.length)}; draws ${String(DRAWS)}`);
for (const [name, fn] of [["P", blockP], ["S", blockS]]) {
  const runs = sample(fn);
  const value = runs.map((r) => r.paise);
  const rate = runs.map((r) => r.wrong / r.committed);
  out(
    `block ${name}  value paise  median ${String(quantile(value, 0.5))}  p2.5 ${String(quantile(value, 0.025))}  p97.5 ${String(quantile(value, 0.975))}` +
      `  |  rate median ${quantile(rate, 0.5).toFixed(3)}  p2.5 ${quantile(rate, 0.025).toFixed(3)}  p97.5 ${quantile(rate, 0.975).toFixed(3)}` +
      `  |  excepted median ${String(quantile(runs.map((r) => r.excepted), 0.5))}`,
  );
}
