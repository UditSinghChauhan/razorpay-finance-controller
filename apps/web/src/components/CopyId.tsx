import { useState } from "react";

/**
 * A long identifier, shown at a length that fits, with the whole of it one
 * click away.
 *
 * **Why the value is never written into an attribute.** The obvious way to
 * make a truncated hash recoverable is `title={value}` — and it is the wrong
 * way here. `AuditLogs`'s root comparison abbreviates two hashes *only* while
 * the response reports them equal, and a `title` would put both full hashes
 * back in the document, which is exactly the state that page is built to make
 * impossible to render by accident. So the full string lives in the click
 * handler's closure and nowhere else: what the DOM carries is what a reviewer
 * can actually see.
 *
 * **It copies; it never re-formats.** No identifier on any screen is
 * shortened, normalised or re-cased on its way to the clipboard — the value
 * the button was given is the value the clipboard receives.
 */

/** Copies one string to the clipboard, and says so for a moment afterwards. */
export function CopyButton({
  value, label,
}: {
  value: string;
  /** What is being copied, for the screen-reader label: "decision ID". */
  label: string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={`Copy ${label}`}
      onClick={() => {
        // `navigator.clipboard` is absent over plain http on a non-localhost
        // origin and in some embedded webviews. A copy that cannot happen must
        // not throw and must not report success.
        const clipboard: Clipboard | undefined = globalThis.navigator?.clipboard;
        if (clipboard === undefined) return;
        void clipboard.writeText(value).then(
          () => {
            setCopied(true);
            globalThis.setTimeout(() => { setCopied(false); }, 1400);
          },
          () => { /* a refused clipboard is not a copy; say nothing. */ },
        );
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {copied ? "check" : "content_copy"}
      </span>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * A labelled identifier row: the label, the value, and the copy control.
 *
 * `head`/`tail` truncate from the middle when given — the two ends of a hash
 * are what a reviewer compares, so a head-only ellipsis discards the half that
 * distinguishes two similar values. With neither, the value is rendered in
 * full and wraps at any character (`.cell-id` sets `overflow-wrap: anywhere`),
 * which is what keeps a 64-hex string inside its column instead of widening
 * the page.
 */
export function CopyId({
  label, value, head, tail, fontSize = 11,
}: {
  label?: string | undefined;
  value: string;
  head?: number | undefined;
  tail?: number | undefined;
  fontSize?: number | undefined;
}): React.ReactElement {
  const truncated =
    head !== undefined && value.length > head + (tail ?? 0) + 1
      ? `${value.slice(0, head)}…${tail !== undefined && tail > 0 ? value.slice(-tail) : ""}`
      : value;

  return (
    <div style={{ minWidth: 0 }}>
      {label !== undefined && (
        <p className="font-label-caps text-muted" style={{ marginBottom: 2 }}>{label}</p>
      )}
      <div className="id-line">
        <p className="cell-id" style={{ fontSize, lineHeight: 1.6 }}>{truncated}</p>
        <CopyButton value={value} label={label ?? "identifier"} />
      </div>
    </div>
  );
}
