import { resolve } from "node:path";
import { bootstrapPersistentState } from "./lib/persistentStateBootstrap.mjs";

function usage() {
  return "Usage: pnpm run vps:bootstrap-state -- --destination <host-data-directory> [--force]";
}

function parseArguments(argumentsList) {
  const options = { destination: null, force: false };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--destination") options.destination = argumentsList[++index] || null;
    else if (argument === "--force") options.force = true;
    else if (argument === "--help" || argument === "-h") { console.log(usage()); process.exit(0); }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.destination) throw new Error(`${usage()}\n--destination is required.`);
  return options;
}

try {
  const options = parseArguments(process.argv.slice(2));
  const result = await bootstrapPersistentState({ destination: resolve(options.destination), force: options.force });
  console.log(`Persistent accepted state initialized at ${result.destination}`);
} catch (error) {
  console.error(`VPS state bootstrap failed: ${error.message}`);
  process.exitCode = 1;
}
