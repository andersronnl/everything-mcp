import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A stand-in Everything HTTP server: hangs forever on "hang", answers otherwise.
const LISTING = {
  totalResults: 1,
  results: [{ type: "file", name: "a.txt", path: "C:\\p", size: "512", date_modified: "116444736000000000" }],
};
let reply = LISTING;
const sockets = new Set();
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  requests.push(url);
  const q = url.searchParams.get("search") ?? "";
  if (q.includes("hang-body")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"totalResults":1');
    return;
  }
  if (q.includes("hang")) return;
  if (q.includes("bad-json")) {
    res.setHeader("content-type", "text/html");
    res.end("<html>not json</html>");
    return;
  }
  if (q.includes("bad-shape")) {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(reply));
});
server.on("connection", (s) => sockets.add(s));
await new Promise((r) => server.listen(0, "127.0.0.1", r));
after(() => {
  for (const s of sockets) s.destroy();
  server.close();
});

// The module reads its config at import time, so set it first.
process.env.EVERYTHING_HOST = "127.0.0.1";
process.env.EVERYTHING_PORT = String(server.address().port);
process.env.EVERYTHING_TIMEOUT_MS = "200";
delete process.env.PROJECT_PATH;
const { searchEverything } = await import("../dist/everything.js");

const params = (query) => ({
  query,
  count: 50,
  offset: 0,
  sort: "name",
  ascending: true,
  regex: false,
  case_sensitive: false,
  whole_word: false,
  match_path: false,
  global: false,
  project_path: "C:\\p",
  content: "",
});

test("a search returns the formatted listing", async () => {
  const out = await searchEverything(params("a.txt"));
  assert.match(out, /^Found 1 results \(showing 1-1\) in \d+ms\n\nC:\\p\\a\.txt  512 B  1970-01-01T00:00:00\.000Z$/);
  assert.equal(requests.at(-1).searchParams.get("search"), '"C:\\p\\" a.txt');
});

// Literal want per row: does the response open with a warning that the search left the project?
const bannerRows = [
  { name: "scoped search carries no banner", extra: {}, want: null },
  { name: "global search says GLOBAL SEARCH", extra: { global: true }, want: /^⚠️ GLOBAL SEARCH: .*\(C:\\p\)/ },
  { name: "no project path says UNSCOPED SEARCH", extra: { project_path: "" }, want: /^⚠️ UNSCOPED SEARCH: .*\(no project path set\)/ },
  { name: "positive path: filter says UNSCOPED SEARCH", query: "path:p a.txt", extra: {}, want: /^⚠️ UNSCOPED SEARCH: .*\(C:\\p\)/ },
];

for (const row of bannerRows) {
  test(`warning banner: ${row.name}`, async () => {
    const out = await searchEverything({ ...params(row.query ?? "a.txt"), ...row.extra });
    if (row.want === null) assert.doesNotMatch(out, /⚠️/);
    else assert.match(out, row.want);
  });
}

test("a hung server is given up on after the configured timeout", async () => {
  let timer;
  const sentinel = new Promise((r) => {
    timer = setTimeout(() => r("still waiting after 2000ms"), 2000);
  });
  const outcome = await Promise.race([
    searchEverything(params("hang")).then(
      () => "resolved",
      (e) => e.message
    ),
    sentinel,
  ]);
  clearTimeout(timer);
  assert.match(outcome, /did not respond within 200ms/);
});

test("content search runs ripgrep over the files the query matched", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "everything-mcp-content-"));
  t.after(() => {
    reply = LISTING;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(dir, "a.txt"), "x\nNeedle here\n");
  fs.writeFileSync(path.join(dir, "b.txt"), "another needle\n");
  fs.mkdirSync(path.join(dir, "sub.txt"));
  const date_modified = "116444736000000000";
  reply = {
    totalResults: 3,
    results: [
      { type: "folder", name: "sub.txt", path: dir, size: "", date_modified },
      { type: "file", name: "a.txt", path: dir, size: "14", date_modified },
      { type: "file", name: "b.txt", path: dir, size: "3", date_modified },
    ],
  };

  const out = await searchEverything({ ...params("ext:txt"), count: 10, content: "needle" });
  const [header, blank, ...lines] = out.split("\n");
  assert.match(header, /^Content matches 1-2 across 2 files in \d+ms$/);
  assert.equal(blank, "");
  assert.deepEqual(lines, [`${path.join(dir, "a.txt")}:2:Needle here`, `${path.join(dir, "b.txt")}:1:another needle`]);

  // count and offset page through matching lines
  const first = await searchEverything({ ...params("ext:txt"), count: 1, content: "needle" });
  assert.match(first, /^Content matches 1-1 across 2 files \(more available, raise offset\) in \d+ms\n\n.*a\.txt:2:Needle here$/);
  const second = await searchEverything({ ...params("ext:txt"), count: 1, offset: 1, content: "needle" });
  assert.match(second, /^Content matches 2-2 across 2 files in \d+ms\n\n.*b\.txt:1:another needle$/);
  // Every matching file is a candidate, not just one page of them.
  assert.equal(requests.at(-1).searchParams.get("count"), "5000");
  assert.equal(requests.at(-1).searchParams.get("offset"), "0");
});

test("body timeout, invalid JSON, and unexpected JSON shape produce clear errors", async () => {
  await assert.rejects(searchEverything(params("hang-body")), /did not respond within 200ms/);
  await assert.rejects(searchEverything(params("bad-json")), /returned invalid JSON/);
  await assert.rejects(searchEverything(params("bad-shape")), /returned an unexpected response/);
});

test("scoped regex uses regex: modifier without regex=1, while global regex sets regex=1", async () => {
  await searchEverything({ ...params("^a\\.txt$"), regex: true });
  assert.equal(requests.at(-1).searchParams.get("regex"), null);
  assert.equal(requests.at(-1).searchParams.get("search"), '"C:\\p\\" regex:"^a\\.txt$"');

  await searchEverything({ ...params("^a\\.txt$"), regex: true, global: true });
  assert.equal(requests.at(-1).searchParams.get("regex"), "1");
  assert.equal(requests.at(-1).searchParams.get("search"), "^a\\.txt$");
});
