import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Sidebar }     from "./components/Sidebar.js";
import { TopBar }      from "./components/TopBar.js";
import { RunProvider } from "./context/RunContext.js";
import { CommandCenter }       from "./pages/CommandCenter.js";
import { InvestigationQueue }  from "./pages/InvestigationQueue.js";
import { EvidenceTrail }       from "./pages/EvidenceTrail.js";
import { AmbiguityCertificate } from "./pages/AmbiguityCertificate.js";
import { AuditLogs }           from "./pages/AuditLogs.js";
import "./design-system.css";

/**
 * ASSAY Reconciliation Intelligence - root application.
 *
 * Four primary routes implemented from Stitch v2 designs:
 *   /command-center          a6f740ffe62c4bb090d97bb76233faad
 *   /investigation-queue     4a8912729c14499da36b4110e88de1e2
 *   /evidence-trail          407721922edf4f709afa670c7ffa7050
 *   /ambiguity-certificate   ae0661c3d7c84e51ae8263e7b3681dc0
 *
 * A fifth route, /audit-logs, has no Stitch screen behind it: it was built
 * from the API contract rather than from a design, because what it shows is
 * whatever GET /runs/:id/ledger/verify returns and a mock of that would be a
 * picture of a verification.
 *
 * Design system: assets/7df82212894c4f6c99c4f2b1e264b84d (Indigo v2)
 * Data source: apps/api (engine API on port 8787)
 */

/**
 * The shell's one piece of state: whether the narrow-width drawer is open.
 *
 * It lives here rather than in the sidebar because three things need it — the
 * sidebar itself, the menu button in the top bar, and the scrim that closes it
 * — and because a route change must close it. Above the drawer breakpoint the
 * sidebar is in flow and this flag changes nothing on screen.
 */
function AppShell(): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const closeMenu = useCallback(() => { setMenuOpen(false); }, []);

  // A drawer left open over the page a reviewer just navigated to is a drawer
  // covering the answer they asked for.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={closeMenu} />
      {/* The scrim is a button, not a div: dismissing an overlay is an action,
          and Escape and the keyboard should reach it like any other. It is
          `display: none` at every width where the sidebar is in flow. */}
      <button
        type="button"
        className="app-scrim"
        data-open={menuOpen ? "true" : "false"}
        aria-label="Close navigation menu"
        tabIndex={menuOpen ? 0 : -1}
        onClick={closeMenu}
      />
      <div className="app-main">
        <TopBar menuOpen={menuOpen} onMenuClick={() => { setMenuOpen((v) => !v); }} />
        <main className="app-content" id="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/command-center" replace />} />
            <Route path="/command-center"        element={<CommandCenter />} />
            <Route path="/investigation-queue"   element={<InvestigationQueue />} />
            <Route path="/evidence-trail"        element={<EvidenceTrail />} />
            <Route path="/ambiguity-certificate" element={<AmbiguityCertificate />} />
            {/* Ledger Explorer and Settings were removed rather than left
                as stubs: the first duplicated figures the Command Center
                already shows (trial balance, Suspense balance, journal lines,
                root hash) and needed an account-balance route ARCHITECTURE.md
                §9 does not declare, and the second implied that thresholds are
                tunable when DECISION_BRIEF.md §L.1 rule 12 freezes tau at seal
                time and the explanation provider is resolved in the server
                process. A nav item that promises a setting this system must
                not have is worse than no nav item.

                Audit Logs was the last stub, and is now a real page over the
                live GET /runs/:id/ledger/verify — so no route in this table
                promises anything it does not do. */}
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="*" element={<Navigate to="/command-center" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <RunProvider>
        <AppShell />
      </RunProvider>
    </BrowserRouter>
  );
}
