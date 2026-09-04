import { useContext } from "react";
import { NavLink } from "react-router-dom";

import { RunContext } from "../context/RunContext.js";

/** ASSAY logomark SVG (inline). */
function AssayLogo(): React.ReactElement {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#000" />
      <text x="6" y="23" fill="#fff" fontSize="14" fontWeight="700" fontFamily="Inter,sans-serif">A</text>
    </svg>
  );
}

interface NavItemProps {
  to: string;
  icon: string;
  /** The step's number in the reviewer journey, shown down the left. */
  step: number;
  label: string;
  /** The label the compact rail shows under the icon. Two words at most. */
  short: string;
  /**
   * A step that exists but cannot be entered yet, with the reason.
   *
   * Evidence Trail and Ambiguity Certificate are both about ONE decision, so
   * before a decision is selected there is nothing for either to show. They
   * are rendered anyway, disabled and explained, because the journey is the
   * navigation: a reviewer needs to see that those two steps come after the
   * queue and are reached by drilling into a row.
   */
  unreachable?: string | undefined;
  onNavigate?: (() => void) | undefined;
}

function NavItem({ to, icon, step, label, short, unreachable, onNavigate }: NavItemProps): React.ReactElement {
  const body = (
    <>
      <span className="sidebar-step" aria-hidden="true">{step}</span>
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      <span className="sidebar-nav-label-full">{label}</span>
      <span className="sidebar-nav-label-short" aria-hidden="true">{short}</span>
    </>
  );

  if (unreachable !== undefined) {
    return (
      <span className="sidebar-nav-link" aria-disabled="true" title={unreachable}>
        {body}
        <span className="sr-only">{unreachable}</span>
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) => `sidebar-nav-link${isActive ? " active" : ""}`}
    >
      {body}
    </NavLink>
  );
}

/**
 * Sidebar &mdash; the reviewer journey, in order, at three widths.
 *
 * **Every item here reaches a page that does something.** Ledger Explorer and
 * Settings were removed with their routes &mdash; see `App.tsx` for why each
 * was the wrong promise to make.
 *
 * **The five steps are numbered and ordered, because the order is the
 * product.** Command Center → Investigation Queue → Evidence Trail → Ambiguity
 * Certificate → Audit Logs is the path a reviewer is meant to walk, and a flat
 * list of three destinations hid three quarters of it. Evidence Trail and
 * Ambiguity Certificate are still not link targets until a decision has been
 * selected — they are about one decision, and opening them empty is not
 * navigation — but they are now *visible* as steps 3 and 4, disabled, with the
 * reason stated. The alternative, which is what this file used to do, was to
 * leave a reviewer to discover two of the five screens by clicking a row.
 *
 * **Three shell modes, all CSS.** The full sidebar, the compact rail
 * (icon above a short label) and the drawer are the same markup under three
 * media queries in `design-system.css`; this component's only responsive
 * concern is `open`, which the drawer reads, and `onNavigate`, which closes
 * the drawer behind a chosen destination. At the two wider modes the sidebar
 * is always in flow and `open` is inert.
 */
export function Sidebar({
  open = false, onNavigate,
}: {
  /** Whether the drawer is showing. Ignored above the drawer breakpoint. */
  open?: boolean;
  /** Called when a destination is chosen, so the drawer can close behind it. */
  onNavigate?: (() => void) | undefined;
} = {}): React.ReactElement {
  // `useContext` rather than `useRun`, deliberately: the sidebar renders in
  // shells that have no provider (and in tests that supply none), and a nav
  // that throws without a run would make the whole app unmountable.
  const ctx = useContext(RunContext);
  const hasDecision = ctx?.selectedDecisionId != null;
  const decisionGate = hasDecision
    ? undefined
    : "Select a decision in the Investigation Queue to open this step.";

  return (
    <aside className="app-sidebar" aria-label="Primary navigation" data-open={open ? "true" : "false"}>
      <div className="sidebar-logo">
        <AssayLogo />
        <span className="sidebar-wordmark">ASSAY</span>
      </div>
      <nav className="sidebar-nav" aria-label="App sections">
        <p className="sidebar-nav-section-label" style={{ marginBottom: "var(--space-xs)" }}>
          Reviewer journey
        </p>
        <NavItem to="/command-center" step={1} icon="dashboard" label="Command Center" short="Command" onNavigate={onNavigate} />
        <NavItem to="/investigation-queue" step={2} icon="search_check" label="Investigation Queue" short="Queue" onNavigate={onNavigate} />
        <NavItem
          to="/evidence-trail"
          step={3}
          icon="receipt_long"
          label="Evidence Trail"
          short="Evidence"
          unreachable={decisionGate}
          onNavigate={onNavigate}
        />
        <NavItem
          to="/ambiguity-certificate"
          step={4}
          icon="workspace_premium"
          label="Ambiguity Certificate"
          short="Certificate"
          unreachable={decisionGate}
          onNavigate={onNavigate}
        />

        <p className="sidebar-nav-section-label" style={{ marginTop: "var(--space-lg)", marginBottom: "var(--space-xs)" }}>
          Verification
        </p>
        <NavItem to="/audit-logs" step={5} icon="history_edu" label="Verify Ledger" short="Verify" onNavigate={onNavigate} />
      </nav>
    </aside>
  );
}
