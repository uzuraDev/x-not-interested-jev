import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFollowing, isEligibleFollowing } from "./following.js";

describe("classifyFollowing", () => {
  it("treats a Follow button as not followed", () => {
    assert.equal(classifyFollowing(["Follow @alice"]), "no");
    assert.equal(classifyFollowing(["フォロー"]), "no");
    assert.equal(classifyFollowing(["フォロー フォロー"]), "no");
    assert.equal(classifyFollowing(["@aliceさんをフォロー"]), "no");
  });

  it("treats Following and Unfollow as followed", () => {
    assert.equal(classifyFollowing(["Following"]), "yes");
    assert.equal(classifyFollowing(["フォロー中"]), "yes");
    assert.equal(classifyFollowing(["Unfollow @alice"]), "yes");
    assert.equal(classifyFollowing(["フォロー解除 @alice"]), "yes");
  });

  it("lets a followed signal win over a follow button", () => {
    assert.equal(classifyFollowing(["Follow", "Following"]), "yes");
  });

  it("is unknown when the post has no follow control", () => {
    assert.equal(classifyFollowing(["Reply", "Repost", "Like"]), "unknown");
  });
});

describe("isEligibleFollowing", () => {
  it("only allows posts with a visible not-followed signal", () => {
    assert.equal(isEligibleFollowing("no"), true);
    assert.equal(isEligibleFollowing("yes"), false);
    assert.equal(isEligibleFollowing("unknown"), false);
  });
});
