/**
 * `pnpm run check:env` — the local setup check for the "Explain with AI" surface.
 *
 * Reports three lines and nothing else:
 *
 * ```
 *   provider=<ASSAY_EXPLAIN_PROVIDER>
 *   model=<GEMINI_MODEL>
 *   GEMINI_API_KEY=set|missing
 * ```
 *
 * **It never prints the credential, and it cannot.** `set|missing` is the only
 * thing this file learns about `GEMINI_API_KEY` — the value is tested for
 * presence and then dropped, so no code path here can reach a printer with it.
 * That is the whole reason the check exists: an operator confirming their `.env`
 * landed should not have to `cat` it, and `echo $GEMINI_API_KEY` puts a live
 * credential into shell history.
 *
 * **It makes no network call.** Presence of a key is not validity of a key, and
 * this script does not claim otherwise; the first real Gemini call is the first
 * `POST /runs/:id/decisions/:decision_id/explain`.
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

const provider = process.env["ASSAY_EXPLAIN_PROVIDER"] ?? DEFAULT_PROVIDER;
const model = process.env["GEMINI_MODEL"] ?? DEFAULT_GEMINI_MODEL_ID;

// Whitespace-only is `missing`: a key pasted as a stray newline is not a key,
// and reporting it as `set` would send the operator looking for the fault in
// the server instead of in their `.env`.
const key = process.env["GEMINI_API_KEY"];
const keyState = key !== undefined && key.trim() !== "" ? "set" : "missing";

process.stdout.write(`provider=${provider}\nmodel=${model}\nGEMINI_API_KEY=${keyState}\n`);
