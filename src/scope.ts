export interface ScopeInput {
  query: string;
  global?: boolean;
  match_path?: boolean;
}

export interface ScopedQuery {
  search: string;
  matchPath: boolean;
}

// Auto-scope a query to the project folder unless a global search is requested
export function scopeQuery(params: ScopeInput, projectPath: string): ScopedQuery {
  let search = params.query;
  const hasPathFilter = /\bpath:/i.test(params.query);
  if (projectPath && !params.global) {
    // Only add the folder scope if the query doesn't already contain a path: filter
    if (!hasPathFilter) {
      // A quoted folder ending in a backslash scopes to that folder without
      // switching the whole query to match-path mode.
      search = `"${projectPath.replace(/\\+$/, "")}\\" ${search}`;
    }
  }
  return { search, matchPath: Boolean(params.match_path) };
}
