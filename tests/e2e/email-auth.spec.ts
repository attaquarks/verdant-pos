import { test, expect, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  APP_ORIGIN,
  FIXTURE_ORIGIN,
  FIXTURE_CONTROL_HEADER,
  FIXTURE_CONTROL_VALUE,
  FIXTURE_CREDENTIALS,
  FIXTURE_PUBLISHABLE_KEY,
} from "./fixture-config";
const controls = { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE };
async function emailSession(
  request: APIRequestContext,
  purpose: "signup" | "recovery" | "password" | "otp",
  unconfirmed = false,
) {
  const response = await request.post(`${FIXTURE_ORIGIN}/__fixture/email-session`, {
    headers: controls,
    data: { purpose, unconfirmed },
  });
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{
    token_hash: string;
    access_token: string;
    refresh_token: string;
    user: { email: string };
  }>;
}
function link(
  session: { access_token: string; refresh_token: string; token_hash?: string },
  purpose: string,
  path = "/auth/callback",
) {
  if (purpose === "recovery" && session.token_hash)
    return `${APP_ORIGIN}${path}#${new URLSearchParams({ token_hash: session.token_hash, type: purpose })}`;
  return `${APP_ORIGIN}${path}#${new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    type: purpose,
  })}`;
}
test.beforeEach(async ({ request }) => {
  expect(
    (await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, { headers: controls })).ok(),
  ).toBe(true);
});

test("fresh confirmation in a separate browser verifies, scrubs tokens, and only asks for original-window sign in", async ({
  browser,
  request,
}) => {
  const session = await emailSession(request, "signup");
  const context = await browser.newContext();
  const page = await context.newPage();
  let calls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/auth/v1/user")) calls++;
  });
  const response = await page.goto(link(session, "signup"));
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("status")).toHaveText(
    "Email confirmed, return to original window and sign in.",
  );
  expect(calls).toBeGreaterThan(0);
  expect(page.url()).toBe(`${APP_ORIGIN}/auth/callback`);
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith("sb-") || key === "verdant-email-only",
      ),
    ),
  ).toEqual([]);
  await expect(page.getByRole("link", { name: /workspace|shop|sign in/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
  await context.close();
});

test("recovery updates only the linked account, leaves another app identity alone, and requires explicit later sign in", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(APP_ORIGIN + "/");
  const appCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"));
  const session = await emailSession(request, "recovery");
  const recovery = await context.newPage();
  let passwordUpdates = 0;
  let logoutScope: string | null = null;
  recovery.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/auth/v1/user" && req.method() === "PUT") passwordUpdates++;
    if (url.pathname === "/auth/v1/logout") logoutScope = url.searchParams.get("scope");
  });
  await recovery.setViewportSize({ width: 390, height: 844 });
  await recovery.goto(link(session, "recovery"));
  await expect(recovery.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await expect(recovery.getByText(FIXTURE_CREDENTIALS.other.email, { exact: true })).toBeVisible();
  expect(recovery.url()).toBe(`${APP_ORIGIN}/auth/callback`);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual(
    appCookies,
  );
  await recovery.getByLabel("New password", { exact: true }).fill("New-fixture-password-2026!");
  await recovery.getByLabel("Confirm new password").fill("New-fixture-password-2026!");
  await recovery.getByRole("button", { name: "Update password" }).click();
  expect(passwordUpdates).toBe(0);
  await recovery
    .getByRole("checkbox", {
      name: "I confirm this is the account whose password I want to reset.",
    })
    .check();
  await recovery.getByLabel("New password", { exact: true }).fill("New-fixture-password-2026!");
  await recovery.getByLabel("Confirm new password").fill("different-password");
  await recovery.getByRole("button", { name: "Update password" }).click();
  await expect(
    recovery.getByText("The passwords don’t match. Please enter them again."),
  ).toBeVisible();
  await recovery.getByLabel("Confirm new password").fill("New-fixture-password-2026!");
  await recovery.getByRole("button", { name: "Update password" }).click();
  await expect(recovery.getByRole("status")).toHaveText(
    "Your password has been updated. Return to the original window and sign in with your new password.",
  );
  await expect(recovery.getByRole("textbox")).toHaveCount(0);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual(
    appCookies,
  );
  await page.reload();
  await expect(page).toHaveURL(APP_ORIGIN + "/");
  expect(passwordUpdates).toBe(1);
  expect(logoutScope).toBe("local");
  // Local logout revokes refresh, not an already-issued access JWT.
  const issuedBearer = await request.get(`${FIXTURE_ORIGIN}/auth/v1/user`, {
    headers: { apikey: FIXTURE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  expect(issuedBearer.status()).toBe(200);
  const revokedRefresh = await request.post(
    `${FIXTURE_ORIGIN}/auth/v1/token?grant_type=refresh_token`,
    {
      headers: { apikey: FIXTURE_PUBLISHABLE_KEY },
      data: { refresh_token: session.refresh_token },
    },
  );
  expect(revokedRefresh.status()).toBe(400);
  expect((await revokedRefresh.json()).code).toBe("refresh_token_not_found");
  expect(
    await recovery.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith("sb-") || key === "verdant-email-only",
      ),
    ),
  ).toEqual([]);
  await recovery.reload();
  await expect(recovery.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
  await expect(recovery.getByRole("button", { name: "Update password" })).toHaveCount(0);
  // The consumed hash cannot be reused either, while the app cookie survived.
  const replay = await context.newPage();
  await replay.goto(link(session, "recovery"));
  await expect(replay.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
  const separate = await context.browser()!.newContext();
  const login = await separate.newPage();
  await login.goto("/login");
  await login.getByLabel("Email address").fill(FIXTURE_CREDENTIALS.other.email);
  await login.getByLabel("Password", { exact: true }).fill("New-fixture-password-2026!");
  await login.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(login).toHaveURL(APP_ORIGIN + "/");
  await separate.close();
});

test("provider confirmation during recovery does not qualify an unconfirmed account for reset", async ({
  page,
  context,
  request,
}) => {
  const session = await emailSession(request, "recovery", true);
  let passwordUpdates = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/auth/v1/user" && req.method() === "PUT")
      passwordUpdates++;
  });
  await page.goto(link(session, "recovery", "/reset-password"));
  await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
  expect(passwordUpdates).toBe(0);
  expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
  // Local rejection does not reverse confirmation already performed by the provider.
  const identity = await request.get(`${FIXTURE_ORIGIN}/auth/v1/user`, {
    headers: { apikey: FIXTURE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  expect(identity.ok()).toBe(true);
  const providerUser = await identity.json();
  expect(Date.parse(providerUser.email_confirmed_at)).toBeGreaterThan(
    Date.parse(providerUser.recovery_sent_at),
  );
  const login = await request.post(`${FIXTURE_ORIGIN}/auth/v1/token?grant_type=password`, {
    headers: { apikey: FIXTURE_PUBLISHABLE_KEY },
    data: FIXTURE_CREDENTIALS.other,
  });
  expect(login.ok()).toBe(true);
});

test("cross-browser recovery works without any app session, with Urdu RTL and night preferences", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const session = await emailSession(request, "recovery");
  await page.goto(link(session, "recovery", "/reset-password"));
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByRole("button", { name: "Night mode" }).click();
  await page.getByRole("button", { name: "اردو میں استعمال کریں" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
      .violations,
  ).toEqual([]);
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
  await context.close();
});

test("rejects ordinary sessions retyped as recovery, wrong signup flow, modified and missing links without login loops", async ({
  page,
  request,
}) => {
  const normal = await emailSession(request, "password");
  const signup = await emailSession(request, "signup");
  const otp = await emailSession(request, "otp");
  const implicitRecovery = await emailSession(request, "recovery");
  for (const url of [
    link(normal, "recovery"),
    link({ ...otp, token_hash: undefined }, "recovery"),
    link({ ...implicitRecovery, token_hash: undefined }, "recovery"),
    link(signup, "recovery"),
    link(signup, "unknown"),
    link({ ...signup, access_token: signup.access_token + "tampered" }, "signup"),
    `${APP_ORIGIN}/reset-password`,
    `${APP_ORIGIN}/auth/callback?code=old-pkce-code`,
    `${APP_ORIGIN}/auth/callback#error=access_denied&error_description=expired`,
  ]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
    await expect(page).toHaveURL(new URL(page.url()).origin + new URL(page.url()).pathname);
  }
});

test("email request rate limits are friendly, one request per click, and don't create an app identity", async ({
  page,
  context,
}) => {
  let requests = 0;
  await page.route(`${FIXTURE_ORIGIN}/auth/v1/signup**`, async (route) => {
    requests++;
    const body = route.request().postDataJSON();
    expect(body.code_challenge == null).toBe(true);
    expect(new URL(route.request().url()).searchParams.get("redirect_to")).toBe(
      `${APP_ORIGIN}/auth/callback`,
    );
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        code: "over_email_send_rate_limit",
        msg: "Email rate limit exceeded",
      }),
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  await page.getByLabel("Email address").fill("new@verdant-fixture.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixture-new-password!");
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(
    page.getByText(
      "Too many emails requested. Please wait before requesting another link. Check your inbox and spam folder first.",
    ),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect(page.url()).toBe(`${APP_ORIGIN}/login`);
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
});

test("reset requests use the dedicated page without PKCE and never retry a sending limit", async ({
  page,
  context,
}) => {
  let requests = 0;
  await page.route(`${FIXTURE_ORIGIN}/auth/v1/recover**`, async (route) => {
    requests++;
    expect(route.request().postDataJSON().code_challenge == null).toBe(true);
    expect(new URL(route.request().url()).searchParams.get("redirect_to")).toBe(
      `${APP_ORIGIN}/reset-password`,
    );
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "over_email_send_rate_limit", msg: "Email sending limit" }),
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill("other@verdant-fixture.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByText(
      "Too many emails requested. Please wait before requesting another link. Check your inbox and spam folder first.",
    ),
  ).toBeVisible();
  expect(requests).toBe(1);
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
});

test("signup success stays on the original sign-in tab even if the provider unexpectedly returns a session", async ({
  page,
  context,
  request,
}) => {
  const session = await emailSession(request, "signup");
  await page.route(`${FIXTURE_ORIGIN}/auth/v1/signup**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) }),
  );
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account", exact: true }).first().click();
  await page.getByLabel("Email address").fill("other@verdant-fixture.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixture-new-password!");
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(
    page.getByText("Check your inbox for a confirmation link. Then return here and sign in."),
  ).toBeVisible();
  await expect(page).toHaveURL(`${APP_ORIGIN}/login`);
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
});

test("a provider fallback fragment on the login page cannot install an emailed app identity", async ({
  page,
  context,
  request,
}) => {
  const session = await emailSession(request, "signup");
  await page.goto(link(session, "signup", "/login"));
  await page.getByLabel("Email address").fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByText("Invalid login credentials")).toBeVisible();
  expect((await context.cookies()).filter((c) => c.name.startsWith("sb-"))).toEqual([]);
});

for (const stage of ["identity", "mutation-success", "mutation-error", "logout"] as const) {
  test(`recovery expiry cannot resume stale ${stage} work or replace a terminal state`, async ({
    page,
    context,
    request,
  }) => {
    const session = await emailSession(request, "recovery");
    await page.clock.install();
    await page.goto(link(session, "recovery"));
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.getByRole("checkbox").check();
    await page.getByLabel("New password", { exact: true }).fill("Async-fixture-password-2026!");
    await page.getByLabel("Confirm new password").fill("Async-fixture-password-2026!");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let completed!: () => void;
    const completion = new Promise<void>((resolve) => {
      completed = resolve;
    });
    let updates = 0;
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/auth/v1/user" && req.method() === "PUT") updates++;
    });
    const path = stage === "logout" ? "logout" : "user";
    await page.route(`${FIXTURE_ORIGIN}/auth/v1/${path}**`, async (route) => {
      const method = route.request().method();
      const block =
        stage === "identity"
          ? method === "GET"
          : stage === "logout"
            ? method === "POST"
            : method === "PUT";
      if (!block) return route.continue();
      // For dispatched mutations, let the fixture commit before delaying its response.
      const response = stage === "mutation-error" ? null : await route.fetch();
      entered();
      await gate;
      if (response) await route.fulfill({ response });
      else
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ msg: "Synthetic delayed failure" }),
        });
      completed();
    });
    await page.getByRole("button", { name: "Update password" }).click();
    await blocked;
    if (stage === "logout") {
      await expect(page.getByRole("heading", { name: "You’re all set" })).toBeVisible();
    }
    // Deterministically run the original proof timer while an awaited request is suspended.
    await page.clock.fastForward(16 * 60 * 1000);
    const terminalHeading = stage === "logout" ? "You’re all set" : "Link unavailable";
    await expect(page.getByRole("heading", { name: terminalHeading })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
    release();
    await completion;
    // Drain response continuations and one render turn, not a wall-clock expiry sleep.
    await page.evaluate(() => new Promise<void>((resolve) => window.setTimeout(resolve, 0)));
    await expect(page.getByRole("heading", { name: terminalHeading })).toBeVisible();
    expect(updates).toBe(stage === "identity" ? 0 : 1);
    expect((await context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);
    if (stage === "mutation-success" || stage === "logout") {
      // Expiry after dispatch cannot undo the mutation; only the linked identity changed.
      for (const [email, password] of [
        [FIXTURE_CREDENTIALS.other.email, "Async-fixture-password-2026!"],
        [FIXTURE_CREDENTIALS.owner.email, FIXTURE_CREDENTIALS.owner.password],
      ]) {
        const login = await request.post(`${FIXTURE_ORIGIN}/auth/v1/token?grant_type=password`, {
          headers: { apikey: FIXTURE_PUBLISHABLE_KEY },
          data: { email, password },
        });
        expect(login.ok()).toBe(true);
        expect((await login.json()).user.email).toBe(email);
      }
    }
  });
}
