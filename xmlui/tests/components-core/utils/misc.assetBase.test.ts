import { afterEach, describe, expect, it } from "vitest";

import { assetBaseUrl, normalizePath } from "../../../src/components-core/utils/misc";

describe("normalizePath – __XMLUI_ASSET_BASE (app files served by another server than the page)", () => {
  afterEach(() => {
    delete (window as any).__XMLUI_ASSET_BASE;
    delete (window as any).__PUBLIC_PATH;
  });

  it("leaves paths unchanged without an asset base", () => {
    expect(normalizePath("/components/App.xmlui")).toBe("/components/App.xmlui");
  });

  it("resolves relative and root-relative app files against the asset base", () => {
    (window as any).__XMLUI_ASSET_BASE = "https://cluster-a.example/";
    expect(assetBaseUrl()).toBe("https://cluster-a.example");
    expect(normalizePath("components/App.xmlui")).toBe("https://cluster-a.example/components/App.xmlui");
    expect(normalizePath("/locales/vi.locale.json")).toBe("https://cluster-a.example/locales/vi.locale.json");
  });

  it("keeps absolute URLs and combines with a public path", () => {
    (window as any).__XMLUI_ASSET_BASE = "https://cluster-a.example";
    (window as any).__PUBLIC_PATH = "/erp";
    expect(normalizePath("https://cdn.example/x.json")).toBe("https://cdn.example/x.json");
    expect(normalizePath("/config.json")).toBe("https://cluster-a.example/erp/config.json");
  });

  it("ignores an asset base that is not an absolute http(s) URL", () => {
    (window as any).__XMLUI_ASSET_BASE = "javascript:alert(1)";
    expect(assetBaseUrl()).toBe("");
    expect(normalizePath("/config.json")).toBe("/config.json");
  });
});
