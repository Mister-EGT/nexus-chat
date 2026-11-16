import assert from "node:assert/strict";
import test from "node:test";
import { parseDiff, responsePatch } from "../src/diff.ts";
import { citationSources } from "../src/openrouter-sources.ts";

test("reads unified diffs with multiple files and keeps empty context lines", () => {
  const files = parseDiff([
    "--- a/nav.js", "+++ b/nav.js", "@@ -3,2 +3,2 @@ nav",
    "-link()", "+link({ focus: true })", " ",
    "--- /dev/null", "+++ b/nav.test.js", "@@ -0,0 +1 @@",
    "+assert(focus)", "",
  ].join("\n"));
  assert.deepEqual(files.map(({ path, kind }) => [path, kind]), [["nav.js", "modified"], ["nav.test.js", "created"]]);
  assert.equal(files[0].hunks[0].oldStart, 3);
  assert.deepEqual(files[0].hunks[0].lines.at(-1), { type: "context", text: "" });
});

test("truncated patches stay in the ordinary Markdown code view", () => {
  assert.equal(parseDiff("--- a/nav.js\n+++ b/nav.js\n@@ -1,3 +1,3 @@\n-old\n+new"), null);
  assert.equal(parseDiff("this isn't a patch"), null);
});

test("reads OpenRouter Responses patch operations as V4A review files", () => {
  const patch = responsePatch([
    { type: "apply_patch_call", status: "completed", operation: { type: "create_file", path: "new.js", diff: "+export {}\n" } },
    { type: "apply_patch_call", status: "completed", operation: { type: "update_file", path: "nav.js", diff: "@@ function nav() {\n-old()\n+new()\n }" } },
    { type: "apply_patch_call", status: "completed", operation: { type: "delete_file", path: "old.js" } },
    { type: "apply_patch_call", status: "in_progress", operation: { type: "delete_file", path: "pending.js" } },
  ]);
  const files = parseDiff(patch);
  assert.deepEqual(files.map(({ path, kind }) => [path, kind]), [["new.js", "created"], ["nav.js", "modified"], ["old.js", "deleted"]]);
  assert.equal(files[1].hunks[0].heading, "function nav() {");
  assert.equal(files[1].hunks[0].newStart, null);
});

test("deduplicates OpenRouter URL citations and keeps available titles and excerpts", () => {
  const sources = citationSources([
    null,
    { type: "url_citation", url_citation: { url: "https://example.com", title: "Documentation" } },
    { type: "url_citation", url: "https://example.com/", content: "An excerpt" },
    { type: "url_citation", url: "javascript:alert(1)" },
    { type: "url_citation", url: "https://username:password@example.com" },
  ]);
  assert.deepEqual(sources, [{ url: "https://example.com/", label: "Documentation", description: "An excerpt" }]);
});
