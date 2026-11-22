import { SearchParams } from "./types.js";

export const SORT_FIELDS = ["name", "path", "size", "date_modified"];

const KNOWN_KEYS = new Set([
  "query",
  "count",
  "offset",
  "sort",
  "ascending",
  "regex",
  "case_sensitive",
  "whole_word",
  "match_path",
  "global",
  "project_path",
  "content",
]);

function parseBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

// Turn raw tool-call arguments into search parameters, rejecting unusable ones
export function parseArgs(args: Record<string, unknown> | undefined, maxResults: number): SearchParams {
  if (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args))) {
    throw new Error("arguments must be an object");
  }
  const a = args ?? {};

  for (const key of Object.keys(a)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
  }

  if (typeof a.query !== "string" || a.query.trim() === "") {
    throw new Error("query must be a non-empty string");
  }

  const count = a.count === undefined ? 50 : a.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) {
    throw new Error("count must be a positive integer");
  }

  const offset = a.offset === undefined ? 0 : a.offset;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  const sort = a.sort === undefined ? "name" : a.sort;
  if (typeof sort !== "string" || !SORT_FIELDS.includes(sort)) {
    throw new Error(`sort must be one of ${SORT_FIELDS.join(", ")}`);
  }

  const content = a.content === undefined ? "" : a.content;
  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }

  const projectPath = a.project_path === undefined ? "" : a.project_path;
  if (typeof projectPath !== "string") {
    throw new Error("project_path must be a string");
  }

  return {
    query: a.query,
    count: Math.min(count, maxResults),
    offset,
    sort,
    ascending: parseBoolean(a.ascending, "ascending", true),
    regex: parseBoolean(a.regex, "regex", false),
    case_sensitive: parseBoolean(a.case_sensitive, "case_sensitive", false),
    whole_word: parseBoolean(a.whole_word, "whole_word", false),
    match_path: parseBoolean(a.match_path, "match_path", false),
    global: parseBoolean(a.global, "global", false),
    project_path: projectPath,
    content,
  };
}
