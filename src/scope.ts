export interface ScopeInput {
  query: string;
  global?: boolean;
  match_path?: boolean;
  regex?: boolean;
  case_sensitive?: boolean;
  whole_word?: boolean;
}

export interface ScopedQuery {
  search: string;
  matchPath: boolean;
  regex: boolean;
}

function normalizeProjectPath(projectPath: string): string {
  return projectPath.trim().replace(/"/g, "").replace(/\//g, "\\").replace(/\\+$/, "");
}

function hasExplicitPathFilter(query: string): boolean {
  // Ignore quoted literals so "path:foo" is not mistaken for a path: modifier.
  const unquoted = query.replace(/"[^"]*(?:"|$)/g, " ");
  return /(?:^|[\s<|])(?:[a-z0-9-]+:)*path:/i.test(unquoted);
}

function hasUnquotedPipe(query: string): boolean {
  let inQuotes = false;
  for (const ch of query) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "|" && !inQuotes) return true;
  }
  return false;
}

// True when the search is allowed to reach outside the project folder: a global
// search, no project path, or a positive path: filter (a regex query stays scoped).
export function isUnscoped(params: ScopeInput, projectPath: string): boolean {
  if (!normalizeProjectPath(projectPath) || params.global) return true;
  return !params.regex && hasExplicitPathFilter(params.query);
}

// Auto-scope a query to the project folder unless a global search is requested
export function scopeQuery(params: ScopeInput, projectPath: string): ScopedQuery {
  const matchPath = Boolean(params.match_path);
  const regex = Boolean(params.regex);
  const normalized = normalizeProjectPath(projectPath);

  if (isUnscoped(params, projectPath)) {
    return { search: params.query, matchPath, regex };
  }

  const folderModifiers =
    (params.case_sensitive ? "nocase:" : "") +
    (params.whole_word ? "noww:" : "");
  // A quoted folder ending in a backslash scopes to that folder without
  // switching the whole query to match-path mode.
  const folderScope = `${folderModifiers}"${normalized}\\"`;

  if (regex) {
    // With regex=1, Everything treats the entire search string as PCRE and breaks
    // the folder prefix. Use the per-term regex: modifier instead.
    const escaped = params.query.replace(
      /(\\*)(")/g,
      (_, slashes: string) => (slashes.length % 2 === 1 ? slashes.slice(0, -1) : slashes) + "\\x22"
    );
    return { search: `${folderScope} regex:"${escaped}"`, matchPath, regex: false };
  }

  // Group OR queries so AND>OR precedence cannot leak terms outside the folder.
  const body = hasUnquotedPipe(params.query) ? `<${params.query}>` : params.query;
  return { search: `${folderScope} ${body}`, matchPath, regex: false };
}
