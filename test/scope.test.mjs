import { test } from "node:test";
import assert from "node:assert/strict";
import { scopeQuery, isUnscoped } from "../dist/scope.js";

const PROJ = "C:\\proj";

// want.search is the literal string Everything must receive.
const rows = [
  {
    name: "scopes with the folder prefix, not path: and not match-path",
    args: [{ query: "foo.py" }, PROJ],
    want: { search: '"C:\\proj\\" foo.py', matchPath: false, regex: false },
  },
  {
    name: "a project path already ending in a backslash gets exactly one",
    args: [{ query: "foo.py" }, "C:\\proj\\"],
    want: { search: '"C:\\proj\\" foo.py', matchPath: false, regex: false },
  },
  {
    name: "forward slashes in project path are normalized to backslashes",
    args: [{ query: "foo.py" }, "C:/my proj/"],
    want: { search: '"C:\\my proj\\" foo.py', matchPath: false, regex: false },
  },
  {
    name: "a project path with spaces stays one quoted term",
    args: [{ query: "ext:py" }, "C:\\my proj"],
    want: { search: '"C:\\my proj\\" ext:py', matchPath: false, regex: false },
  },
  {
    name: "whitespace-only project path means no scope",
    args: [{ query: "foo.py" }, "   "],
    want: { search: "foo.py", matchPath: false, regex: false },
  },
  {
    name: "a query carrying its own path: filter is left alone",
    args: [{ query: "path:src ext:ts" }, PROJ],
    want: { search: "path:src ext:ts", matchPath: false, regex: false },
  },
  {
    name: "negated !path: filter stays scoped to the project",
    args: [{ query: "ext:ts !path:node_modules" }, PROJ],
    want: { search: '"C:\\proj\\" ext:ts !path:node_modules', matchPath: false, regex: false },
  },
  {
    name: "no-path: modifier stays scoped to the project",
    args: [{ query: "no-path:foo" }, PROJ],
    want: { search: '"C:\\proj\\" no-path:foo', matchPath: false, regex: false },
  },
  {
    name: "quoted path: literal stays scoped to the project",
    args: [{ query: '"path:foo"' }, PROJ],
    want: { search: '"C:\\proj\\" "path:foo"', matchPath: false, regex: false },
  },
  {
    name: "OR queries are grouped so AND>OR precedence cannot escape the project",
    args: [{ query: "foo | bar" }, PROJ],
    want: { search: '"C:\\proj\\" <foo | bar>', matchPath: false, regex: false },
  },
  {
    name: "quoted pipe is not wrapped in grouping brackets",
    args: [{ query: '"foo|bar"' }, PROJ],
    want: { search: '"C:\\proj\\" "foo|bar"', matchPath: false, regex: false },
  },
  {
    name: "scoped regex uses per-term regex: modifier instead of global regex=1",
    args: [{ query: "^foo.*\\.ts$", regex: true }, PROJ],
    want: { search: '"C:\\proj\\" regex:"^foo.*\\.ts$"', matchPath: false, regex: false },
  },
  {
    name: "scoped regex escapes double quotes as PCRE \\x22",
    args: [{ query: 'a"b\\"c\\\\"d', regex: true }, PROJ],
    want: { search: '"C:\\proj\\" regex:"a\\x22b\\x22c\\\\\\x22d"', matchPath: false, regex: false },
  },
  {
    name: "scoped regex ignores path: substring inside the regex pattern",
    args: [{ query: "path:\\d+", regex: true }, PROJ],
    want: { search: '"C:\\proj\\" regex:"path:\\d+"', matchPath: false, regex: false },
  },
  {
    name: "global regex keeps regex=1 flag",
    args: [{ query: "^foo.*\\.ts$", regex: true, global: true }, PROJ],
    want: { search: "^foo.*\\.ts$", matchPath: false, regex: true },
  },
  {
    name: "case_sensitive and whole_word do not restrict the folder prefix",
    args: [{ query: "Foo", case_sensitive: true, whole_word: true }, PROJ],
    want: { search: 'nocase:noww:"C:\\proj\\" Foo', matchPath: false, regex: false },
  },
  {
    name: "global search is not scoped",
    args: [{ query: "foo.py", global: true }, PROJ],
    want: { search: "foo.py", matchPath: false, regex: false },
  },
  {
    name: "no project path means no scope",
    args: [{ query: "foo.py" }, ""],
    want: { search: "foo.py", matchPath: false, regex: false },
  },
  {
    name: "an explicit match_path is still honoured",
    args: [{ query: "foo.py", match_path: true }, PROJ],
    want: { search: '"C:\\proj\\" foo.py', matchPath: true, regex: false },
  },
];

for (const row of rows) {
  test(row.name, () => {
    assert.deepEqual(scopeQuery(...row.args), row.want);
  });
}

// Literal want per row: does this call leave the project folder unscoped?
const unscopedRows = [
  { name: "plain query with a project path is scoped", args: [{ query: "foo.py" }, PROJ], want: false },
  { name: "global is unscoped", args: [{ query: "foo.py", global: true }, PROJ], want: true },
  { name: "no project path is unscoped", args: [{ query: "foo.py" }, ""], want: true },
  { name: "whitespace project path is unscoped", args: [{ query: "foo.py" }, "  "], want: true },
  { name: "positive path: filter is unscoped", args: [{ query: "path:Downloads dm:thisweek" }, PROJ], want: true },
  { name: "negated !path: filter stays scoped", args: [{ query: "ext:ts !path:node_modules" }, PROJ], want: false },
  { name: "quoted path: literal stays scoped", args: [{ query: '"path:foo"' }, PROJ], want: false },
  { name: "regex containing path: stays scoped", args: [{ query: "path:\d+", regex: true }, PROJ], want: false },
];

for (const row of unscopedRows) {
  test(`isUnscoped: ${row.name}`, () => {
    assert.equal(isUnscoped(...row.args), row.want);
  });
}
