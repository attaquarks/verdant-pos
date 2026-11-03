import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  send: vi.fn(),
  destroy: vi.fn(),
  args: null as unknown,
  input: null as unknown,
}));
vi.mock("@/lib/env", () => ({ getSupabaseConfig: mocks.config }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(value: unknown) {
      mocks.args = value;
    }
    send = mocks.send;
    destroy = mocks.destroy;
  },
  GetObjectCommand: class {
    constructor(value: unknown) {
      mocks.input = value;
    }
  },
}));
import { readPhotoObject } from "../src/lib/photo-storage";

const ref = "abcdefghijklmnopqrst";
const anon = `test.${Buffer.from(JSON.stringify({ role: "anon", ref })).toString("base64url")}.signature`;
const svc = `test.${Buffer.from(JSON.stringify({ role: "service_role", ref })).toString("base64url")}.signature`;
const user = { auth: { getSession: vi.fn() } };
beforeEach(() => {
  mocks.config.mockReset().mockReturnValue({ url: `https://${ref}.supabase.co`, key: "public" });
  mocks.send
    .mockReset()
    .mockResolvedValue({ Body: Readable.from([Buffer.from("safe")]), ContentLength: 4 });
  mocks.destroy.mockReset();
  user.auth.getSession
    .mockReset()
    .mockResolvedValue({ data: { session: { access_token: "test-user-session" } }, error: null });
  vi.stubEnv("SUPABASE_STORAGE_LEGACY_ANON_KEY", anon);
  vi.stubEnv("SUPABASE_STORAGE_S3_REGION", "eu-west-3");
});
afterEach(() => vi.unstubAllEnvs());
const client = () => user as unknown as Parameters<typeof readPhotoObject>[0];
describe("cache-free user-scoped storage reads", () => {
  it("passes only anon and current-user session to S3, with bounded bytes", async () => {
    expect(await readPhotoObject(client(), "test-path")).toEqual(Buffer.from("safe"));
    expect(mocks.args).toMatchObject({
      endpoint: `https://${ref}.supabase.co/storage/v1/s3`,
      region: "eu-west-3",
      forcePathStyle: true,
      credentials: { accessKeyId: ref, secretAccessKey: anon, sessionToken: "test-user-session" },
    });
    expect(mocks.input).toEqual({ Bucket: "product-photos", Key: "test-path" });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it("rejects service-role keys, missing region and missing session before a provider request", async () => {
    vi.stubEnv("SUPABASE_STORAGE_LEGACY_ANON_KEY", svc);
    await expect(readPhotoObject(client(), "path")).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("SUPABASE_STORAGE_LEGACY_ANON_KEY", anon);
    vi.stubEnv("SUPABASE_STORAGE_S3_REGION", "");
    await expect(readPhotoObject(client(), "path")).rejects.toMatchObject({ status: 503 });
    vi.stubEnv("SUPABASE_STORAGE_S3_REGION", "eu-west-3");
    user.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(readPhotoObject(client(), "path")).rejects.toMatchObject({ status: 401 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("bounds streaming data and hides provider details", async () => {
    mocks.send.mockResolvedValueOnce({
      Body: Readable.from([Buffer.alloc(2 * 1024 * 1024 + 1)]),
      ContentLength: undefined,
    });
    await expect(readPhotoObject(client(), "path")).rejects.toMatchObject({ status: 404 });
    mocks.send.mockRejectedValueOnce({
      $metadata: { httpStatusCode: 404 },
      message: "private-provider-path",
    });
    await expect(readPhotoObject(client(), "path")).rejects.toMatchObject({
      status: 404,
      message: "Photo unavailable.",
    });
  });
});
