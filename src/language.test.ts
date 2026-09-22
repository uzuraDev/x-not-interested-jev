import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLanguage } from "./language.js";

describe("resolveLanguage", () => {
  it("keeps the lang attribute when X provided one", () => {
    assert.equal(resolveLanguage("ja", "hello"), "ja");
  });

  it("guesses from script when lang is missing", () => {
    assert.equal(resolveLanguage("", "こんにちは"), "ja");
    assert.equal(resolveLanguage(null, "안녕하세요"), "ko");
    assert.equal(resolveLanguage(undefined, "你好"), "zh");
    assert.equal(resolveLanguage("", "Hello"), "en");
    assert.equal(resolveLanguage("", "123"), "unknown");
  });
});
