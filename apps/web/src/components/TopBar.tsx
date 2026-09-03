import { useLocation } from "react-router-dom";

const PAGE_LABELS: Record<string, string> = {
  "/command-center":        "Command Center",
  "/investigation-queue":   "Investigation Queue",
  "/evidence-trail":        "Evidence Trail",
  "/ambiguity-certificate": "Ambiguity Certificate",
  "/audit-logs":            "Audit Logs",
};

/**
 * TopBar — the breadcrumb, and nothing that does not work.
 *
 * Source: Stitch screen a6f740ffe62c4bb090d97bb76233faad (Command Center v2).
 *
 * **The search box, the notification bell and the avatar are gone.** All three
 * came from the design as furniture, and all three were inert: the search input
 * filtered nothing, the bell opened nothing, and the avatar's initials belonged
 * to no user this local-bind single-operator tool has. `PROJECT_SPEC.md §8`
 * puts *"auth, multi-tenancy, RBAC"* out of scope, so the avatar was promising
 * a concept the product deliberately does not have — and a control that looks
 * live and answers nothing costs more credibility than the empty space costs
 * polish. Search over the exception queue is a real feature; when it exists it
 * belongs on the queue, over the rows it filters, not in a global bar.
 *
 * The breadcrumb names the page the sidebar and the page title name. It read
 * "Overview" for `/command-center` while both of those said "Command Center".
 */
export function TopBar(): React.ReactElement {
  const { pathname } = useLocation();
  const pageLabel = PAGE_LABELS[pathname] ?? "Command Center";

  return (
    <header className="app-topbar" role="banner">
      <nav
        aria-label="Breadcrumb"
        className="font-body-sm"
        style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--color-on-surface-variant)" }}
      >
        <span style={{ cursor: "default" }}>ASSAY</span>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">chevron_right</span>
        <span style={{ color: "var(--color-on-surface)", fontWeight: 600 }}>{pageLabel}</span>
      </nav>
    </header>
  );
}
