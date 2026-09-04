import { Link, useLocation } from "react-router-dom";

/**
 * Where each page sits in the reviewer journey, and what its parent is.
 *
 * The breadcrumb used to be `ASSAY › <page>` for every route, which said the
 * same thing on all five and told a reviewer on the Ambiguity Certificate
 * nothing about how they got there or how to get back. `parent` is the step
 * before it in the journey; it becomes a link, so every deep page has an
 * obvious route to the surface it was reached from.
 */
interface PageCrumb {
  readonly label: string;
  readonly parent?: { readonly label: string; readonly to: string };
}

const PAGE_CRUMBS: Record<string, PageCrumb> = {
  "/command-center": { label: "Command Center" },
  "/investigation-queue": {
    label: "Investigation Queue",
    parent: { label: "Command Center", to: "/command-center" },
  },
  "/evidence-trail": {
    label: "Evidence Trail",
    parent: { label: "Investigation Queue", to: "/investigation-queue" },
  },
  "/ambiguity-certificate": {
    label: "Ambiguity Certificate",
    parent: { label: "Evidence Trail", to: "/evidence-trail" },
  },
  "/audit-logs": {
    label: "Verify Ledger",
    parent: { label: "Command Center", to: "/command-center" },
  },
};

function Chevron(): React.ReactElement {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
      chevron_right
    </span>
  );
}

/**
 * TopBar &mdash; the journey breadcrumb, the drawer's menu button, and nothing
 * that does not work.
 *
 * **The search box, the notification bell and the avatar are gone.** All three
 * came from the design as furniture, and all three were inert: the search input
 * filtered nothing, the bell opened nothing, and the avatar's initials belonged
 * to no user this local-bind single-operator tool has. `PROJECT_SPEC.md §8`
 * puts *"auth, multi-tenancy, RBAC"* out of scope, so the avatar was promising
 * a concept the product deliberately does not have &mdash; and a control that
 * looks live and answers nothing costs more credibility than the empty space
 * costs polish.
 *
 * **The menu button is the one control that was added, and it is real.** Below
 * the drawer breakpoint the sidebar is off-canvas and this is the only way to
 * it; above that breakpoint CSS hides the button entirely, because a menu
 * control beside a permanently visible menu is furniture of exactly the kind
 * this file exists to refuse.
 */
export function TopBar({
  onMenuClick, menuOpen = false,
}: {
  onMenuClick?: (() => void) | undefined;
  menuOpen?: boolean;
} = {}): React.ReactElement {
  const { pathname } = useLocation();
  const crumb = PAGE_CRUMBS[pathname] ?? PAGE_CRUMBS["/command-center"] ?? { label: "Command Center" };

  return (
    <header className="app-topbar" role="banner">
      <div style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <button
          type="button"
          className="app-menu-button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={onMenuClick}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {menuOpen ? "close" : "menu"}
          </span>
        </button>
        <nav
          aria-label="Breadcrumb"
          className="font-body-sm"
          style={{
            display: "flex", alignItems: "center", gap: 4, minWidth: 0,
            color: "var(--color-on-surface-variant)", flexWrap: "wrap",
          }}
        >
          <span style={{ cursor: "default" }}>ASSAY</span>
          {crumb.parent !== undefined && (
            <>
              <Chevron />
              {/* The parent step, as a link. This is the "obvious route back to
                  the relevant parent" every deep page needs; the pages also
                  carry their own back control, and the two agree because both
                  name the step before this one in the journey. */}
              <Link
                to={crumb.parent.to}
                style={{ color: "var(--color-secondary)", textDecoration: "none" }}
              >
                {crumb.parent.label}
              </Link>
            </>
          )}
          <Chevron />
          <span style={{ color: "var(--color-on-surface)", fontWeight: 600 }}>{crumb.label}</span>
        </nav>
      </div>
    </header>
  );
}
