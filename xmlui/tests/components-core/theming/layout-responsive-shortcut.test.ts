import { describe, expect, it } from "vitest";
import { resolveLayoutProps } from "../../../src/components-core/theming/layout-resolver";

// The resolver looks responsive variants up only when a component declares one: the result is the same either way.
describe("responsive variants are looked up only when declared", () => {
  const at = (sizeIndex: number) => ({ type: "Stack", orientation: "vertical", mediaSize: { sizeIndex } }) as any;
  it("a plain value applies at every size", () => {
    for (const size of [0, 1, 2, 3, 4, 5]) expect(resolveLayoutProps({ width: "10px" }, at(size)).cssProps.width).toBe("10px");
  });
  it("a declared variant still wins at its size and falls back elsewhere", () => {
    const props = { width: "10px", "width-md": "20px" };
    expect(resolveLayoutProps(props, at(2)).cssProps.width).toBe("20px");
    expect(resolveLayoutProps(props, at(1)).cssProps.width).toBe("20px");
    expect(resolveLayoutProps(props, at(3)).cssProps.width).toBe("10px");
  });
});
