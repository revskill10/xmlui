import { describe, expect, it } from "vitest";

import { __compiledThemeForTests as compiled } from "../../../src/components-core/theming/ThemeProvider";

// A nested <Theme> used to recompile and revalidate the whole theme for every instance on a page; identical themes now
// share one compiled form.
const registry = { componentThemeVars: new Set<string>(), componentDefaultThemeVars: {}, componentThemeVarDeclarations: new Map() } as any;
const base = { id: "base", themeVars: { "color-primary": "#1677ff" } } as any;
const themes = [base];
const resources = {}, resourceMap = {};
const nested = (id: string, vars: Record<string, string>) => ({ ...base, id, tones: { light: { themeVars: vars } } });

describe("compiled theme cache", () => {
  it("compiles identical content once, whatever the per-instance id", () => {
    const a = compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, true, false);
    const b = compiled(registry, nested("t2", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, true, false);
    expect(b).toBe(a);
    expect(a.themeCssVars).toBeTypeOf("object");
  });

  it("keeps different overrides, tones and strictness apart", () => {
    const a = compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, true, false);
    expect(compiled(registry, nested("t1", { "width-Drawer": "62vw" }), "light", themes, resources, resourceMap, true, false)).not.toBe(a);
    expect(compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "dark", themes, resources, resourceMap, true, false)).not.toBe(a);
    expect(compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, false, false)).not.toBe(a);
  });

  it("never shares across component registries or theme lists", () => {
    const a = compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, true, false);
    const otherRegistry = { ...registry };
    expect(compiled(otherRegistry, nested("t1", { "width-Drawer": "28rem" }), "light", themes, resources, resourceMap, true, false)).not.toBe(a);
    expect(compiled(registry, nested("t1", { "width-Drawer": "28rem" }), "light", [base], resources, resourceMap, true, false)).not.toBe(a);
  });
});
