import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFollowingTabName, isForYouTabName, pickNotInterestedItem } from "./labels.js";

const item = (text: string, ariaLabel = "", testId = "") => ({ text, ariaLabel, testId });

describe("pickNotInterestedItem", () => {
  it("prefers the Japanese post-level label", () => {
    const picked = pickNotInterestedItem([
      item("ミュート"),
      item("このポストに興味がない"),
      item("ブロック"),
    ]);
    assert.equal(picked?.text, "このポストに興味がない");
  });

  it("falls back to English Not interested", () => {
    const picked = pickNotInterestedItem([
      item("Follow @someone"),
      item("Not interested"),
      item("Mute @someone"),
    ]);
    assert.equal(picked?.text, "Not interested");
  });

  it("matches a partial English phrase and an aria-label", () => {
    const picked = pickNotInterestedItem([
      item("", "Not interested in this post"),
    ]);
    assert.equal(picked?.ariaLabel, "Not interested in this post");
  });

  it("rejects mute, block, report, and unfollow", () => {
    const picked = pickNotInterestedItem([
      item("Not interested", "Mute this conversation"),
      item("ブロック @user"),
      item("報告"),
      item("フォロー解除 @user"),
      item("Unfollow @user"),
    ]);
    assert.equal(picked, null);
  });

  it("skips an author-level @ row when it is not about the post", () => {
    const picked = pickNotInterestedItem([item("Not interested in @spammer")]);
    assert.equal(picked, null);
  });

  it("accepts a not-interested test id", () => {
    const picked = pickNotInterestedItem([item("", "", "notInterested")]);
    assert.equal(picked?.testId, "notInterested");
  });
});

describe("timeline tab names", () => {
  it("recognizes For You and おすすめ, including a count", () => {
    assert.equal(isForYouTabName("For you"), true);
    assert.equal(isForYouTabName("For You"), true);
    assert.equal(isForYouTabName("おすすめ"), true);
    assert.equal(isForYouTabName("おすすめ 3"), true);
    assert.equal(isForYouTabName("Following"), false);
    assert.equal(isForYouTabName("フォロー中"), false);
  });

  it("recognizes Following and フォロー中", () => {
    assert.equal(isFollowingTabName("Following"), true);
    assert.equal(isFollowingTabName("フォロー中"), true);
    assert.equal(isFollowingTabName("For you"), false);
    assert.equal(isFollowingTabName("おすすめ"), false);
  });
});
