import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JEV_MODEL, NOT_INTERESTED_CRITERIA, NOT_INTERESTED_INSTRUCTIONS } from "./jev.js";

describe("Jev criteria", () => {
  it("uses the Gateway Jev model and a yes/no choice", () => {
    assert.equal(JEV_MODEL, "typesafe-ai/jev");
    assert.equal(typeof NOT_INTERESTED_CRITERIA.yes, "string");
    assert.equal(typeof NOT_INTERESTED_CRITERIA.no, "string");
  });

  it("encodes ads and flame wars, and excludes the out-of-scope cases", () => {
    const text = `${NOT_INTERESTED_INSTRUCTIONS}\n${NOT_INTERESTED_CRITERIA.yes}\n${NOT_INTERESTED_CRITERIA.no}`;
    assert.match(text, /ad|affiliate|販売|広告/i);
    assert.match(text, /flame|conflict/i);
    assert.match(text, /politics/i);
    assert.match(text, /not followed/i);
    assert.match(text, /English/i);
    assert.match(text, /AI/i);
  });
});
