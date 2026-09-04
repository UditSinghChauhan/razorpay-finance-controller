/**
 * `pnpm run check:env` — the local setup check for the "Explain with AI" surface.
 *
 * Reports three lines and nothing else:
 *
 * ```
 *   provider=<ASSAY_EXPLAIN_PROVIDER>
 *   model=<the resolved provider's model id>
 *   <the resolved provider's key var>=set|missing
 * ```
 *
 * **It reports the credential the SELECTED provider actually reads.** Through
 * this checkpoint it printed `GEMINI_MODEL` and `GEMINI_API_KEY` unconditionally
 * while `apps/api/src/explain/config.ts` defaults the provider to `anthropic` —
 * so on a default-configured process it reported the presence of a key the
 * server would never consult, and an operator with a valid `ANTHROPIC_API_KEY`
 * was told `missing`. `config.ts` is explicit that "each provider reads only its
 * own credential"; this check now mirrors that rather than contradicting it.
 *
 * **It never prints the credential, and it cannot.** `set|missing` is the only
 * thing this file learns about either key — the value is tested for
 * presence and then dropped, so no code path here can reach a printer with it.
 * That is the whole reason the check exists: an operator confirming their `.env`
 * landed should not have to `cat` it, and `echo $GEMINI_API_KEY` puts a live
 * credential into shell history.
 *
 * **It makes no network call.** Presence of a key is not validity of a key, and
 * this script does not claim otherwise; the first real provider call is the
 * first `POST /runs/:id/decisions/:decision_id/explain`.
 *
 * **Plain `.mjs`, no dependency, no dotenv.** The environment reaches this
 * process exactly as it reaches the API: through Node's own `--env-file`, wired
 * in the `check:env` script. `ARCHITECTURE.md §11` fixes one toolchain and
 * `apps/api/src/explain/config.ts` reads `process.env` directly — a checker that
 * loaded `.env` by some other mechanism would be verifying a different
 * environment from the one the server sees, which is the one bug it must not
 * have.
 */

// Imported rather than taken as a global: `scripts/` sits outside every package
// block in `eslint.config.js`, so only the base config applies and it declares
// no Node globals. The explicit specifier is also what the rest of the
// workspace does with `node:` builtins.
import process from "node:process";

/**
 * The two defaults below are `apps/api/src/explain/config.ts`'s, restated.
 *
 * They are duplicated rather than imported because that module is TypeScript
 * consumed as source and reachable only through the binaries' resolve hook, so
 * importing it would make this dependency-free check carry the loader. They are
 * the answer to "what would the server do", so if `config.ts` changes, these
 * change with it.
 */
const DEFAULT_PROVIDER = "anthropic";
const DEFAULT_GEMINI_MODEL_ID = "gemini-2.5-flash";
const DEFAULT_ANTHROPIC_MODEL_ID = "claude-opus-5";

/**
 * Which environment variables the resolved provider actually reads.
 *
 * One row per supported provider id, mirroring `config.ts`'s own table. An
 * unrecognised `ASSAY_EXPLAIN_PROVIDER` is reported as-is with no key line
 * invented for it: the server will refuse that value, and guessing a credential
 * name for a provider that does not exist would be a second wrong answer.
 */
const PROVIDERS = {
  anthropic: { modelVar: "ASSAY_EXPLAIN_MODEL_ID", modelDefault: DEFAULT_ANTHROPIC_MODEL_ID, keyVar: "ANTHROPIC_API_KEY" },
  gemini: { modelVar: "GEMINI_MODEL", modelDefault: DEFAULT_GEMINI_MODEL_ID, keyVar: "GEMINI_API_KEY" },
};

const provider = process.env["ASSAY_EXPLAIN_PROVIDER"] ?? DEFAULT_PROVIDER;
const spec = Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider] : null;

if (spec === null) {
  process.stdout.write(
    `provider=${provider}\nmodel=unknown\nkey=unknown\n` +
      `note=unsupported provider; supported: ${Object.keys(PROVIDERS).join(", ")}\n`,
  );
} else {
  const model = process.env[spec.modelVar] ?? spec.modelDefault;

  // Whitespace-only is `missing`: a key pasted as a stray newline is not a key,
  // and reporting it as `set` would send the operator looking for the fault in
  // the server instead of in their `.env`.
  const key = process.env[spec.keyVar];
  const keyState = key !== undefined && key.trim() !== "" ? "set" : "missing";

  process.stdout.write(`provider=${provider}\nmodel=${model}\n${spec.keyVar}=${keyState}\n`);
}
