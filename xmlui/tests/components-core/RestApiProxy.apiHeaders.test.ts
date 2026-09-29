import { beforeEach, describe, expect, it, vi } from "vitest";

import RestApiProxy from "../../src/components-core/RestApiProxy";

function mockFetchSuccess(body: object = {}) {
  const clone = () => ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: () => "application/json" },
  });
  return vi.fn().mockResolvedValue({ ok: true, status: 200, clone, headers: { get: () => "application/json" } });
}

const proxy = (xmluiConfig: Record<string, any>) => new RestApiProxy({ appGlobals: {}, xmluiConfig } as any);
const sent = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0] as [string, RequestInit];

describe("RestApiProxy – apiHeaders (headers for requests resolved against apiUrl)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("sends apiHeaders with a relative URL, resolved against apiUrl", async () => {
    const fetchMock = mockFetchSuccess();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
    await proxy({ apiUrl: "https://a.example", apiHeaders: { Authorization: "Bearer company" } })
      .execute({ operation: { url: "/api/items", method: "get" } });
    const [url, options] = sent(fetchMock);
    expect(url).toBe("https://a.example/api/items");
    expect((options.headers as Record<string, string>).Authorization).toBe("Bearer company");
  });

  it("never sends apiHeaders with an absolute URL", async () => {
    const fetchMock = mockFetchSuccess();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
    await proxy({ apiUrl: "https://a.example", apiHeaders: { Authorization: "Bearer company" } })
      .execute({ operation: { url: "https://home.example/api/companies", method: "get" } });
    const [url, options] = sent(fetchMock);
    expect(url).toBe("https://home.example/api/companies");
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("lets the operation's own headers win over apiHeaders", async () => {
    const fetchMock = mockFetchSuccess();
    vi.spyOn(globalThis, "fetch").mockImplementation(fetchMock);
    await proxy({ apiUrl: "https://a.example", apiHeaders: { Authorization: "Bearer company" } })
      .execute({ operation: { url: "/api/items", method: "get", headers: { Authorization: "Bearer explicit" } } });
    expect((sent(fetchMock)[1].headers as Record<string, string>).Authorization).toBe("Bearer explicit");
  });

  it("tells downloads when a URL needs apiHeaders (so they do not use the header-less iframe)", () => {
    const withHeaders = proxy({ apiUrl: "https://a.example", apiHeaders: { Authorization: "Bearer company" } });
    expect(withHeaders.carriesApiHeaders("/api/print.pdf")).toBe(true);
    expect(withHeaders.carriesApiHeaders("https://cdn.example/file.pdf")).toBe(false);
    expect(proxy({ apiUrl: "https://a.example" }).carriesApiHeaders("/api/print.pdf")).toBe(false);
  });
});
