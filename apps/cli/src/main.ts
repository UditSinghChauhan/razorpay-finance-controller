#!/usr/bin/env node
import { dispatch } from "./cli.js";

/**
 * The binary. The only file in this package that reads `process`.
 *
 * Everything else takes `argv`, `env` and its output as arguments, so the whole
 * CLI is exercisable from a test without a live process — and so this file has
 * nothing in it that could behave differently from what the suite checks.
 */
const code = await dispatch({
  argv: process.argv.slice(2),
  env: process.env,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
});

process.exitCode = code;
