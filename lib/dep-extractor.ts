/** Candidate dependency filenames at repository root (order = preference). */
export const DEPENDENCY_FILES = [
  "package.json",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "Gemfile",
  "composer.json",
] as const;

export type DependencyFilename = (typeof DEPENDENCY_FILES)[number];

function uniqueSorted(names: string[]): string[] {
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function parsePackageJson(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ] as const;

  const names: string[] = [];
  for (const field of fields) {
    const block = obj[field];
    if (!block || typeof block !== "object") continue;
    for (const key of Object.keys(block as Record<string, unknown>)) {
      if (key.trim()) names.push(key.trim());
    }
  }
  return uniqueSorted(names);
}

function parseRequirementsTxt(content: string): string[] {
  const names: string[] = [];
  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const withoutComment = line.split("#")[0]?.trim() ?? "";
    if (!withoutComment) continue;
    const token = withoutComment.split(/\s+/)[0] ?? "";
    const cleaned = token.replace(/^[-\[]+/, "").replace(/[=<>!~[\]]/g, "");
    if (!cleaned || cleaned.startsWith("-")) continue;
    names.push(cleaned);
  }
  return uniqueSorted(names);
}

function parseCargoToml(content: string): string[] {
  const names: string[] = [];
  let inDeps = false;

  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (/^\[dependencies(?:\.[^\]]+)?\]$/.test(trimmed)) {
      inDeps = true;
      continue;
    }
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inDeps = false;
      continue;
    }
    if (!inDeps) continue;

    const m = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (m?.[1]) names.push(m[1]);
  }
  return uniqueSorted(names);
}

function parseGoMod(content: string): string[] {
  const names: string[] = [];
  let inRequire = false;

  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    if (/^require\s*\($/.test(trimmed)) {
      inRequire = true;
      continue;
    }
    if (inRequire && trimmed === ")") {
      inRequire = false;
      continue;
    }

    const inline = /^require\s+([^\s]+)\s/.exec(trimmed);
    if (inline?.[1]) {
      names.push(inline[1]);
      continue;
    }

    if (inRequire) {
      const token = trimmed.split(/\s+/)[0] ?? "";
      if (token) names.push(token);
    }
  }
  return uniqueSorted(names);
}

function parsePyprojectToml(content: string): string[] {
  const names: string[] = [];
  let inProjectDeps = false;
  let inPoetryDeps = false;

  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed === "[project.dependencies]" || trimmed === "[tool.poetry.dependencies]") {
      inProjectDeps = trimmed === "[project.dependencies]";
      inPoetryDeps = trimmed === "[tool.poetry.dependencies]";
      continue;
    }
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inProjectDeps = false;
      inPoetryDeps = false;
      continue;
    }

    if (inProjectDeps || inPoetryDeps) {
      const m = /^["']?([^"'=\s]+)["']?\s*=/.exec(trimmed);
      if (m?.[1] && m[1] !== "python") names.push(m[1]);
    }
  }
  return uniqueSorted(names);
}

function parseGemfile(content: string): string[] {
  const names: string[] = [];
  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const m = /^\s*gem\s+['"]([^'"]+)['"]/.exec(line);
    if (m?.[1]) names.push(m[1]);
  }
  return uniqueSorted(names);
}

function parseComposerJson(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const obj = parsed as Record<string, unknown>;
  const names: string[] = [];
  for (const field of ["require", "require-dev"] as const) {
    const block = obj[field];
    if (!block || typeof block !== "object") continue;
    for (const key of Object.keys(block as Record<string, unknown>)) {
      if (key.trim() && key !== "php") names.push(key.trim());
    }
  }
  return uniqueSorted(names);
}

/** Parse dependency names from a supported dependency file (no versions). */
export function parseDeps(content: string, filename: string): string[] {
  switch (filename) {
    case "package.json":
      return parsePackageJson(content);
    case "requirements.txt":
      return parseRequirementsTxt(content);
    case "Cargo.toml":
      return parseCargoToml(content);
    case "go.mod":
      return parseGoMod(content);
    case "pyproject.toml":
      return parsePyprojectToml(content);
    case "Gemfile":
      return parseGemfile(content);
    case "composer.json":
      return parseComposerJson(content);
    default:
      return [];
  }
}
