import { useNavigate } from "react-router-dom";

interface PlaceholderPageProps {
  title:    string;
  subtitle: string;
  icon:     string;
}

export function PlaceholderPage({ title, subtitle, icon }: PlaceholderPageProps): React.ReactElement {
  const navigate = useNavigate();
  return (
    <div style={{ padding: "var(--space-xl)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "var(--space-lg)" }}>
      <span className="material-symbols-outlined" style={{ fontSize: 64, color: "var(--color-outline)" }} aria-hidden="true">{icon}</span>
      <div style={{ textAlign: "center" }}>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle" style={{ marginTop: "var(--space-sm)" }}>{subtitle}</p>
      </div>
      <button className="btn btn-secondary" onClick={() => void navigate("/command-center")}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
        Command Center
      </button>
    </div>
  );
}
