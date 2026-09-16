/**
 * Icon-font resilience: hide the ligature source text when the icon font
 * never arrived.
 *
 * **The defect this guards.** `apps/web/index.html` loads `Material Symbols
 * Outlined` from `fonts.googleapis.com` and from nowhere else, and every icon
 * in the product is written as a LIGATURE — `<span
 * class="material-symbols-outlined">monitoring</span>` — which the font
 * collapses into one glyph. When that request is refused (a corporate proxy, an
 * offline laptop, a browser with Google Fonts blocked for GDPR reasons) the
 * family is never defined, the browser falls back to whatever `font-family`
 * resolves to next, and the ligature's SOURCE TEXT renders as a word. The
 * Command Center hero renders the word "monitoring" at 72px; the sidebar reads
 * dashboard, search_check, receipt_long, workspace_premium, history_edu; the
 * primary button reads "play_arrow Run Demo". The product does not look
 * degraded, it looks broken, and the first thing a reviewer on a locked-down
 * network sees is an identifier where a picture should be.
 *
 * **What was rejected, and why.** `document.fonts.check("20px 'Material
 * Symbols Outlined'")` is the obvious probe and it detects nothing. `check()`
 * answers "can this text be rendered without a pending font load", and a
 * browser that has never heard of the family answers TRUE, because its
 * fallback face draws every one of those characters fine. It reports on the
 * load queue, not on whether the family exists; an undefined family has
 * nothing queued. It was tried first and returned `true` in both conditions.
 *
 * **What is used instead: the ligature's width.** A span is given the text
 * `monitoring` and the icon family at 20px and measured. With the font present
 * the ten letters collapse into one 20px glyph. Without it they lay out as a
 * word: measured in Chromium at 88.9px against 93.4px for the same string in
 * the page's sans-serif — the two agree to within the difference between two
 * text faces, which is the proof that the family was never defined and the
 * text was drawn by a fallback. {@link LIGATURE_MAX_PX} sits at 40px, roughly
 * 2x above the collapsed glyph and 2x below the uncollapsed word, so neither a
 * slightly wider icon face nor a slightly narrower fallback moves the answer.
 *
 * **The probe is styled inline, not by class.** `probe.style.cssText` carries
 * the family, size and off-screen placement itself, so the measurement does
 * not depend on the order in which the design system's stylesheet was
 * injected, and — the important half — so the probe is not caught by the very
 * rule its verdict switches on. A probe carrying `.material-symbols-outlined`
 * would be hidden by `:root[data-icon-font="unavailable"]
 * .material-symbols-outlined { visibility: hidden }` and go on measuring
 * faithfully, but a future rule on that class that touched layout would
 * silently change what is being measured.
 *
 * **Failure direction.** Every uncertain branch resolves to "assume the font is
 * fine" and leaves `data-icon-font` unset, so the stylesheet's fallback rule
 * stays inert: no body to append to, a zero-width measurement from a document
 * that has not laid out, any exception at all. The guard may only ever remove
 * a leaked word; it must never remove an icon that would have rendered. That
 * asymmetry is deliberate — a page that shows "monitoring" in text is the
 * status quo, a page that hid a real icon would be a regression this file
 * introduced.
 *
 * **When it decides.** After `document.fonts.ready` resolves (the font either
 * arrived or the browser gave up), with a {@link SETTLE_MS} timer as a second
 * route to the same decision for a browser with no `fonts` API or a `ready`
 * promise that never settles. The verdict is monotonic: once `settle` has
 * written `data-icon-font` it never runs again, so a late `ready` cannot flip
 * a verdict the timer already gave, and a font that arrives after the timer is
 * a font the page was already told to hide — a reload fixes that, an
 * oscillating sidebar would not.
 *
 * **The load has to be asked for before it can be waited on.** This guard
 * runs before React's first render, so at that moment nothing on the page
 * uses the icon family, no load is pending, and `fonts.ready` resolves at
 * once. The probe is then the FIRST thing to request the font, and a
 * measurement taken in the same tick reads the fallback face — 89px — while
 * the woff2 is still in flight. The first version of this guard did exactly
 * that and hid every icon on a page whose font arrived a few hundred
 * milliseconds later; headless Chromium with the font allowed reported
 * `unavailable`, `Material Symbols Outlined: loaded`, and a 20px probe, all
 * at once. Two things prevent it now. `doc.fonts.load(...)` asks for the face
 * explicitly before anything is awaited, so `fonts.ready` has a load to wait
 * for (it is not `fonts.check`: `load` starts a request and resolves when it
 * finishes; `check` only reports). And an uncollapsed reading taken while
 * `doc.fonts.status` is still `"loading"` is treated as an early reading,
 * not a verdict: `settle` re-arms on `fonts.ready` and measures again. Only a
 * committed verdict sets the attribute and closes the guard.
 *
 * **Scope.** This is a presentation guard for one third-party asset. It reads
 * no run, names no dataset, and touches nothing the API returns.
 */

/**
 * The string measured. It is the Command Center hero's own ligature, so the
 * probe checks the exact glyph whose leak is the most visible failure.
 */
const PROBE_TEXT = "monitoring";

/**
 * The probe's font size in CSS pixels. Matches the stylesheet's
 * `.material-symbols-outlined { font-size: 20px }`, so a collapsed ligature
 * measures one 20px glyph.
 */
const PROBE_PX = 20;

/**
 * Widest a collapsed ligature may measure before it is judged to be a word.
 *
 * One glyph at {@link PROBE_PX} is ~20px. The same ten letters uncollapsed
 * measured 88.9px in Chromium (93.4px in sans-serif). 40px has roughly 2x
 * margin either side.
 */
const LIGATURE_MAX_PX = 40;

/**
 * How long to wait for `document.fonts.ready` before deciding anyway. Long
 * enough for a slow but working font load; short enough that a leaked word
 * does not sit on screen for the length of a demo.
 */
const SETTLE_MS = 3000;

/**
 * Whether the icon family collapses its ligatures — i.e. whether the font is
 * actually defined in this document.
 *
 * Returns `true` (font assumed fine) when there is nothing to measure against:
 * no `body`, a zero-width reading from a document that has not laid out yet,
 * or any exception. See the module docblock for why the failure direction is
 * fixed this way.
 */
function ligatureResolved(doc: Document): boolean {
  const host = doc.body;
  if (!host) return true;

  const probe = doc.createElement("span");
  probe.textContent = PROBE_TEXT;
  // Inline, NOT the class: the measurement must not depend on CSS injection
  // order, and the probe must not be subject to the rule it triggers.
  probe.style.cssText =
    "position:absolute; left:-9999px; visibility:hidden; white-space:nowrap; " +
    `font-family:'Material Symbols Outlined'; font-size:${String(PROBE_PX)}px; line-height:1;`;

  try {
    host.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    // A zero width means the document has not laid out, not that the ligature
    // collapsed to nothing; there is no verdict to give, so give the safe one.
    if (width === 0) return true;
    return width <= LIGATURE_MAX_PX;
  } catch {
    return true;
  } finally {
    probe.remove();
  }
}

/**
 * Decide once whether the icon font arrived and record the verdict on the
 * root element as `data-icon-font="ready" | "unavailable"`.
 *
 * `design-system.css` hides `.material-symbols-outlined` under
 * `:root[data-icon-font="unavailable"]`. With the attribute unset — before the
 * decision, or on any uncertain path — that rule matches nothing and the page
 * renders exactly as it did before this guard existed.
 *
 * Called from `main.tsx` before the React root is created; it schedules work
 * and returns immediately.
 */
export function guardIconFont(doc: Document = document): void {
  let resolved = false;

  const commit = (verdict: "ready" | "unavailable"): void => {
    resolved = true;
    doc.documentElement.dataset.iconFont = verdict;
  };

  const settle = (): void => {
    // Monotonic: the first verdict is the only verdict.
    if (resolved) return;
    if (ligatureResolved(doc)) {
      commit("ready");
      return;
    }
    // Uncollapsed — but if a face is still in flight this is an early reading,
    // not a verdict. The probe itself may be what just requested it. Wait for
    // the load to finish, whichever way, and measure again.
    if (doc.fonts && doc.fonts.status === "loading") {
      Promise.resolve(doc.fonts.ready).then(settle, settle);
      return;
    }
    commit("unavailable");
  };

  if (doc.fonts) {
    // Ask for the face first, so there is a load for `ready` to wait on. An
    // undefined family resolves with no faces and a failed load rejects; both
    // are "the browser has stopped waiting", so both arms go on to settle.
    // `fonts.ready` resolves when every pending load has finished, whichever
    // way it finished; a rejected promise is still a browser that has stopped
    // waiting, so both arms there call `settle` too.
    const requested = doc.fonts.load(`${String(PROBE_PX)}px 'Material Symbols Outlined'`);
    const awaited = (): Promise<unknown> => Promise.resolve(doc.fonts.ready);
    requested.then(awaited, awaited).then(settle, settle);
  }
  // The second route: a browser with no `fonts` API, or a `ready` that never
  // settles, still gets a decision.
  setTimeout(settle, SETTLE_MS);
}
