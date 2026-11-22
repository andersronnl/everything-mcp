import { spawn } from "node:child_process";
import { rgPath as BUNDLED_RG } from "@vscode/ripgrep";

const RG_PATH = process.env.RIPGREP_PATH || BUNDLED_RG;
// Windows caps a command line at 32,767 characters; leave headroom for quoting.
const MAX_CMD_CHARS = 30000;
const FLAG_OVERHEAD = 512;

export interface RipgrepOptions {
  caseSensitive: boolean;
  limit: number; // stop after this many matching lines
  timeoutMs?: number;
  rgPath?: string;
}

// Split paths into groups that each fit on one command line
export function chunkPaths(paths: string[], maxChars: number): string[][] {
  const chunks: string[][] = [];
  let size = 0;
  for (const p of paths) {
    const cost = p.length + 3; // two quotes and a separating space
    if (chunks.length === 0 || size + cost > maxChars) {
      chunks.push([]);
      size = 0;
    }
    chunks[chunks.length - 1].push(p);
    size += cost;
  }
  return chunks;
}

function runChunk(
  pattern: string,
  files: string[],
  opts: RipgrepOptions,
  limit: number,
  remainingMs: number,
  totalTimeoutMs: number
): Promise<string[]> {
  const rgPath = opts.rgPath ?? RG_PATH;
  return new Promise((resolve, reject) => {
    const child = spawn(
      rgPath,
      [
        "--no-config", // ignore user RIPGREP_CONFIG_PATH settings
        "--max-depth=0", // never recurse if a listed path has become a directory
        "--line-number",
        "--with-filename",
        "--no-heading",
        "--color=never",
        "--no-messages", // unreadable files are skipped, not reported
        "--threads=1", // keeps output in the order the files were given
        "--max-columns=300",
        "--max-columns-preview",
        opts.caseSensitive ? "--case-sensitive" : "--ignore-case",
        "--regexp",
        pattern,
        "--",
        ...files,
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true }
    );

    let out = "";
    let err = "";
    let newlines = 0;
    let enough = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, remainingMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      if (enough) return;
      out += text;
      newlines += text.split("\n").length - 1;
      if (newlines >= limit) {
        enough = true;
        clearTimeout(timer);
        child.kill();
      }
    });
    child.stderr.on("data", (text: string) => {
      err += text;
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Cannot run ripgrep at ${rgPath}: ${e.message}`));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut && !enough) return reject(new Error(`ripgrep timed out after ${totalTimeoutMs}ms`));
      if (!enough) {
        if (signal) return reject(new Error(`ripgrep exited due to signal ${signal}`));
        if (code !== 0 && code !== 1) {
          // Exit code 2 with empty stderr means --no-messages skipped an unreadable file.
          if (code !== 2 || err.trim()) {
            const detail = err.trim() || `exited with code ${code}`;
            return reject(new Error(`ripgrep: ${detail}`));
          }
        }
      }
      const rawLines = out.split(/\r?\n/);
      // Drop the empty tail after the final newline, or a partial line if killed early
      if (enough || out.endsWith("\n") || out === "") rawLines.pop();
      resolve(rawLines.slice(0, limit));
    });
  });
}

// Search the given files for a regex; returns up to opts.limit "path:line:text" lines
export async function runRipgrep(pattern: string, files: string[], opts: RipgrepOptions): Promise<string[]> {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const rgPath = opts.rgPath ?? RG_PATH;
  const maxArgChars = Math.max(1024, MAX_CMD_CHARS - rgPath.length - pattern.length - FLAG_OVERHEAD);
  const deadline = Date.now() + timeoutMs;

  const lines: string[] = [];
  for (const chunk of chunkPaths(files, maxArgChars)) {
    if (lines.length >= opts.limit) break;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`ripgrep timed out after ${timeoutMs}ms`);
    }
    lines.push(...(await runChunk(pattern, chunk, opts, opts.limit - lines.length, remaining, timeoutMs)));
  }
  return lines;
}
