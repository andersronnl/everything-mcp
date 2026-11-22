import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeQuery } from "../dist/scope.js";

const PROJ = "C:\\proj";

// want.search is the literal string Everything must receive.
const rows = [
  {
    name: "scopes with the folder prefix, not path: and not match-path",
    args: [{ query: "foo.py" }, PROJ],
    want: { search: '"C:\\proj\\" foo.py', matchPath: false },
  },
  {
    name: "a project path already ending in a backslash gets exactly one",
    args: [{ query: "foo.py" }, "C:\\proj\\"],
    want: { search: '"C:\\proj\\" foo.py', matchPath: false },
  },
  {
    name: "a project path with spaces stays one quoted term",
    args: [{ query: "ext:py" }, "C:\\my proj"],
    want: { search: '"C:\\my proj\\" ext:py', matchPath: false },
  },
  {
    name: "a query carrying its own path: filter is left alone",
    args: [{ query: "path:src ext:ts" }, PROJ],
    want: { search: "path:src ext:ts", matchPath: false },
  },
  {
    name: "global search is not scoped",
    args: [{ query: "foo.py", global: true }, PROJ],
    want: { search: "foo.py", matchPath: false },
  },
  {
    name: "no project path means no scope",
    args: [{ query: "foo.py" }, ""],
    want: { search: "foo.py", matchPath: false },
  },
  {
    name: "an explicit match_path is still honoured",
    args: [{ query: "foo.py", match_path: true }, PROJ],
    want: { search: '"C:\\proj\\" foo.py', matchPath: true },
  },
];

for (const row of rows) {
  test(row.name, () => {
    assert.deepEqual(scopeQuery(...row.args), row.want);
  });
}
