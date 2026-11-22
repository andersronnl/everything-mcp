import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMatches } from "../dist/format.js";

// lines holds up to offset + count + 1 ripgrep lines; the extra one signals more.
const base = { offset: 0, count: 50, files: 3, considered: 3, total: 3, elapsedMs: 12.4 };

const rows = [
  {
    name: "lists the matches under a range header",
    args: [["p:1:a", "p:2:b"], base],
    want: "Content matches 1-2 across 3 files in 12ms\n\np:1:a\np:2:b",
  },
  {
    name: "a line beyond count is withheld and announced",
    args: [["l1", "l2", "l3"], { ...base, count: 2 }],
    want: "Content matches 1-2 across 3 files (more available, raise offset) in 12ms\n\nl1\nl2",
  },
  {
    name: "offset skips earlier matches",
    args: [["l1", "l2", "l3"], { ...base, offset: 1, count: 5 }],
    want: "Content matches 2-3 across 3 files in 12ms\n\nl2\nl3",
  },
  {
    name: "no matches",
    args: [[], base],
    want: "No content matches across 3 files in 12ms",
  },
  {
    name: "an offset past the last match says so",
    args: [["l1"], { ...base, offset: 5 }],
    want: "No content matches at offset 5 across 3 files in 12ms",
  },
  {
    name: "a query matching more items than were considered is flagged",
    args: [["l1"], { ...base, files: 2, considered: 5, total: 10 }],
    want:
      "Content matches 1-1 across 2 files in 12ms\n\nl1\n\n" +
      "Note: the query matched 10 items but only the first 5 were considered. Narrow the query to cover the rest.",
  },
];

for (const row of rows) {
  test(row.name, () => {
    assert.equal(formatMatches(...row.args), row.want);
  });
}
