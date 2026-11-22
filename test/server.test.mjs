import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Drives the built server over stdio, the way an MCP client does.
const client = new Client({ name: "test", version: "0" });
let tool;

before(async () => {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
      stderr: "ignore",
    })
  );
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  tool = tools[0];
});
after(() => client.close());

test("the one tool is everything_search", () => {
  assert.equal(tool.name, "everything_search");
});

test("the tool is marked read-only", () => {
  assert.equal(tool.annotations?.readOnlyHint, true);
});

test("the description does not advertise content: search", () => {
  assert.doesNotMatch(tool.description, /content:/);
});

test("content search is offered through the content parameter", () => {
  assert.match(tool.description, /`content` parameter/);
  assert.equal(tool.inputSchema.properties.content.type, "string");
});

test("the description shows how to exclude a folder by path", () => {
  assert.ok(tool.description.includes("!\\node_modules\\"), tool.description);
});

test("a call without a query is a tool error naming the field", async () => {
  const result = await client.callTool({ name: "everything_search", arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /query must be a non-empty string/);
});
