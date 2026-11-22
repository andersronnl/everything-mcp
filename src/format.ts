import { EverythingResponse, EverythingResult } from "./types.js";

const FILETIME_EPOCH_DIFF = 11644473600000n; // ms between 1601-01-01 and 1970-01-01
const FILETIME_TICKS_PER_MS = 10000n;

function filetimeToISO(filetime: string): string {
  const ft = BigInt(filetime);
  const ms = ft / FILETIME_TICKS_PER_MS - FILETIME_EPOCH_DIFF;
  return new Date(Number(ms)).toISOString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatSize(sizeStr: string): string {
  const size = Number(sizeStr);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fullPath(r: EverythingResult): string {
  // A drive root has an empty parent path
  return r.path ? `${r.path}\\${r.name}` : r.name;
}

// Render one page of Everything results as the text the tool returns
export function formatResults(data: EverythingResponse, offset: number, elapsedMs: number): string {
  const shown = data.results.length;
  let range = "";
  if (shown > 0) range = ` (showing ${offset + 1}-${offset + shown})`;
  else if (data.totalResults > 0) range = ` (none at offset ${offset})`;

  const lines: string[] = [];
  lines.push(`Found ${data.totalResults} results${range} in ${formatDuration(elapsedMs)}`);
  if (shown > 0) lines.push("");

  for (const r of data.results) {
    const parts: string[] = [fullPath(r)];

    if (r.type === "folder") {
      parts.push("[folder]");
    } else if (r.size !== undefined) {
      parts.push(formatSize(r.size));
    }

    if (r.date_modified) {
      parts.push(filetimeToISO(r.date_modified));
    }

    lines.push(parts.join("  "));
  }

  return lines.join("\n");
}

export interface MatchInfo {
  offset: number;
  count: number;
  files: number; // files handed to ripgrep
  considered: number; // Everything results fetched (files and folders)
  total: number; // Everything results matching the query
  elapsedMs: number;
}

// Render one page of ripgrep matches as the text the tool returns
export function formatMatches(lines: string[], info: MatchInfo): string {
  const page = lines.slice(info.offset, info.offset + info.count);
  const scope = `across ${info.files} files`;
  const took = `in ${formatDuration(info.elapsedMs)}`;

  const out: string[] = [];
  if (page.length === 0) {
    const where = info.offset > 0 ? ` at offset ${info.offset}` : "";
    out.push(`No content matches${where} ${scope} ${took}`);
  } else {
    const more = lines.length > info.offset + info.count ? " (more available, raise offset)" : "";
    out.push(`Content matches ${info.offset + 1}-${info.offset + page.length} ${scope}${more} ${took}`);
    out.push("", ...page);
  }
  if (info.total > info.considered) {
    out.push(
      "",
      `Note: the query matched ${info.total} items but only the first ${info.considered} were considered. Narrow the query to cover the rest.`
    );
  }
  return out.join("\n");
}
