const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DESKTOP_TITLE_BAR_HEIGHT,
  DESKTOP_TITLE_BAR_OVERLAY,
  DESKTOP_WINDOW_BACKGROUND,
  MACOS_TRAFFIC_LIGHT_POSITION,
  buildMainWindowOptions,
} = require("../src/window-frame.ts");

test("buildMainWindowOptions uses macOS title bar settings", () => {
  const options = buildMainWindowOptions("/tmp/preload.js", "darwin");

  assert.equal(options.titleBarStyle, "hidden");
  assert.equal(options.backgroundColor, DESKTOP_WINDOW_BACKGROUND);
  assert.deepEqual(options.trafficLightPosition, MACOS_TRAFFIC_LIGHT_POSITION);
  assert.equal(options.titleBarOverlay, undefined);
  assert.equal(options.webPreferences.preload, "/tmp/preload.js");
});

test("buildMainWindowOptions uses overlay controls on non-macOS platforms", () => {
  const options = buildMainWindowOptions("/tmp/preload.js", "win32");

  assert.equal(options.titleBarStyle, "hidden");
  assert.equal(options.backgroundColor, DESKTOP_WINDOW_BACKGROUND);
  assert.deepEqual(options.titleBarOverlay, DESKTOP_TITLE_BAR_OVERLAY);
  assert.equal(options.titleBarOverlay.height, DESKTOP_TITLE_BAR_HEIGHT);
  assert.equal(options.trafficLightPosition, undefined);
  assert.equal(options.webPreferences.preload, "/tmp/preload.js");
});
