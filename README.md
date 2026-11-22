# Everything MCP Server

An [MCP](https://modelcontextprotocol.io/) server that gives AI assistants such as [Claude Code](https://claude.ai/code) instant file search on Windows through [Everything](https://www.voidtools.com/) by voidtools, plus content search through [ripgrep](https://github.com/BurntSushi/ripgrep).

Everything indexes every file and folder on your NTFS drives and answers queries in milliseconds. This server exposes that index as one tool, `everything_search`, so an assistant can find files by name, extension, size or date without walking the disk — and then look inside exactly those files.

![Screenshot](Screenshot.png)

> This is a fork of [Josephur/everything-mcp](https://github.com/Josephur/everything-mcp). See [What this fork adds](#what-this-fork-adds).

## What this fork adds

- **Content search.** Set the `content` parameter and ripgrep searches inside the files your Everything query matched — for example, "TODOs in TypeScript files changed this week". ripgrep is installed with the server; nothing extra to set up.
- **Scoping that doesn't change your query.** Searches are limited to the project folder by a folder prefix instead of `path:` matching, so file-name terms keep matching file names. Regex and OR queries are scoped too.
- **Argument validation.** A missing query, a bad `count` or `offset`, an unknown `sort`, a wrongly typed value or an unknown argument comes back as a clear error naming the field.
- **Timeouts.** A hung Everything server or a runaway ripgrep is abandoned after 30 seconds (configurable).
- **Accurate result headers.** No more `showing 1-0` on an empty result or a leading backslash on drive roots.
- **Read-only annotation.** The tool is marked `readOnlyHint`, so MCP clients can treat it as safe to run.
- **Tests.** A `node:test` suite covers argument parsing, scoping, formatting, ripgrep, and the server over stdio.

## Requirements

- **Windows** with [Everything](https://www.voidtools.com/) installed and running
- **Everything's HTTP server** enabled: Everything > Tools > Options > HTTP Server > Enable HTTP Server. Note the port you choose there.
- **Node.js** 18 or newer

## Install

```bash
git clone https://github.com/andersronnl/everything-mcp.git
cd everything-mcp
npm install
npm run build
```

## Register with Claude Code

```bash
claude mcp add --scope user everything-search -e EVERYTHING_PORT=<port> -- node /path/to/everything-mcp/dist/index.js
```

Replace `<port>` with the port of Everything's HTTP server and `/path/to/everything-mcp` with where you cloned the repo. **The port must match**: the server defaults to `54321`, Everything defaults to something else.

- `--scope user` makes the tool available in every project (recommended); `--scope project` limits it to the current one.
- `claude mcp list` shows whether it was added; `claude mcp remove --scope user everything-search` removes it.

Any other MCP client works the same way: run `node dist/index.js` over stdio with the environment variables below.

## The `everything_search` tool

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | _(required)_ | Everything search query — see [Search syntax](#search-syntax) |
| `content` | string | _(none)_ | Regex (ripgrep syntax) to search for inside the files the query matches — see [Content search](#content-search) |
| `count` | number | `50` | Max results to return, capped by `EVERYTHING_MAX_RESULTS` |
| `offset` | number | `0` | Result offset for pagination |
| `sort` | string | `"name"` | Sort by `name`, `path`, `size` or `date_modified` |
| `ascending` | boolean | `true` | Sort direction |
| `regex` | boolean | `false` | Treat the query as a regex |
| `case_sensitive` | boolean | `false` | Case-sensitive matching |
| `whole_word` | boolean | `false` | Match whole words only |
| `match_path` | boolean | `false` | Match the query against full paths instead of file names |
| `global` | boolean | `false` | Search the whole system instead of the project folder |
| `project_path` | string | _(none)_ | Project folder that searches are scoped to |

### Output

A file search returns one line per item — full path, size (or `[folder]`), and modification time:

```
Found 7 results (showing 1-3) in 4ms

C:\proj\src\args.ts  1.4 KB  2026-11-22T14:03:11.000Z
C:\proj\src\everything.ts  3.6 KB  2026-11-22T14:20:45.000Z
C:\proj\src  [folder]  2026-11-22T14:20:45.000Z
```

### Search syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `ext:` | Filter by extension | `ext:py`, `ext:ts;js` |
| `size:` | Filter by file size | `size:>10mb`, `size:1kb..100kb` |
| `dm:` | Date modified | `dm:today`, `dm:thisweek` |
| `dc:` | Date created | `dc:thismonth` |
| `parent:` | Match the parent folder | `parent:node_modules package.json` |
| `*` `?` | Wildcards | `*.config.*` |
| `" "` | Exact phrase | `"my file.txt"` |
| _(space)_ | AND | `foo bar` |
| `\|` | OR | `foo \| bar` |
| `!` | NOT | `!test` |
| `\folder\` | A term containing a backslash matches the path | `!\node_modules\` |
| `path:` | Match against the full path — a positive `path:` filter [skips project scoping](#project-scoping) | `path:Downloads` |

Examples:

```
ext:py                          # all Python files
ext:ts !\node_modules\          # TypeScript files, skipping anything under node_modules
size:>100mb                     # files larger than 100 MB
dm:today ext:js                 # JavaScript files modified today
*.config.*                      # config files
```

`!node_modules` only excludes items whose own *name* contains "node_modules". To exclude everything under a folder, use the backslash form `!\node_modules\` or the negated filter `!path:node_modules`. Both keep the search inside the project.

## Content search

Everything picks the files; ripgrep searches inside them. Set `content` to a regex and the tool returns matching lines as `path:line:text` instead of a file listing:

```
query: "ext:ts dm:thisweek"          content: "TODO|FIXME"    # TODOs in TypeScript files changed this week
query: "ext:log size:<10mb"          content: "timed? ?out"   # timeouts in small log files
query: "ext:ts !\node_modules\"      content: "runRipgrep"    # a symbol in your own sources
```

```
Content matches 1-2 across 7 files in 85ms

C:\proj\src\everything.ts:4:import { runRipgrep } from "./ripgrep.js";
C:\proj\src\ripgrep.ts:83:export async function runRipgrep(pattern: string, files: string[], opts: RipgrepOptions): Promise<string[]> {
```

- `count` and `offset` page through matching lines. The header says `more available, raise offset` when there are further matches.
- `case_sensitive` applies to the pattern as well as the query.
- Files are searched in the query's sort order, so `sort: "date_modified"` with `ascending: false` searches the newest files first.
- At most the first 5000 items the query matches are searched; the output says so when a query matches more. Narrow the query rather than searching everything.
- Lines longer than 300 characters are shortened.
- Your ripgrep configuration file is ignored, so results do not depend on local settings.
- Do not put Everything's own `content:` function in the query. It returns nothing over the HTTP server.

## Project scoping

By default a search only covers the project folder, so the assistant does not wander through the rest of your disk.

- **Default:** the server limits the query to `project_path` (or the `PROJECT_PATH` environment variable).
- **Global:** `global: true` searches the whole system. The response then starts with a warning telling the assistant to ask you before touching files outside the project.
- **Explicit `path:`:** a query with its own positive `path:` filter is not scoped. That is what makes `path:Downloads dm:thisweek` work, but such a query can match — and with `content`, read — files outside the project. The response then starts with an `UNSCOPED SEARCH` warning, the same ask-first notice as a global search. To narrow a search inside the project, use a `\folder\` term instead.
- **No project path:** with no `project_path` and no `PROJECT_PATH`, nothing can be scoped, so the response also starts with the `UNSCOPED SEARCH` warning.
- **Still scoped:** a negated filter (`!path:node_modules`), a `path:` inside quotes, and any query sent with `regex: true` stay inside the project folder.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EVERYTHING_HOST` | `localhost` | Everything HTTP server hostname |
| `EVERYTHING_PORT` | `54321` | Everything HTTP server port |
| `EVERYTHING_MAX_RESULTS` | `255` | Upper limit for `count` |
| `EVERYTHING_TIMEOUT_MS` | `30000` | Give up on a query, or on a ripgrep run, after this many milliseconds |
| `RIPGREP_PATH` | _(bundled)_ | ripgrep binary to use instead of the one installed with the server |
| `PROJECT_PATH` | _(none)_ | Default project folder when the tool call does not pass `project_path` |

Set them with `-e NAME=value` when adding the server:

```bash
claude mcp add --scope user everything-search -e EVERYTHING_PORT=<port> -e EVERYTHING_MAX_RESULTS=500 -- node /path/to/everything-mcp/dist/index.js
```

The result cap exists to keep token usage down: every returned line costs tokens. Raise `EVERYTHING_MAX_RESULTS` if searches are being cut short; lower it to spend less.

## Teach Claude to use it

`claude mcp add` has no field for usage instructions. To make Claude reach for this tool first, add something like this to your global `~/.claude/CLAUDE.md`:

```markdown
## Everything Search (MCP Tool)

This machine has **Everything (voidtools)** running, and the `everything_search`
MCP tool is available in every session.

### Use Everything first for file searches
**Attempt `everything_search` first for any search by file name, path, extension,
size, or date.** Do not default to Glob or Bash for those. To search inside files,
set the tool's `content` parameter (ripgrep over the files the query matches) or
use Grep; never put `content:` in the query.

### Fallbacks (only after Everything fails or is insufficient)
- **Glob** — precise relative-path patterns within the current project
- **Bash `find`** — permissions, symlinks, or other attributes Everything doesn't index

### Search syntax quick reference
- `ext:py` — by extension (multiple: `ext:ts;js`)
- `!\node_modules\` — exclude everything under a folder
- `*.config.*` — wildcards
- `size:>10mb` — size filter
- `dm:today` / `dm:thisweek` — date modified filter
- `parent:node_modules package.json` — match parent folder
- `foo bar` — AND, `foo | bar` — OR, `!foo` — NOT
- `"exact phrase"` — literal match
```

## How it works

```
MCP client  -->  this server (stdio)  -->  Everything HTTP server  -->  Everything index
                        |
                        +--> ripgrep, over the files Everything returned (content search only)
```

1. The client calls `everything_search` over MCP (stdio transport).
2. The server validates the arguments, scopes the query to the project folder, and sends it to Everything's HTTP API.
3. Everything answers from its index as JSON.
4. For a file search, the server formats paths, sizes and dates. For a content search, it hands the matched files to ripgrep and returns the matching lines.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| `Cannot connect to Everything HTTP server` | Everything is not running, its HTTP server is disabled, or `EVERYTHING_PORT` does not match the port in Everything's options. |
| `returned invalid JSON` | `EVERYTHING_PORT` points at some other web server. Use the port from Everything's HTTP Server options. |
| `Unknown argument: …` or `… must be a boolean` | The tool call passed an argument the server does not know, or a value of the wrong type. |
| `did not respond within 30000ms` | Everything is busy (for example, still indexing). Retry, or raise `EVERYTHING_TIMEOUT_MS`. |
| A file you know exists is not found | The search is scoped to the project folder. Use `global: true` to search everywhere. |
| `!node_modules` still returns files under `node_modules` | That term matches names only. Use `!\node_modules\` or `!path:node_modules`. |
| `Cannot run ripgrep at …` | The bundled binary is missing (re-run `npm install`) or `RIPGREP_PATH` points at the wrong file. |

## Development

```bash
npm run build   # compile TypeScript to dist/
npm test        # build, then run the test suite
npm start       # run the server on stdio
```

The tests run against the build and need no Everything installation: they use a stand-in HTTP server, and the ripgrep tests run the bundled binary on temporary files.

```
src/
  index.ts        # MCP server setup and tool definition
  everything.ts   # Everything HTTP API client
  args.ts         # tool argument validation
  scope.ts        # project-folder scoping of queries
  format.ts       # result and match formatting
  ripgrep.ts      # content search via ripgrep
  types.ts        # TypeScript interfaces
test/             # node:test suites
```

## Credits and license

Created by [Josephur](https://github.com/Josephur/everything-mcp); this fork builds on that work. Released under the [MIT License](LICENSE).
