import { join, resolve } from "node:path";

function configuredStateRoot(stateRoot, environment) {
  const value = stateRoot ?? environment?.PROPERTYCORP_STATE_ROOT;
  return typeof value === "string" && value.trim() ? resolve(value.trim()) : null;
}

/**
 * Resolves mutable PropertyCorp paths. A configured state root keeps all
 * rename-based PC-12 promotion and rollback paths on one filesystem; without
 * it, development retains the repository-local layout exactly.
 */
export function resolvePropertyCorpStatePaths({
  projectRoot,
  stateRoot,
  environment = process.env,
} = {}) {
  if (!projectRoot) throw new Error("projectRoot is required when resolving PropertyCorp state paths.");
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedStateRoot = configuredStateRoot(stateRoot, environment);
  const inputDirectory = resolvedStateRoot
    ? join(resolvedStateRoot, "imo-current")
    : join(resolvedProjectRoot, "_input", "imo-current");
  const mediaDirectory = resolvedStateRoot
    ? join(resolvedStateRoot, "media", "offers")
    : join(resolvedProjectRoot, "public", "media", "offers");
  const varDirectory = resolvedStateRoot
    ? join(resolvedStateRoot, "var")
    : join(resolvedProjectRoot, "var");

  return {
    projectRoot: resolvedProjectRoot,
    stateRoot: resolvedStateRoot,
    usesStateRoot: Boolean(resolvedStateRoot),
    inputDirectory,
    currentSnapshotPath: join(inputDirectory, "oferty.json"),
    currentPhotosDirectory: join(inputDirectory, "photos"),
    publicMediaDirectory: mediaDirectory,
    varDirectory,
    imoImportDirectory: join(varDirectory, "imo-import"),
    imoAutomationDirectory: join(varDirectory, "imo-automation"),
    weeklyReportsDirectory: join(varDirectory, "reports", "weekly"),
  };
}
