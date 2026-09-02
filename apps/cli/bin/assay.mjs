#!/usr/bin/env -S node --experimental-transform-types --disable-warning=ExperimentalWarning
import { registerHooks } from "node:module";

/**
 * The `assay` binary — `EVALUATION_SPEC.md §7`'s `pnpm assay …` and
 * `PREREGISTRATION.md §9`'s `assay generate` / `assay oracle` / `assay bench`.
 *
 * **This file exists to make the frozen procedure executable and does nothing
 * else.** `src/main.ts` is still the entry point and is unchanged; this is the
 * one module in the repository that runs *before* TypeScript is loadable, so it
 * cannot itself be TypeScript. It parses no argument, reads no environment,
 * touches no filesystem and knows nothing about any command.
 *
 * **Why a loader and not a build to `dist/`.** Every workspace manifest — all
 * nine `packages/*` and this app — declares
 * `exports["."] = { types: "./src/index.ts", default: "./src/index.ts" }`, so
 * the workspace is consumed as **source**. Emitting `apps/cli` alone would not
 * help: its output would still `import "@assay/eval"`, which resolves to a
 * `.ts` file, so a dist build means rewriting all ten manifests and adding ten
 * build steps. `tsconfig.base.json` sets `noEmit: true`; there is no `outDir`,
 * no project reference and no build script; `.gitignore` treats `dist/` as
 * scratch; `ARCHITECTURE.md §11` fixes "TypeScript 5.x strict, Node 22" as the
 * single toolchain and rejects a second one; and `EVALUATION_SPEC.md §7`'s
 * reproduction recipe runs `pnpm install` and then `pnpm assay …` with **no
 * build step between them**. Adding one would amend a frozen procedure to work
 * around a packaging gap.
 *
 * **The two Node flags in the shebang, and why each is needed.**
 *
 * ```
 *   --experimental-transform-types    packages/generator/src/prng.ts and
 *                                     simulate.ts declare CONSTRUCTOR PARAMETER
 *                                     PROPERTIES, which strip-only mode refuses
 *                                     (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX). The
 *                                     first is ARCHITECTURE.md §11's VENDORED
 *                                     PRNG, frozen so that "a Node upgrade
 *                                     cannot silently change a draw" -- so the
 *                                     runtime accommodates the source, never the
 *                                     other way round. No source file changes.
 *   --disable-warning=Experimental…   the notice Node prints for the flag above
 *                                     is a fact about Node, not about a run.
 *                                     PREREGISTRATION.md §9 step 0's transcript
 *                                     is transcribed into §7 by hand, and an
 *                                     operator capturing it with 2>&1 must not
 *                                     find a Node notice interleaved with §7's
 *                                     baseline table.
 * ```
 *
 * **What Node already does, and the one thing it does not.** Node 22 loads
 * TypeScript natively. The single remaining gap is the TypeScript convention
 * that a relative `./x.js` specifier denotes `./x.ts` — all 417 relative import
 * specifiers in this workspace are written that way, `verbatimModuleSyntax`
 * having settled the style — and Node performs no such remap. The hook below
 * supplies exactly that rule and no other.
 *
 * **It can never shadow a real file.** The retry runs only after Node has
 * already failed to resolve the specifier, only for a relative specifier, and
 * only for one ending in `.js`. A `.js` file that exists resolves on the first
 * attempt and this hook is never reached for it.
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../");
      if (error?.code === "ERR_MODULE_NOT_FOUND" && relative && specifier.endsWith(".js")) {
        return nextResolve(`${specifier.slice(0, -".js".length)}.ts`, context);
      }
      throw error;
    }
  },
});

await import("../src/main.ts");
