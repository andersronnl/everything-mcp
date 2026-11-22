import { spawn } from "node:child_process";
import { rgPath as BUNDLED_RG } from "@vscode/ripgrep";

const RG_PATH = process.env.RIPGREP_PATH || BUNDLED_RG;
// Windows caps a command line at 32,767 characters; leave room for the flags.
const MAX_ARG_CHARS = 28000;

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

function runChunk(pattern: string, files: string[], opts: RipgrepOptions, limit: number): Promise<string[]> {
  const rgPath = opts.rgPath ?? RG_PATH;
  const timeoutMs = opts.timeoutMs ?? 30000;
  return new Promise((resolve, reject) => {
    const child = spawn(
      rgPath,
      [
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
      { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, windowsHide: true }
    );

    let out = "";
    let err = "";
    let newlines = 0;
    let enough = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      out += text;
      newlines += text.split("\n").length - 1;
      if (!enough && newlines >= limit) {
        enough = true;
        child.kill();
      }
    });
    child.stderr.on("data", (text: string) => {
      err += text;
    });
    child.on("error", (e) => reject(new Error(`Cannot run ripgrep at ${rgPath}: ${e.message}`)));
    child.on("close", (code, signal) => {
      if (signal && !enough) return reject(new Error(`ripgrep timed out after ${timeoutMs}ms`));
      if (code === 2 && err.trim()) return reject(new Error(`ripgrep: ${err.trim()}`));
      // Only complete lines: the text after the last newline is empty or cut off
      resolve(out.split(/\r?\n/).slice(0, -1).slice(0, limit));
    });
  });
}

// Search the given files for a regex; returns up to opts.limit "path:line:text" lines
export async function runRipgrep(pattern: string, files: string[], opts: RipgrepOptions): Promise<string[]> {
  const lines: string[] = [];
  for (const chunk of chunkPaths(files, MAX_ARG_CHARS)) {
    if (lines.length >= opts.limit) break;
    lines.push(...(await runChunk(pattern, chunk, opts, opts.limit - lines.length)));
  }
  return lines;
}
