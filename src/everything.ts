import { EverythingResponse, SearchParams } from "./types.js";
import { scopeQuery } from "./scope.js";
import { formatMatches, formatResults, fullPath } from "./format.js";
import { runRipgrep } from "./ripgrep.js";

const MAX_TIMEOUT_MS = 2_147_483_647;

function parsePositiveIntEnv(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

const EVERYTHING_HOST = process.env.EVERYTHING_HOST || "localhost";
const EVERYTHING_PORT = process.env.EVERYTHING_PORT || "54321";
const PROJECT_PATH = process.env.PROJECT_PATH || "";
export const MAX_RESULTS = parsePositiveIntEnv(process.env.EVERYTHING_MAX_RESULTS, 255);
const TIMEOUT_MS = parsePositiveIntEnv(process.env.EVERYTHING_TIMEOUT_MS, 30000, MAX_TIMEOUT_MS);
const CONTENT_MAX_FILES = 5000; // most files one content search will open

export async function searchEverything(params: SearchParams): Promise<string> {
  const url = new URL(`http://${formatHost(EVERYTHING_HOST)}:${EVERYTHING_PORT}/`);

  // Use project_path from params, fall back to env var
  const projectPath = params.project_path.trim() || PROJECT_PATH.trim();

  const { search, matchPath, regex } = scopeQuery(params, projectPath);
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
  if (regex) url.searchParams.set("regex", "1");
  if (params.case_sensitive) url.searchParams.set("case", "1");
  if (params.whole_word) url.searchParams.set("wholeword", "1");
  if (matchPath) url.searchParams.set("path", "1");

  let data: EverythingResponse;
  const startTime = performance.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      throw new Error(`Everything HTTP server returned ${response.status}: ${response.statusText}`);
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
        throw error;
      }
      throw new Error(
        `Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT} returned invalid JSON. ` +
        `Verify that Everything's HTTP server is listening on that port.`
      );
    }
    if (
      typeof raw !== "object" ||
      raw === null ||
      !Array.isArray((raw as EverythingResponse).results) ||
      !Number.isFinite(Number((raw as EverythingResponse).totalResults))
    ) {
      throw new Error(
        `Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT} returned an unexpected response.`
      );
    }
    const parsed = raw as EverythingResponse;
    data = {
      totalResults: Number(parsed.totalResults),
      results: parsed.results,
    };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "TimeoutError")) {
      throw new Error(
        `Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT} did not respond within ${TIMEOUT_MS}ms.`
      );
    }
    if (error instanceof Error && error.message.startsWith("Everything HTTP server")) {
      throw error;
    }
    throw new Error(
      `Cannot connect to Everything HTTP server at ${EVERYTHING_HOST}:${EVERYTHING_PORT}. ` +
      `Make sure Everything is running and the HTTP server plugin is enabled ` +
      `(Tools > Options > HTTP Server > Enable HTTP Server).`
    );
  }

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
