/**
 * Parse env-looking lines from `.env*` style files into unique variable names.
 * Handles active assignments (`KEY=`), `export KEY=`, and commented examples
 * (`# KEY=`) — the latter are common in .env.example template files where
 * every variable is shown as a comment.
 * Pure comment lines (no `=`) and section-header comments are ignored.
 */
export function parseEnvKeys(content: string): string[] {
  const keys = new Set<string>();

  for (const rawLine of content.split(/\n/)) {
    const line = rawLine.replace(/\r$/, "");
    let m = /^\s*export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m) m = /^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (!m) continue;
    keys.add(m[1]);
  }

  return [...keys];
}
