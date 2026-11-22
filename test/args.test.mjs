import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../dist/args.js";

const MAX = 255;
const DEFAULTS = {
  query: "foo",
  count: 50,
  offset: 0,
  sort: "name",
  ascending: true,
  regex: false,
  case_sensitive: false,
  whole_word: false,
  match_path: false,
  global: false,
  project_path: "",
  content: "",
};

const ok = [
  { name: "only a query gets every default", args: { query: "foo" }, want: DEFAULTS },
  { name: "count above the max is clamped to it", args: { query: "foo", count: 1000 }, want: { ...DEFAULTS, count: 255 } },
  {
    name: "explicit values are passed through",
    args: { query: "foo", count: 10, offset: 20, sort: "size", ascending: false, global: true, project_path: "C:\\p" },
    want: { ...DEFAULTS, count: 10, offset: 20, sort: "size", ascending: false, global: true, project_path: "C:\\p" },
  },
  { name: "content is passed through", args: { query: "foo", content: "TODO" }, want: { ...DEFAULTS, content: "TODO" } },
];

for (const row of ok) {
  test(row.name, () => {
    assert.deepEqual(parseArgs(row.args, MAX), row.want);
  });
}

const bad = [
  { name: "missing arguments", args: undefined, want: /query must be a non-empty string/ },
  { name: "missing query", args: {}, want: /query must be a non-empty string/ },
  { name: "blank query", args: { query: "   " }, want: /query must be a non-empty string/ },
  { name: "non-string query", args: { query: 5 }, want: /query must be a non-empty string/ },
  { name: "non-numeric count", args: { query: "a", count: "abc" }, want: /count must be a positive integer/ },
  { name: "zero count", args: { query: "a", count: 0 }, want: /count must be a positive integer/ },
  { name: "negative count", args: { query: "a", count: -5 }, want: /count must be a positive integer/ },
  { name: "fractional count", args: { query: "a", count: 2.7 }, want: /count must be a positive integer/ },
  { name: "negative offset", args: { query: "a", offset: -1 }, want: /offset must be a non-negative integer/ },
  { name: "non-numeric offset", args: { query: "a", offset: "x" }, want: /offset must be a non-negative integer/ },
  { name: "unknown sort field", args: { query: "a", sort: "bogus" }, want: /sort must be one of name, path, size, date_modified/ },
  { name: "non-string content", args: { query: "a", content: 5 }, want: /content must be a string/ },
];

for (const row of bad) {
  test(`rejects ${row.name}`, () => {
    assert.throws(() => parseArgs(row.args, MAX), row.want);
  });
}
