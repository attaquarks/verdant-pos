import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AppError } from "../src/lib/errors";
import { assertMutationOrigin, readLimitedJSON } from "../src/lib/http";

afterEach(() => vi.unstubAllEnvs());
describe("mutation request boundary", () => {
  it("accepts only the configured application origin and JSON", () => {
    vi.stubEnv("APP_URL", "https://shop.example");
    const request = new Request("https://shop.example/api/actions/sale", {
      method: "POST",
      headers: { origin: "https://shop.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(() => assertMutationOrigin(request)).not.toThrow();
    expect(() =>
      assertMutationOrigin(
        new Request(request.url, {
          method: "POST",
          headers: { origin: "https://evil.example", "content-type": "application/json" },
        }),
      ),
    ).toThrow(/did not come/);
    expect(() =>
      assertMutationOrigin(
        new Request(request.url, {
          method: "POST",
          headers: { origin: "https://shop.example", "content-type": "text/plain" },
        }),
      ),
    ).toThrow(/application\/json/);
  });
  it("does not accept a missing Origin or an unconfigured production URL", () => {
    vi.stubEnv("APP_URL", "https://shop.example");
    expect(() =>
      assertMutationOrigin(new Request("https://shop.example", { method: "POST" })),
    ).toThrow(AppError);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(() =>
      assertMutationOrigin(new Request("https://shop.example", { method: "POST" })),
    ).toThrow(/APP_URL/);
  });
  it("enforces actual streamed byte limits, not just a claimed Content-Length", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "x".repeat(100) });
    await expect(readLimitedJSON(request, 20)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed UTF-8/JSON and accepts bounded objects", async () => {
    await expect(
      readLimitedJSON(new Request("http://localhost", { method: "POST", body: "not json" })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      readLimitedJSON(
        new Request("http://localhost", { method: "POST", body: '{"quantity":"1.000"}' }),
      ),
    ).resolves.toEqual({ quantity: "1.000" });
  });
});
