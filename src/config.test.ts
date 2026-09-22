import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig, unusedSafetyFlags } from "./config.js";

describe("loadConfig", () => {
  it("defaults to dry-run, threshold 0.85, and slow pacing", () => {
    const config = loadConfig({});
    assert.equal(config.dryRun, true);
    assert.equal(config.threshold, 0.85);
    assert.equal(config.maxActions, 20);
    assert.equal(config.maxPosts, 40);
    assert.equal(config.minDelayMs, 3000);
    assert.equal(config.maxDelayMs, 8000);
    assert.equal(config.cdpUrl, "http://127.0.0.1:9222");
  });

  it("turns dry-run off only for the exact value false", () => {
    assert.equal(loadConfig({ DRY_RUN: "false" }).dryRun, false);
    assert.equal(loadConfig({ DRY_RUN: "FALSE" }).dryRun, false);
    assert.equal(loadConfig({ DRY_RUN: "0" }).dryRun, true);
    assert.equal(loadConfig({ DRY_RUN: "no" }).dryRun, true);
    assert.equal(loadConfig({ DRY_RUN: "true" }).dryRun, true);
  });

  it("rejects a threshold outside 0 to 1", () => {
    assert.throws(() => loadConfig({ THRESHOLD: "2" }), /THRESHOLD/);
  });
});

describe("unusedSafetyFlags", () => {
  it("warns when mute or block is requested and otherwise stays quiet", () => {
    assert.deepEqual(unusedSafetyFlags({}), []);
    assert.equal(unusedSafetyFlags({ ENABLE_MUTE: "true" }).length, 1);
    assert.equal(unusedSafetyFlags({ ENABLE_BLOCK: "yes" }).length, 1);
  });
});
