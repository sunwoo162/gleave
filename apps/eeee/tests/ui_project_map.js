import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../app/static/", import.meta.url);
const html = fs.readFileSync(new URL("index.html", root), "utf8");
const js = fs.readFileSync(new URL("app.js", root), "utf8");
const css = fs.readFileSync(new URL("styles.css", root), "utf8");

test("assistant surface exposes one-sentence project launcher and map shell", () => {
  assert.match(html, /project-request-form/);
  assert.match(html, /capability-cards/);
  assert.match(html, /project-map/);
  assert.match(html, /project-map-details/);
  assert.match(js, /function open_project/);
  assert.match(js, /\/api\/assistant\/route/);
  assert.match(js, /\/api\/projects\/\$\{projectId\}\/map/);
  assert.match(js, /currentNodeIds/);
  assert.match(css, /\.project-map-node/);
  assert.match(css, /\.project-map-node\.active/);
});

test("map status and detail fields are rendered without flashing the page", () => {
  assert.match(js, /claimLatchStatus/);
  assert.match(js, /qaStatus/);
  assert.match(js, /changedFiles/);
  assert.match(js, /troubleshootingIds/);
  assert.match(js, /setInterval|setTimeout/);
});
