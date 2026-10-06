import assert from "node:assert/strict";
import test from "node:test";
import { parseFigmaFile } from "../src/services/figma.js";

test("Figma file identities preserve supported public URL forms", () => {
  assert.deepEqual(
    parseFigmaFile("https://www.figma.com/design/abc123/My%20File?node-id=1-2"),
    {
      key: "abc123",
      url: "https://www.figma.com/design/abc123/My%20File?node-id=1-2",
    },
  );
  assert.deepEqual(
    parseFigmaFile("https://figma.com/file/file-key/Legacy%20File"),
    {
      key: "file-key",
      url: "https://figma.com/file/file-key/Legacy%20File",
    },
  );
});

test("Figma file identities reject unsafe authority, path, and key forms", () => {
  for (const value of [
    "",
    "https://user:password@figma.com/design/abc123/My%20File",
    "https://figma.com:444/design/abc123/My%20File",
    "https://figma.com\\design/abc123/My%20File",
    "https://figma.com/design/abc123%5CMy%20File",
    "https://figma.com/design/abc123/../other",
    "https://figma.com/design//abc123",
    "https://figma.com/design/abc123/My%2FFile",
    "https://figma.com/design/abc123/title/extra",
    "https://figma.com/design/%E0%A4%A/My%20File",
    "https://evil.example/design/abc123/My%20File",
    "http://figma.com/design/abc123/My%20File",
  ]) {
    assert.throws(() => parseFigmaFile(value), /Figma/);
  }
});
