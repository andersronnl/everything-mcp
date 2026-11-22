import { SearchParams } from "./types.js";

export const SORT_FIELDS = ["name", "path", "size", "date_modified"];

// Turn raw tool-call arguments into search parameters, rejecting unusable ones
export function parseArgs(args: Record<string, unknown> | undefined, maxResults: number): SearchParams {
  const a = args ?? {};

  if (typeof a.query !== "string" || a.query.trim() === "") {
    throw new Error("query must be a non-empty string");
  }
  const count = Number(a.count ?? 50);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("count must be a positive integer");
  }
  const offset = Number(a.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("offset must be a non-negative integer");
  }
  const sort = a.sort ?? "name";
  if (typeof sort !== "string" || !SORT_FIELDS.includes(sort)) {
    throw new Error(`sort must be one of ${SORT_FIELDS.join(", ")}`);
  }
  const content = a.content ?? "";
  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }

  return {
    query: a.query,
    count: Math.min(count, maxResults),
    offset,
    sort,
    ascending: (a.ascending as boolean) ?? true,
    regex: (a.regex as boolean) ?? false,
    case_sensitive: (a.case_sensitive as boolean) ?? false,
    whole_word: (a.whole_word as boolean) ?? false,
    match_path: (a.match_path as boolean) ?? false,
    global: (a.global as boolean) ?? false,
    project_path: (a.project_path as string) ?? "",
    content,
  };
}
