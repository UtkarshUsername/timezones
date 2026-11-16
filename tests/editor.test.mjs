import assert from "node:assert/strict";
import test from "node:test";
import { editorState, initialEditor } from "../client/polls/editor-state.ts";

test("older save completion cannot replace newer name or availability edits", () => {
  let draft = initialEditor({ name: "Alice", slots: "[0]" }, "");
  draft = editorState(draft, { type: "paint", index: 1, add: true });
  const savingRevision = draft.revision;
  draft = editorState(draft, { type: "saving" });
  draft = editorState(draft, { type: "name", name: "Alice updated" });
  draft = editorState(draft, { type: "paint", index: 2, add: true });
  draft = editorState(draft, { type: "saved", revision: savingRevision, joining: false });
  draft = editorState(draft, { type: "receive", mine: { name: "Alice", slots: "[0,1]" }, defaultName: "" });
  assert.equal(draft.name, "Alice updated");
  assert.deepEqual(draft.slots, [0, 1, 2]);
  assert.equal(draft.status, "Unsaved changes");
});

test("live data replaces clean drafts and yields to dirty or in-flight drafts", () => {
  let draft = initialEditor({ name: "Alice", slots: "[0]" }, "");
  const remote = { type: "receive", mine: { name: "Other device", slots: "[2]" }, defaultName: "" };
  draft = editorState(draft, remote);
  assert.equal(draft.name, "Other device");
  assert.deepEqual(draft.slots, [2]);
  draft = editorState(draft, { type: "saving" });
  draft = editorState(draft, { ...remote, mine: { name: "Later", slots: "[3]" } });
  assert.equal(draft.name, "Other device");
  draft = editorState(draft, { type: "saved", revision: draft.revision, joining: false });
  draft = editorState(draft, { ...remote, mine: { name: "Later", slots: "[3]" } });
  assert.equal(draft.name, "Later");
  assert.deepEqual(draft.slots, [3]);
});

test("save failures keep the editable draft and expose the failure", () => {
  let draft = initialEditor({ name: "Alice", slots: "[]" }, "");
  draft = editorState(draft, { type: "paint", index: 3, add: true });
  draft = editorState(draft, { type: "saving" });
  draft = editorState(draft, { type: "failed", revision: draft.revision, message: "Connection lost" });
  assert.equal(draft.status, "Connection lost");
  assert.deepEqual(draft.slots, [3]);
  draft = editorState(draft, { type: "receive", mine: { name: "Old", slots: "[]" }, defaultName: "" });
  assert.equal(draft.name, "Alice");
  assert.deepEqual(draft.slots, [3]);
});

test("account names prefill unedited join forms without replacing typed names", () => {
  let draft = initialEditor(undefined, "Google name");
  assert.equal(draft.name, "Google name");
  assert.equal(draft.joined, false);
  draft = editorState(draft, { type: "name", name: "Chosen name" });
  draft = editorState(draft, { type: "receive", defaultName: "New profile name" });
  assert.equal(draft.name, "Chosen name");
  draft = editorState(draft, { type: "saving" });
  draft = editorState(draft, { type: "saved", revision: draft.revision, joining: true });
  assert.equal(draft.joined, true);
  assert.match(draft.status, /Saved/);
});
