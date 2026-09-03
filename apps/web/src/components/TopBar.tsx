import { useLocation } from "react-router-dom";

const PAGE_LABELS: Record<string, string> = {
  "/command-center":      "Overview",
  "/investigation-queue": "Investigation Queue",
  "/evidence-trail":      "Evidence Trail",
  "/ambiguity-certificate": "Ambiguity Certificate",
  "/ledger-explorer":     "Ledger Explorer",
  "/audit-logs":          "Audit Logs",
  "/settings":            "Settings",
};

/**
 * TopBar — v2 design: breadcrumb ASSAY > pageName, search, notifications, avatar.
 * Source: Stitch screen a6f740ffe62c4bb090d97bb76233faad (Command Center v2).
 */
export function TopBar(): React.ReactElement {
  const { pathname } = useLocation();
  const pageLabel = PAGE_LABELS[pathname] ?? "Overview";

  return (
    <header className="app-topbar" role="banner">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="font-body-sm" style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-on-surface-variant)" }}>
        <span style={{ cursor: "default" }}>ASSAY</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">chevron_right</span>
        <span style={{ color: "var(--color-on-surface)", fontWeight: 600 }}>{pageLabel}</span>
      </nav>

      {/* Right cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        {/* Search */}
        <div className="search-box" role="search">
          <span className="material-symbols-outlined text-muted" style={{ fontSize: 20 }} aria-hidden="true">search</span>
          <input
            type="search"
            placeholder="Search transactions..."
            aria-label="Search transactions"
          />
        </div>

        {/* Notifications */}
        <button
          className="btn-ghost"
          style={{ display: "flex", alignItems: "center", padding: 4, background: "none", border: "none", cursor: "pointer", borderRadius: "var(--radius-md)" }}
          aria-label="Notifications"
        >
          <span className="material-symbols-outlined text-muted" style={{ fontSize: 22 }}>notifications</span>
        </button>

        {/* Avatar */}
        <div
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "var(--color-surface-container-high)",
            border: "1px solid var(--color-outline-variant)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 600, fontSize: 13,
            color: "var(--color-primary)",
            flexShrink: 0,
          }}
          aria-label="User menu"
          role="button"
          tabIndex={0}
        >
          FA
        </div>
      </div>
    </header>
  );
}
