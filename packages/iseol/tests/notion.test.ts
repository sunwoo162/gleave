import assert from "node:assert/strict";
import test from "node:test";
import { parseNotionPage } from "../src/services/notion.js";

const pageId = "0123456789abcdef0123456789abcdef";

test("Notion page identities preserve supported public links", () => {
  assert.deepEqual(parseNotionPage(`https://www.notion.so/workspace/Project-${pageId}?pvs=4`), {
    id: "01234567-89ab-cdef-0123-456789abcdef",
    url: `https://www.notion.so/workspace/Project-${pageId}?pvs=4`,
  });
  assert.equal(parseNotionPage(`https://team.notion.site/Page-${pageId}`).id, "01234567-89ab-cdef-0123-456789abcdef");
});

test("Notion page identities reject unsafe URL authority and path separators", () => {
  for (const value of [
    `https://user:password@notion.so/Page-${pageId}`,
    `https://notion.so:444/Page-${pageId}`,
    `https://notion.so/workspace\\Page-${pageId}`,
    `https://notion.so/workspace%5CPage-${pageId}`,
  ]) {
    assert.throws(() => parseNotionPage(value), /Notion 링크/);
  }
});
