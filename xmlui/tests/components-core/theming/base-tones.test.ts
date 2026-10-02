import { describe, expect, it } from "vitest";
import Color from "color";
import { generateBaseTones } from "../../../src/components-core/theming/transformThemeVars";

describe("generateBaseTones", () => {
  it("anchors the 500 shade on the base colour (HSL lightness, not CIELAB)", () => {
    for (const base of ["#0e9f6e", "#1677ff", "#e53935"]) {
      const tones = generateBaseTones({ "color-primary": base });
      expect(Color(tones["const-color-primary-500"]).hex()).toBe(Color(base).hex());
    }
  });

  it("makes lower shades lighter and higher shades darker than the base", () => {
    const tones = generateBaseTones({ "color-primary": "#0e9f6e" });
    const l = (n: number) => Color(tones[`const-color-primary-${n}`]).lightness();
    expect(l(400)).toBeGreaterThan(l(500));
    expect(l(600)).toBeLessThan(l(500));
    expect(l(50)).toBeGreaterThan(l(400));
    expect(l(900)).toBeLessThan(l(600));
  });
});
