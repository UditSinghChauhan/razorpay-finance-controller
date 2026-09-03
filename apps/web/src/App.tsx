import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar }     from "./components/Sidebar.js";
import { TopBar }      from "./components/TopBar.js";
import { RunProvider } from "./context/RunContext.js";
import { CommandCenter }       from "./pages/CommandCenter.js";
import { InvestigationQueue }  from "./pages/InvestigationQueue.js";
import { EvidenceTrail }       from "./pages/EvidenceTrail.js";
import { AmbiguityCertificate } from "./pages/AmbiguityCertificate.js";
import { PlaceholderPage }     from "./pages/PlaceholderPage.js";
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
            <Route path="/ledger-explorer" element={
              <PlaceholderPage
                title="Ledger Explorer"
                subtitle="Drill into individual account balances, posting rules and trial balance. Coming soon."
                icon="account_balance_wallet"
              />
            } />
            <Route path="/audit-logs" element={
              <PlaceholderPage
                title="Audit Logs"
                subtitle="Full hash-chained ledger event log for the current run. Coming soon."
                icon="history_edu"
              />
            } />
            <Route path="/settings" element={
              <PlaceholderPage
                title="Settings"
                subtitle="Run configuration, LLM provider, thresholds. Coming soon."
                icon="settings"
              />
            } />
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
