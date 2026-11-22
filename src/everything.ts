import { EverythingResponse, SearchParams } from "./types.js";
import { scopeQuery } from "./scope.js";
import { formatMatches, formatResults, fullPath } from "./format.js";
import { runRipgrep } from "./ripgrep.js";

const EVERYTHING_HOST = process.env.EVERYTHING_HOST || "localhost";
const EVERYTHING_PORT = process.env.EVERYTHING_PORT || "54321";
const PROJECT_PATH = process.env.PROJECT_PATH || "";
export const MAX_RESULTS = Math.max(1, Number(process.env.EVERYTHING_MAX_RESULTS) || 255);
const TIMEOUT_MS = Math.max(1, Number(process.env.EVERYTHING_TIMEOUT_MS) || 30000);
const CONTENT_MAX_FILES = 5000; // most files one content search will open

export async function searchEverything(params: SearchParams): Promise<string> {
  const url = new URL(`http://${EVERYTHING_HOST}:${EVERYTHING_PORT}/`);

  // Use project_path from params, fall back to env var
  const projectPath = params.project_path || PROJECT_PATH;

  const { search, matchPath } = scopeQuery(params, projectPath);
  const globalWarning = params.global
    ? `⚠️ GLOBAL SEARCH: Results may include files outside the project folder (${projectPath || "no project path set"}). You MUST ask the user for permission before accessing files or disk contents outside the project folder.\n\n`
    : "";

  url.searchParams.set("search", search);
  url.searchParams.set("json", "1");
  // A content search needs every candidate file, not one page of them
  url.searchParams.set("count", String(params.content ? CONTENT_MAX_FILES : params.count));
  url.searchParams.set("offset", String(params.content ? 0 : params.offset));
  url.searchParams.set("path_column", "1");
  url.searchParams.set("size_column", "1");
  url.searchParams.set("date_modified_column", "1");
  url.searchParams.set("sort", params.sort);
  url.searchParams.set("ascending", params.ascending ? "1" : "0");
  if (params.regex) url.searchParams.set("regex", "1");
  if (params.case_sensitive) url.searchParams.set("case", "1");
  if (params.whole_word) url.searchParams.set("wholeword", "1");
  if (matchPath) url.searchParams.set("path", "1");

  let response: Response;
  const startTime = performance.now();
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(
        `Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT} did not respond within ${TIMEOUT_MS}ms.`
      );
    }
    throw new Error(
      `Cannot connect to Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT}. ` +
      `Make sure Everything is running and the HTTP server plugin is enabled ` +
      `(Tools > Options > HTTP Server > Enable HTTP Server).`
    );
  }

  if (!response.ok) {
    throw new Error(`Everything HTTP server returned ${response.status}: ${response.statusText}`);
  }

  const data: EverythingResponse = await response.json();

  if (params.content) {
    const files = data.results.filter((r) => r.type === "file").map(fullPath);
    const lines = await runRipgrep(params.content, files, {
      caseSensitive: params.case_sensitive,
      limit: params.offset + params.count + 1, // one extra line shows there is more
      timeoutMs: TIMEOUT_MS,
    });
    return (
      globalWarning +
      formatMatches(lines, {
        offset: params.offset,
        count: params.count,
        files: files.length,
        considered: data.results.length,
        total: data.totalResults,
        elapsedMs: performance.now() - startTime,
      })
    );
  }

  const elapsed = performance.now() - startTime;
  return globalWarning + formatResults(data, params.offset, elapsed);
}
