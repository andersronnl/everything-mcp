import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chunkPaths, runRipgrep } from "../dist/ripgrep.js";

// Each path costs its length + 3 (two quotes and a separating space).
const chunkRows = [
  { name: "no paths give no chunks", args: [[], 10], want: [] },
  { name: "paths that exactly fill the budget share a chunk", args: [["aaaa", "bbbb", "cc"], 14], want: [["aaaa", "bbbb"], ["cc"]] },
  { name: "one character over the budget starts a new chunk", args: [["aaaa", "bbbb", "cc"], 13], want: [["aaaa"], ["bbbb", "cc"]] },
  { name: "a path longer than the budget still gets a chunk", args: [["aaaaaaaaaaaa"], 5], want: [["aaaaaaaaaaaa"]] },
];
for (const row of chunkRows) {
  test(`chunkPaths: ${row.name}`, () => {
    assert.deepEqual(chunkPaths(...row.args), row.want);
  });
}

let dir, a, b, c, d;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "everything-mcp-rg-"));
  a = path.join(dir, "a.txt");
  b = path.join(dir, "b.txt");
  c = path.join(dir, "c.txt");
  d = path.join(dir, "d e.txt");
  fs.writeFileSync(a, "alpha\nTODO one\nbeta\n");
  fs.writeFileSync(b, "todo two\n");
  fs.writeFileSync(c, "nothing\n");
  fs.writeFileSync(d, "x\ny\nTODO -x three\n");
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const opts = { caseSensitive: false, limit: 10 };

test("matches come back as path:line:text in the order the files were given", async () => {
  assert.deepEqual(await runRipgrep("TODO", [a, b, c, d], opts), [
    `${a}:2:TODO one`,
    `${b}:1:todo two`,
    `${d}:3:TODO -x three`,
  ]);
  assert.deepEqual(await runRipgrep("TODO", [d, b, a], opts), [
    `${d}:3:TODO -x three`,
    `${b}:1:todo two`,
    `${a}:2:TODO one`,
  ]);
});

test("case_sensitive excludes other-case matches", async () => {
  assert.deepEqual(await runRipgrep("TODO", [a, b, c, d], { ...opts, caseSensitive: true }), [
    `${a}:2:TODO one`,
    `${d}:3:TODO -x three`,
  ]);
});

test("no more than limit lines are returned", async () => {
  assert.deepEqual(await runRipgrep("TODO", [a, b, c, d], { ...opts, limit: 2 }), [
    `${a}:2:TODO one`,
    `${b}:1:todo two`,
  ]);
});

test("a pattern starting with a dash is a pattern, not a flag", async () => {
  assert.deepEqual(await runRipgrep("-x", [a, d], opts), [`${d}:3:TODO -x three`]);
});

test("an invalid regex is reported as a ripgrep error", async () => {
  await assert.rejects(runRipgrep("(", [a], opts), /ripgrep: rg: regex parse error/);
});

test("a missing ripgrep binary is reported with its path", async () => {
  await assert.rejects(
    runRipgrep("TODO", [a], { ...opts, rgPath: path.join(dir, "no-such-rg.exe") }),
    /Cannot run ripgrep at .*no-such-rg\.exe/
  );
});

test("more files than fit on one command line are all searched, in order", async () => {
  const files = [];
  for (let i = 0; i < 400; i++) {
    const f = path.join(dir, `file-with-a-deliberately-long-name-to-fill-the-command-line-${String(i).padStart(4, "0")}.txt`);
    fs.writeFileSync(f, `needle ${i}\n`);
    files.push(f);
  }
  // 400 paths of 100+ characters exceed the 32,767-character Windows limit.
  assert.ok(files.join(" ").length > 40000);
  const got = await runRipgrep("needle", files, { ...opts, limit: 1000 });
  assert.equal(got.length, 400);
  assert.equal(got[0], `${files[0]}:1:needle 0`);
  assert.equal(got[399], `${files[399]}:1:needle 399`);

  await assert.rejects(runRipgrep("needle", files, { ...opts, limit: 1000, timeoutMs: 1 }), /ripgrep timed out after 1ms/);
});
