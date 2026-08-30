/**
 * The generator's entry point: one family instance at one seed.
 *
 * Four stages, in the order `PREREGISTRATION.md §3`'s diagram fixes:
 *
 *     simulate  -> TRUE STATE            (simulate.ts)
 *     journal   -> true_journal          (truth-journal.ts, §17.1/§17.2 truth side)
 *     emit      -> OBSERVATIONS + text   (emit.ts, incl. F05's withholding)
 *     degrade   -> degraded observations (degrade.ts, observations only)
 *
 * A fifth artifact hangs off the first stage rather than the last:
 *
 *     recon report -> §6.2's probe surface (recon-report.ts, from TRUE STATE)
 *
 * It is deliberately **not** downstream of `emit` or `degrade` —
 * `RECONCILIATION_SPEC.md §6.2` requires it to hold a row `F05` withheld from
 * the observations, and to keep a `settlement_id` `F08` nulled on them.
 *
 * `§3` rule 2: "Ground truth is never authored as an annotation. There is no
 * `correct_answer` field written by a human or a model. There is no
 * `is_ambiguous` label." Everything in `GroundTruth` below is a byproduct of the
 * simulation's own bookkeeping.
 *
 * **This module writes no file and produces no dataset artifact.** Persisting a
 * split is `apps/cli`'s `assay generate`, which is deliberately not part of this
 * package: `PREREGISTRATION.md §9` sequences generation after the seal tag, and
 * `§6.1` forbids invoking `--split test` before it.
 */

import type { AccountCode } from "@assay/domain";
import type { Observation } from "@assay/domain";
import type { UntrustedText } from "@assay/domain/untrusted-text";
import { paise, sub, sum, type Paise } from "@assay/money";

import { TARGET_RECORD_COUNT } from "./composition.js";
import { degrade, type DegradationRecord } from "./degrade.js";
import { emit } from "./emit.js";
import { GT_VERSION, HELD_OUT_FAMILIES, type FamilyId } from "./frozen.js";
import { buildReconReport, type ReconReportRow } from "./recon-report.js";
import { isDeclaredSeed } from "./seeds.js";
import { simulate, type TrueState } from "./simulate.js";
import {
  buildTrueJournal, projectTrueBalances, trialBalance, type TrueJournalLine,
} from "./truth-journal.js";

/** `DATA_MODEL.md §1`. Never visible to the engine or the oracle (`AL1`, `AL2`). */
export interface GroundTruth {
  readonly gt_version: string;
  readonly seed: number;
  readonly family_id: FamilyId;
  readonly allocations: readonly {
    readonly settlement_id: string;
    readonly entity_id: string;
    readonly entity_type: "payment" | "refund" | "adjustment";
    readonly gross_paise: Paise;
    readonly fee_paise: Paise;
    readonly tax_paise: Paise;
    readonly net_paise: Paise;
  }[];
  readonly bank_mappings: readonly { readonly bank_line_id: string; readonly settlement_ids: readonly string[] }[];
  readonly ledger_mappings: readonly { readonly ledger_entry_id: string; readonly payment_id: string | null }[];
  readonly true_journal: readonly TrueJournalLine[];
  readonly true_balances: Readonly<Record<AccountCode, Paise>>;
  readonly degradations: readonly DegradationRecord[];
}

/** One generated family instance. */
export interface GeneratedFamily {
  readonly family_id: FamilyId;
  readonly seed: number;
  readonly observations: readonly Observation[];
  readonly untrusted_text: readonly UntrustedText[];
  readonly ground_truth: GroundTruth;
  /**
   * `RECONCILIATION_SPEC.md §6.2`'s PG-side recon report, as rows.
   *
   * Persisted by `apps/cli` as `bench/<split>/recon_report.jsonl`, which is why
   * this is **data and not bytes**: `ARCHITECTURE.md §3` gives that app all
   * filesystem I/O, and its `encodeJsonl` already serializes every other
   * artifact — *"the ordering that matters is the ordering the producing
   * package chose"*, and `recon-report.ts` chose it.
   *
   * Not derived from `observations` and not derivable from them: it is
   * pre-`F05` and pre-operator by construction. See `recon-report.ts`.
   */
  readonly recon_report: readonly ReconReportRow[];
  /** The true state, for the generator's own tests. Never persisted. */
  readonly true_state: TrueState;
}

export interface GenerateOptions {
  /**
   * Permit a seed that `PREREGISTRATION.md §6.1` names in its split table.
   *
   * Off by default. `§6.1`'s permitted list requires a held-out family's tests to
   * run "under a seed that appears in **no** row of the split table", and `AL7`
   * burns a seed on any breach. A caller that genuinely means to build a split —
   * `apps/cli`'s `assay generate` at seal time — passes this explicitly.
   */
  readonly allow_declared_seed?: boolean;
}

export function generateFamily(family: FamilyId, seed: number, options: GenerateOptions = {}): GeneratedFamily {
  if (isDeclaredSeed(seed) && options.allow_declared_seed !== true) {
    throw new Error(
      `generateFamily: ${String(seed)} is a declared §6.1 split seed. Generating a family instance ` +
        `at one requires allow_declared_seed, because §6.1's permitted list for held-out families ` +
        `requires their tests to run "under a seed that appears in no row of the split table", and ` +
        `AL7 burns a seed on any breach of the forbidden list.` +
        (HELD_OUT_FAMILIES.includes(family as (typeof HELD_OUT_FAMILIES)[number])
          ? ` ${family} is held out until the seal.`
          : ""),
    );
  }

  const state = simulate(family, seed);
  const journal = buildTrueJournal(state);
  const emission = emit(state);
  const degraded = degrade(emission, family, seed);

  const balance = trialBalance(journal);
  if (balance.dr !== balance.cr) {
    /* c8 ignore next 4 */
    throw new Error(
      `generateFamily: true_journal violates I1 — Sigma dr ${String(balance.dr)} != Sigma cr ` +
        `${String(balance.cr)}. "A ledger that does not balance is not a ledger."`,
    );
  }

  const expected = TARGET_RECORD_COUNT[family];
  if (degraded.observations.length !== expected) {
    throw new Error(
      `generateFamily: ${family} emitted ${String(degraded.observations.length)} observations against ` +
        `PREREGISTRATION.md §4.1's frozen target_record_count of ${String(expected)}. A composition ` +
        `differing from the declared one is a SEAL FAILURE (§9 step 5).`,
    );
  }

  return Object.freeze({
    family_id: family,
    seed,
    observations: degraded.observations,
    untrusted_text: degraded.untrusted_text,
    ground_truth: buildGroundTruth(state, journal, degraded.degradations),
    // `state`, not `emission` and not `degraded`: §6.2's report holds the F05
    // row the observations do not, and keeps the `settlement_id` F08 nulled.
    recon_report: buildReconReport(state),
    true_state: state,
  });
}

function buildGroundTruth(
  state: TrueState,
  journal: readonly TrueJournalLine[],
  degradations: readonly DegradationRecord[],
): GroundTruth {
  const allocations: GroundTruth["allocations"] = state.settlements.flatMap((settlement) =>
    settlement.members.map((member) => {
      if (member.kind === "payment") {
        const payment = state.payments[member.index];
        /* c8 ignore next */
        if (payment?.fee == null) throw new Error("ground truth: a settled payment carries no fee");
        return {
          settlement_id: settlement.id, entity_id: payment.id, entity_type: "payment" as const,
          gross_paise: payment.amount, fee_paise: payment.fee.fee, tax_paise: payment.fee.tax,
          net_paise: payment.fee.credit,
        };
      }
      if (member.kind === "refund") {
        const refund = state.refunds[member.index];
        /* c8 ignore next */
        if (refund === undefined) throw new Error("ground truth: unknown refund");
        return {
          settlement_id: settlement.id, entity_id: refund.id, entity_type: "refund" as const,
          // I3 fixes `debit = amount, credit = 0, fee = tax = 0` on a refund row.
          // `net_paise` is the "credit - debit contribution", which is negative
          // here; §1's trailing "= gross - fee" is written for the payment case
          // and does not hold for a refund. See README, "Specification seams".
          gross_paise: refund.amount, fee_paise: paise(0), tax_paise: paise(0),
          net_paise: paise(-refund.amount),
        };
      }
      const adjustment = state.adjustments[member.index];
      /* c8 ignore next */
      if (adjustment === undefined) throw new Error("ground truth: unknown adjustment");
      return {
        settlement_id: settlement.id, entity_id: adjustment.id, entity_type: "adjustment" as const,
        gross_paise: adjustment.amount, fee_paise: paise(0), tax_paise: paise(0),
        net_paise: paise(adjustment.direction === "credit" ? adjustment.amount : -adjustment.amount),
      };
    }),
  );

  // I4, checked here rather than asserted elsewhere: a settlement closes at
  // exactly the sum of the net contributions of the lines allocated to it.
  for (const settlement of state.settlements) {
    const mine = allocations.filter((a) => a.settlement_id === settlement.id);
    const net = sum(mine.map((a) => a.net_paise));
    if (net !== settlement.amount) {
      /* c8 ignore next 4 */
      throw new Error(
        `ground truth: settlement ${settlement.id} closes at ${String(settlement.amount)} but its ` +
          `allocations net ${String(net)}. Invariant I4 fails on the true state.`,
      );
    }
  }

  const bankMappings = state.bank_lines.map((line) => {
    const settlement = state.settlements[line.settlement_index];
    /* c8 ignore next */
    if (settlement === undefined) throw new Error("ground truth: unknown settlement for a bank line");
    // I5: `Sigma settlement.amount` mapped to a bank line = `bank_line.amount`.
    if (sub(settlement.amount, line.amount) !== 0) {
      /* c8 ignore next */
      throw new Error(`ground truth: invariant I5 fails on ${line.id}`);
    }
    return { bank_line_id: line.id, settlement_ids: [settlement.id] as readonly string[] };
  });

  const ledgerMappings = state.ledger_entries.map((entry) => ({
    ledger_entry_id: entry.id,
    // §4.2: "ERP spurious rows are NOT generated — no family declares an
    // ERP-side anomaly", so `null` (a spurious booking) never occurs here.
    payment_id: state.payments[entry.payment_index]?.id ?? null,
  }));

  return Object.freeze({
    gt_version: GT_VERSION,
    seed: state.seed,
    family_id: state.family_id,
    allocations,
    bank_mappings: bankMappings,
    ledger_mappings: ledgerMappings,
    true_journal: journal,
    true_balances: projectTrueBalances(journal),
    degradations,
  });
}
