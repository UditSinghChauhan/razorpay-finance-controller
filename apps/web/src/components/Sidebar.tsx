import { NavLink } from "react-router-dom";

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
  label: string;
}

function NavItem({ to, icon, label }: NavItemProps): React.ReactElement {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `sidebar-nav-link${isActive ? " active" : ""}`
      }
    >
      <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>
      {label}
    </NavLink>
  );
}

/**
 * Sidebar — v2 design (w-72, ASSAY logo + wordmark, border-r-[3px]).
 * Source: Stitch screen a6f740ffe62c4bb090d97bb76233faad (Command Center v2).
 *
 * **Every item here reaches a page that does something.** Ledger Explorer and
 * Settings were removed with their routes — see `App.tsx` for why each was the
 * wrong promise to make — and Audit Logs, the last entry that was still
 * awaiting its page, now runs `GET /runs/:id/ledger/verify` against the current
 * run. Evidence Trail and Ambiguity Certificate are deliberately absent: both
 * are about ONE decision and are reached by drilling into it, so a nav entry
 * would open them with nothing selected.
 */
export function Sidebar(): React.ReactElement {
  return (
    <aside className="app-sidebar" aria-label="Primary navigation">
      <div className="sidebar-logo">
        <AssayLogo />
        <span className="sidebar-wordmark">ASSAY</span>
      </div>
      <nav className="sidebar-nav" aria-label="App sections">
        <p className="sidebar-nav-section-label" style={{ marginBottom: "var(--space-xs)" }}>
          Operations
        </p>
        <NavItem to="/command-center"      icon="dashboard"    label="Command Center" />
        <NavItem to="/investigation-queue" icon="search_check" label="Investigation Queue" />

        <p className="sidebar-nav-section-label" style={{ marginTop: "var(--space-lg)", marginBottom: "var(--space-xs)" }}>
          Compliance
        </p>
        <NavItem to="/audit-logs" icon="history_edu" label="Audit Logs" />
      </nav>
    </aside>
  );
}
