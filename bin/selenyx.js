#!/usr/bin/env node
// Selenyx — 月相科研终端 Agent
// Cross-platform entry (Windows / macOS / Linux). npm generates the shims.
import { main } from '../src/cli.js';

main(process.argv.slice(2)).catch((err) => {
  const msg = err && err.message ? err.message : String(err);
  process.stderr.write(`\nselenyx: ${msg}\n\n`);
  process.exitCode = 1;
});
