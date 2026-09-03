/**
 * Who decides what &mdash; the three layers, stated once, where a reviewer
 * looking at the Command Center will read them before drawing a conclusion
 * about any figure on the page.
 *
 * **This component changes no financial semantics and displays no figure.** It
 * carries no amount, no identifier and no run data: it is a legend for the
 * panels around it, and every number those panels show still comes from the
 * API exactly as before. It exists because the page now has three things on it
 * that a reviewer could mistake for one another &mdash; a deterministic engine
 * that decides, an orchestrator that only chooses what to look at next, and a
 * model that only describes a decision already made &mdash; and the cost of
 * that confusion is someone believing the AI moved money.
 *
 * The ordering is deliberate and is the authority ordering: ASSAY first and
 * widest, the controller second and bounded, Gemini last and removable.
 */

interface LayerProps {
  readonly accent: string;
  readonly icon: string;
  readonly name: string;
  readonly role: string;
  readonly authority: string;
  readonly bounds: string;
}

function Layer({ accent, icon, name, role, authority, bounds }: LayerProps): React.ReactElement {
  return (
    <div
      className="card"
      style={{ padding: "var(--space-md)", borderLeft: `3px solid ${accent}` }}
    >
      <p
        className="font-label-caps"
        style={{ color: accent, display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 15 }}>
          {icon}
        </span>
        {name}
      </p>
      <p className="font-body-sm" style={{ fontWeight: 600, marginBottom: 4 }}>{role}</p>
      <p className="font-body-sm text-muted" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 4 }}>
        {authority}
      </p>
      <p className="font-body-sm text-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
        {bounds}
      </p>
    </div>
  );
}

export function AuthorityLegend(): React.ReactElement {
  return (
    <div style={{ marginBottom: "var(--space-xl)" }}>
      <p className="font-label-caps text-muted" style={{ marginBottom: "var(--space-sm)" }}>
        Who decides what
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--space-md)",
        }}
      >
        <Layer
          accent="var(--color-reconciled)"
          icon="gavel"
          name="ASSAY — deterministic"
          role="Decides. The financial authority."
          authority="Reconciles the batch, validates invariants, issues the Ambiguity Certificate, and runs the close gate. Every rupee figure on this page is its output."
          bounds="Abstains rather than guess when two allocations are equally supported. Nothing on this page can overrule it."
        />
        <Layer
          accent="var(--color-secondary)"
          icon="route"
          name="Controller — orchestration"
          role="Chooses what to look at next. No authority."
          authority="Reads the close gate, the queue and one decision's evidence, then plans the shortest path to a closed period and escalates what it may not decide."
          bounds="Deterministic policy, not a model. Performs no financial write in this phase: it opens no ledger event and moves no balance."
        />
        <Layer
          accent="var(--color-abstained)"
          icon="auto_awesome"
          name="Gemini — explanation"
          role="Describes a decision already made. No authority."
          authority="Puts the verified evidence into plain language on request, after the outcome is sealed. Its output is checked against that evidence and discarded if it invents a figure or an identifier."
          bounds="Cannot express an amount, name an entity that does not exist, or commit a decision. Removable entirely — the close loop runs unchanged without it."
        />
      </div>
    </div>
  );
}
