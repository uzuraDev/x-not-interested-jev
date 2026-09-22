import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allowClick, decideNotInterested } from "./decision.js";

describe("decideNotInterested", () => {
  it("acts when yes probability meets the threshold", () => {
    const decision = decideNotInterested(
      { choice: "yes", probabilities: { yes: 0.85, no: 0.15 } },
      0.85,
    );
    assert.equal(decision.act, true);
  });

  it("does not act below the threshold", () => {
    const decision = decideNotInterested(
      { choice: "yes", probabilities: { yes: 0.849, no: 0.151 } },
      0.85,
    );
    assert.equal(decision.act, false);
  });

  it("does not act when the choice is no", () => {
    const decision = decideNotInterested(
      { choice: "no", probabilities: { yes: 0.1, no: 0.9 } },
      0.85,
    );
    assert.equal(decision.act, false);
  });

  it("acts on a clear yes when probabilities are missing", () => {
    const decision = decideNotInterested({ choice: "yes" }, 0.85);
    assert.equal(decision.act, true);
    assert.match(decision.reason, /clear yes/);
  });

  it("does not act on no when probabilities are missing", () => {
    const decision = decideNotInterested({ choice: "no" }, 0.85);
    assert.equal(decision.act, false);
  });

  it("does not act when the distribution omits yes", () => {
    const decision = decideNotInterested({ choice: "yes", probabilities: {} }, 0.85);
    assert.equal(decision.act, false);
  });
});

describe("allowClick", () => {
  const act = { act: true, reason: "yes" };
  const skip = { act: false, reason: "no" };

  it("refuses while dry-run is on", () => {
    assert.equal(allowClick(true, act), false);
  });

  it("clicks only for an act decision with dry-run off", () => {
    assert.equal(allowClick(false, act), true);
    assert.equal(allowClick(false, skip), false);
  });
});
