import {
  SCENARIO_LAB_HEADLINE,
  SCENARIO_LAB_SUBHEAD,
  scenarioTransitionNote,
} from "../lib/copy.js";
import { DEMO_SCENARIOS, scenarioFor, scenarioLabel, type DemoScenario } from "../lib/scenarios.js";

/**
 * The scenario lab &mdash; which of `demo/`'s four periods the next run reads.
 *
 * **It changes the evidence and nothing else.** Every period runs through the
 * same frozen engine, the same close gate and the same close controller, with
 * no threshold, constraint or provider configured differently; this is a choice
 * of input, not a mode switch. That is the whole point of it being on screen,
 * and {@link SCENARIO_LAB_HEADLINE} now says it in one line rather than leaving
 * a reviewer to infer it: the controller behaves differently on these four
 * periods *because the evidence differs*, and both halves of that sentence are
 * visible at once.
 *
 * **Each period's evidence is shown for all four at the same time.** Only the
 * selected period used to describe itself, so a reviewer could not see what
 * they would be choosing between without choosing it four times &mdash; which
 * is precisely the comparison the lab exists to make.
 *
 * **None of these is benchmark data.** `demo/README.md` places all four outside
 * `bench/` with no seed, no ground truth and no score, and the note rendered
 * beneath the buttons says so where a reviewer reading a rupee figure will see
 * it. `demo-close`'s closed period is not evidence for `PROJECT_SPEC.md §7`'s
 * `S12`.
 *
 * **No caption here predicts an outcome.** Each description says what the period
 * contains; what the controller does with it is rendered by `ControllerPanel`
 * from the trace the server actually returned. A predicted outcome in this file
 * would be a second answer that could disagree with the real one.
 *
 * **`ranDataset` is what makes a switch legible.** It is the period the figures
 * on the page belong to &mdash; `run.dataset`, never the selection. When the
 * two differ the reviewer is mid-switch, and the notice says what that means:
 * the page below is still the old period, and running the new one produces a
 * new trace rather than updating this one. Omitted before any run exists,
 * where there is nothing to have carried over.
 *
 * Presentational and hook-free, so a test renders every state from props alone.
 */
export function ScenarioPicker({
  selected, disabled, onSelect, ranDataset,
}: {
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  /** The period the page's current figures came from, if a run has happened. */
  ranDataset?: string | undefined;
}): React.ReactElement {
  const active: DemoScenario | undefined = scenarioFor(selected);
  const switching = ranDataset !== undefined && ranDataset !== selected;
  return (
    <div>
      <p className="font-label-caps text-muted" style={{ marginBottom: 2 }}>
        Scenario lab &mdash; demo period
      </p>
      <p className="font-body-sm" style={{ fontWeight: 600, marginBottom: 2 }}>
        {SCENARIO_LAB_HEADLINE}
      </p>
      <p
        className="font-body-sm text-muted"
        style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 620, marginBottom: "var(--space-sm)" }}
      >
        {SCENARIO_LAB_SUBHEAD}
      </p>
      <div
        role="group"
        aria-label="Demo period"
        style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}
      >
        {DEMO_SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`btn ${s.id === selected ? "btn-primary" : "btn-secondary"}`}
            style={{
              flexDirection: "column", alignItems: "flex-start", gap: 2,
              padding: "var(--space-sm) var(--space-md)", fontSize: 12,
              textAlign: "left", flex: "1 1 150px", maxWidth: 210, minWidth: 0,
            }}
            aria-pressed={s.id === selected}
            disabled={disabled}
            onClick={() => { onSelect(s.id); }}
          >
            <span style={{ fontWeight: 600 }}>{s.label}</span>
            {/* The evidence, never the outcome. Dimmed on the unselected
                buttons so the row scans as one comparison rather than four
                competing claims. */}
            <span
              style={{
                fontSize: 10, fontWeight: 400, lineHeight: 1.4,
                opacity: s.id === selected ? 0.85 : 0.7, whiteSpace: "normal",
              }}
            >
              {s.evidence}
            </span>
          </button>
        ))}
      </div>
      {active !== undefined && (
        <p
          className="font-body-sm text-muted"
          style={{ marginTop: "var(--space-sm)", fontSize: 11, lineHeight: 1.6, maxWidth: 620 }}
        >
          <span className="cell-id" style={{ fontSize: 10 }}>{active.id}</span>{" "}
          &mdash; {active.description}
        </p>
      )}
      {switching && (
        <p
          className="font-body-sm"
          style={{
            marginTop: "var(--space-sm)", fontSize: 11, lineHeight: 1.6, maxWidth: 620,
            color: "var(--color-abstained)", fontWeight: 600,
          }}
          role="status"
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14, verticalAlign: "text-bottom" }}>
            swap_horiz
          </span>{" "}
          {scenarioTransitionNote(scenarioLabel(selected), scenarioLabel(ranDataset))}
        </p>
      )}
      <p
        className="font-body-sm text-muted"
        style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, maxWidth: 620 }}
      >
        All four are product fixtures held outside the benchmark corpus &mdash; never
        scored, and never benchmark evidence.
      </p>
    </div>
  );
}
