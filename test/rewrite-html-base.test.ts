import { describe, it, expect } from "vitest";
import { rewriteHtmlBase } from "../src/cli-publish.js";

describe("rewriteHtmlBase", () => {
  it("rewrites the default <base href=\"/\"> to a sub-path", () => {
    const html = '<!doctype html><html><head><base href="/" /></head></html>';
    const out = rewriteHtmlBase(html, "/my-repo/");
    expect(out).toContain('<base href="/my-repo/" />');
    expect(out).not.toContain('<base href="/"');
  });

  it("handles single-quoted href", () => {
    const html = "<head><base href='/' /></head>";
    const out = rewriteHtmlBase(html, "/x/");
    expect(out).toContain('<base href="/x/" />');
  });

  it("handles unquoted attributes-sibling content without matching them", () => {
    // A base tag with other siblings shouldn't be disturbed
    const html = '<head><meta charset="utf-8"><base href="/" /><title>x</title></head>';
    const out = rewriteHtmlBase(html, "/a/");
    expect(out).toContain('<base href="/a/" />');
    expect(out).toContain('<meta charset="utf-8">');
    expect(out).toContain("<title>x</title>");
  });

  it("rewrites an already-rewritten base (idempotent re-publish with different base)", () => {
    const html = '<head><base href="/old/" /></head>';
    const out = rewriteHtmlBase(html, "/new/");
    expect(out).toContain('<base href="/new/" />');
    expect(out).not.toContain("/old/");
  });

  it("rewrites self-closing and non-self-closing tags identically", () => {
    const selfClosing = '<base href="/" />';
    const open = '<base href="/">';
    expect(rewriteHtmlBase(selfClosing, "/a/")).toBe('<base href="/a/" />');
    expect(rewriteHtmlBase(open, "/a/")).toBe('<base href="/a/" />');
  });

  it("rewrites multiple matches (all occurrences)", () => {
    const html = '<base href="/" /> some body <base href="/" />';
    const out = rewriteHtmlBase(html, "/x/");
    const matches = out.match(/<base\s+href="\/x\/"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  it("is a no-op when no <base> tag is present", () => {
    const html = '<!doctype html><html><head><title>x</title></head></html>';
    const out = rewriteHtmlBase(html, "/x/");
    expect(out).toBe(html);
  });

  it("is insensitive to tag case", () => {
    const html = '<HEAD><BASE HREF="/" /></HEAD>';
    const out = rewriteHtmlBase(html, "/y/");
    expect(out).toContain('<base href="/y/" />');
  });
});
