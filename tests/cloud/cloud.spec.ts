import { expect, test } from "@playwright/test";
test("opt-in real hosted QA (no fixtures, no trace, no stored sessions)", async ({ browser }) => {
  test.skip(process.env.CLOUD_QA !== "1", "Explicit CLOUD_QA=1 opt-in required");
  expect(test.info().project.use.trace).toBe("off");
  expect(test.info().project.use.screenshot).toBe("off");
  expect(test.info().project.use.video).toBe("off");
  const { runCloudQA } = await import("./runner");
  await runCloudQA(browser);
});
