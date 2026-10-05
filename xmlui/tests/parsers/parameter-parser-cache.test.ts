import { describe, expect, it } from "vitest";
import { parseParameterString } from "../../src/components-core/script-runner/ParameterParser";

// The same binding text is parsed once: callers get equal sections in their own arrays, and failures still throw.
describe("parseParameterString cache", () => {
  it("returns equal sections, sharing the parsed tree, in a fresh array per call", () => {
    const a = parseParameterString("Hi {user.name}!");
    const b = parseParameterString("Hi {user.name}!");
    expect(b).toEqual(a);
    expect(b).not.toBe(a);
    expect(b[1]).toBe(a[1]);
    a.shift();
    a.pop();
    expect(parseParameterString("Hi {user.name}!")).toHaveLength(3);
  });
  it("still throws for an unclosed expression on every call", () => {
    expect(() => parseParameterString("{a + ")).toThrow();
    expect(() => parseParameterString("{a + ")).toThrow();
  });
  it("does not cache when compile options are given", () => {
    const options = { compileScripts: true, sourceId: "x" };
    expect(parseParameterString("{a}", options)[0]).not.toBe(parseParameterString("{a}")[0]);
  });
});
