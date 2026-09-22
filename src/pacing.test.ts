import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { jitterDelayMs } from "./pacing.js";

describe("jitterDelayMs", () => {
  it("stays inside the inclusive range", () => {
    assert.equal(jitterDelayMs(3000, 8000, () => 0), 3000);
    assert.equal(jitterDelayMs(3000, 8000, () => 0.999999), 8000);
    assert.equal(jitterDelayMs(8000, 3000, () => 0), 3000);
  });
});
