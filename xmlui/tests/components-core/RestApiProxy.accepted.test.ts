import { afterEach, describe, expect, it, vi } from "vitest";

import RestApiProxy from "../../src/components-core/RestApiProxy";

const proxy = () => new RestApiProxy({ appGlobals: {}, xmluiConfig: {} } as any);
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

describe("RestApiProxy – 202 Accepted followed by the app", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).xmluiFollowAccepted;
  });

  it("continues with the final response the app's follower gives back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(202, { data: { id: "run-1" } }, { Location: "/runs/run-1" }));
    const follow = vi.fn(async (res: Response) => {
      expect(res.headers.get("location")).toBe("/runs/run-1");
      return json(201, { created: 2 });
    });
    (globalThis as any).xmluiFollowAccepted = follow;
    const result = await proxy().execute({ operation: { url: "/api/items/import", method: "post", headers: { Authorization: "Bearer company" } } });
    expect(result).toEqual({ created: 2 });
    expect(follow).toHaveBeenCalledWith(expect.any(Response), expect.objectContaining({ url: "/api/items/import", method: "post" }));
    expect(follow.mock.calls[0]![1].headers.Authorization).toBe("Bearer company"); // the request's own credentials
  });

  it("raises the final response's error as the call's error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(202, { data: { id: "run-2" } }));
    (globalThis as any).xmluiFollowAccepted = async () => json(422, { error: "2 of 3 rows have errors" });
    await expect(proxy().execute({ operation: { url: "/api/items/import", method: "post" } })).rejects.toMatchObject({ statusCode: 422 });
  });

  it("hands a 202 over as it is when the app follows nothing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(202, { data: { id: "run-3" } }));
    expect(await proxy().execute({ operation: { url: "/api/items/export", method: "post" } })).toEqual({ data: { id: "run-3" } });
  });

  it("leaves every other status alone", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    const follow = vi.fn();
    (globalThis as any).xmluiFollowAccepted = follow;
    expect(await proxy().execute({ operation: { url: "/api/items", method: "get" } })).toEqual({ ok: true });
    expect(follow).not.toHaveBeenCalled();
  });
});
