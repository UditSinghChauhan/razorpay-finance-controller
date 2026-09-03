import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
function AppShell(): React.ReactElement {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <TopBar />
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
