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

  it("passes the caller's progress listener to the follower: what it reports reaches the caller while it waits", async () => {
    // A call with a progress listener goes through the upload-progress transport: stub it like fetch.
    const p = proxy();
    vi.spyOn(p as any, "executeWithUploadProgress").mockResolvedValue(json(202, { data: { id: "run-4" } }));
    (globalThis as any).xmluiFollowAccepted = async (_res: Response, request: { onProgress?: (p: unknown) => void }) => {
      request.onProgress?.({ type: "run", status: "running", done: 3, total: 10 });
      request.onProgress?.({ type: "run", status: "running", done: 10, total: 10 });
      return json(200, { exported: 10 });
    };
    const seen: unknown[] = [];
    const result = await p.execute({ operation: { url: "/api/items/export", method: "post" }, onProgress: ((x: unknown) => seen.push(x)) as any });
    expect(result).toEqual({ exported: 10 });
    expect(seen).toEqual([{ type: "run", status: "running", done: 3, total: 10 }, { type: "run", status: "running", done: 10, total: 10 }]);
  });

  it("leaves every other status alone", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json(200, { ok: true }));
    const follow = vi.fn();
    (globalThis as any).xmluiFollowAccepted = follow;
    expect(await proxy().execute({ operation: { url: "/api/items", method: "get" } })).toEqual({ ok: true });
    expect(follow).not.toHaveBeenCalled();
  });
});
