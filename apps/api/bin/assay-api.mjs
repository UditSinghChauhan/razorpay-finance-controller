#!/usr/bin/env -S node --experimental-transform-types --disable-warning=ExperimentalWarning
import { registerHooks } from "node:module";

/**
 * The `assay-api` binary — `ARCHITECTURE.md §9`'s local-bind server.
 *
 * **This file is `apps/cli/bin/assay.mjs`'s loader, repeated.** That file states
 * the reasoning in full and it is not restated here: the workspace is consumed
 * as source (every manifest's `exports["."]` points at `src/index.ts`),
 * `tsconfig.base.json` sets `noEmit`, and `ARCHITECTURE.md §11` fixes one
 * toolchain — so a binary must load TypeScript directly, and the one gap Node
 * leaves is the convention that a relative `./x.js` specifier denotes `./x.ts`.
 *
 * **Why repeated rather than shared.** A binary runs before any workspace module
 * is loadable, so it cannot import a helper from a package whose own resolution
 * depends on the hook being installed — the shared module would need the very
 * mechanism it is trying to provide. Extracting it would mean a plain-JS module
 * outside every package's `exports`, reached by relative path across app
 * boundaries, which is a worse coupling than fifteen duplicated lines. If a
 * third binary appears, that trade changes and this should be revisited.
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
