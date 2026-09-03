import { DEMO_SCENARIOS, scenarioFor, type DemoScenario } from "../lib/scenarios.js";

/**
 * The demo period selector &mdash; which of `demo/`'s four periods the next run
 * reads.
 *
 * **It changes the evidence and nothing else.** Every period runs through the
 * same frozen engine, the same close gate and the same close controller, with
 * no threshold, constraint or provider configured differently; this is a choice
 * of input, not a mode switch. That is the whole point of it being on screen:
 * the controller behaves differently on these four periods because the evidence
 * differs, and a reviewer can see both halves of that sentence.
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
 * Presentational and hook-free, so a test renders every state from props alone.
 */
export function ScenarioPicker({
  selected, disabled, onSelect,
}: {
  selected: string;
  disabled: boolean;
  onSelect: (id: string) => void;
}): React.ReactElement {
  const active: DemoScenario | undefined = scenarioFor(selected);
  return (
    <div>
      <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-xs)" }}>
        Demo period
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
            style={{ padding: "var(--space-xs) var(--space-md)", fontSize: 12 }}
            aria-pressed={s.id === selected}
            disabled={disabled}
            onClick={() => { onSelect(s.id); }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {active !== undefined && (
        <p
          className="font-body-sm text-muted"
          style={{ marginTop: "var(--space-sm)", fontSize: 11, lineHeight: 1.6, maxWidth: 560 }}
        >
          <span className="cell-id" style={{ fontSize: 10 }}>{active.id}</span>{" "}
          &mdash; {active.description}
        </p>
      )}
      <p
        className="font-body-sm text-muted"
        style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, maxWidth: 560 }}
      >
        All four are product fixtures held outside the benchmark corpus &mdash; never
        scored, and never benchmark evidence.
      </p>
    </div>
  );
}
