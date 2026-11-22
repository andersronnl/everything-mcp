import { test } from "node:test";
import assert from "node:assert/strict";
import { formatResults } from "../dist/format.js";

// FILETIME literals derived by hand: (unix seconds + 11644473600) * 1e7.
const FT_1970 = "116444736000000000"; // 1970-01-01T00:00:00Z
const FT_2020 = "132223104000000000"; // 2020-01-01T00:00:00Z (unix 1577836800)

const rows = [
  {
    name: "lists files with size and ISO date under a range header",
    args: [
      {
        totalResults: 47575,
        results: [
          { type: "file", name: "changelog.md", path: "C:\\a", size: "1382549", date_modified: FT_2020 },
          { type: "file", name: "x.md", path: "C:\\b", size: "1980", date_modified: FT_1970 },
        ],
      },
      0,
      12.4,
    ],
    want:
      "Found 47575 results (showing 1-2) in 12ms\n\n" +
      "C:\\a\\changelog.md  1.3 MB  2020-01-01T00:00:00.000Z\n" +
      "C:\\b\\x.md  1.9 KB  1970-01-01T00:00:00.000Z",
  },
  {
    name: "a later page is numbered from its offset",
    args: [
      { totalResults: 111, results: [{ type: "folder", name: "src", path: "C:\\p", size: "", date_modified: FT_1970 }] },
      50,
      1500,
    ],
    want: "Found 111 results (showing 51-51) in 1.50s\n\nC:\\p\\src  [folder]  1970-01-01T00:00:00.000Z",
  },
  {
    name: "zero results has no 'showing 1-0' range",
    args: [{ totalResults: 0, results: [] }, 0, 12.4],
    want: "Found 0 results in 12ms",
  },
  {
    name: "an offset past the end says so instead of an inverted range",
    args: [{ totalResults: 111, results: [] }, 500, 12.4],
    want: "Found 111 results (none at offset 500) in 12ms",
  },
  {
    name: "a drive root (empty parent path) has no leading backslash",
    args: [{ totalResults: 1, results: [{ type: "folder", name: "C:", path: "", size: "", date_modified: FT_1970 }] }, 0, 5],
    want: "Found 1 results (showing 1-1) in 5ms\n\nC:  [folder]  1970-01-01T00:00:00.000Z",
  },
  {
    name: "a parent path already ending in backslash gets no double backslash",
    args: [{ totalResults: 1, results: [{ type: "file", name: "a.txt", path: "C:\\", size: "10", date_modified: FT_1970 }] }, 0, 5],
    want: "Found 1 results (showing 1-1) in 5ms\n\nC:\\a.txt  10 B  1970-01-01T00:00:00.000Z",
  },
  {
    name: "unknown size and sentinel/invalid dates are omitted instead of crashing or showing bogus values",
    args: [
      {
        totalResults: 3,
        results: [
          { type: "file", name: "empty-size.txt", path: "C:\\p", size: "", date_modified: "18446744073709551615" },
          { type: "file", name: "max-size.txt", path: "C:\\p", size: "18446744073709551615", date_modified: "0" },
          { type: "file", name: "bad-fields.txt", path: "C:\\p", size: "not-a-number", date_modified: "not-a-date" },
        ],
      },
      0,
      5,
    ],
    want:
      "Found 3 results (showing 1-3) in 5ms\n\n" +
      "C:\\p\\empty-size.txt\n" +
      "C:\\p\\max-size.txt\n" +
      "C:\\p\\bad-fields.txt",
  },
  {
    name: "duration rounding rolls over cleanly at 1s and 1m boundaries",
    args: [{ totalResults: 0, results: [] }, 0, 119999],
    want: "Found 0 results in 2m 0.0s",
  },
];

for (const row of rows) {
  test(row.name, () => {
    assert.equal(formatResults(...row.args), row.want);
  });
}
