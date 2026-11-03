import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APP_ORIGIN } from "./fixture-config";

async function checkRevenue(page: Page) {
  for (const svg of await page.locator("svg.line-chart").all()) {
    await expect(svg).toHaveAttribute("role", "img");
    await expect(svg).toHaveAccessibleName(/.+/);
    await expect(svg.locator("desc")).toHaveText(/.+/);
    const check = await svg.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll<SVGTextElement>("text")).map((text) => {
        const r = text.getBoundingClientRect();
        const ctm = text.getScreenCTM()!;
        return {
          size: parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b),
          clipped:
            r.left < bounds.left - 1 ||
            r.right > bounds.right + 1 ||
            r.top < bounds.top - 1 ||
            r.bottom > bounds.bottom + 1,
        };
      });
    });
    expect(check.every((t) => t.size >= 11 && !t.clipped)).toBe(true);
    const wrap = svg.locator("..");
    if (await wrap.evaluate((el) => el.scrollWidth > el.clientWidth + 1)) {
      await expect(wrap).toHaveAttribute("tabindex", "0");
      await expect(wrap).toHaveAttribute("role", "region");
      await expect(wrap).toHaveAccessibleName(/.+/);
      await expect(wrap.locator("..").locator(".chart-scroll-hint")).toHaveCount(0);
      await wrap.focus();
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await wrap.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      expect(
        await wrap.evaluate((el) => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) <= 1),
      ).toBe(true);
    }
  }
}

async function checkControls(page: Page, locale: string, requireOverflow = false) {
  for (const container of await page.locator(".chart-container:visible").all()) {
    const fit = container.getByRole("button", {
      name: locale === "en" ? "Fit chart" : "پورا چارٹ دکھائیں",
    });
    const scroll = container.getByRole("button", {
      name: locale === "en" ? "Scroll chart" : "چارٹ سرکائیں",
    });
    const wrap = container.locator(".chart-wrap");
    const svg = wrap.locator("svg");
    await expect(fit).toBeVisible();
    await expect(scroll).toBeVisible();
    await expect(fit).toHaveAttribute("aria-pressed", "false");
    await expect(scroll).toHaveAttribute("aria-pressed", "true");
    const expandedWidth = await svg.evaluate((el) => el.getBoundingClientRect().width);
    const originalOverflow = await wrap.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (requireOverflow) expect(originalOverflow).toBeGreaterThan(5);
    const positions = await container.evaluate((el) => {
      const controls = el.querySelector(".chart-controls")!.getBoundingClientRect();
      const buttons = Array.from(el.querySelectorAll(".chart-control"), (button) =>
        button.getBoundingClientRect(),
      );
      const block = el.getBoundingClientRect();
      const chart = el.querySelector(".chart-wrap")!.getBoundingClientRect();
      return {
        controlsRight: controls.right,
        blockRight: block.right,
        chartTop: chart.top,
        bottom: controls.bottom,
        buttons: buttons.map((r) => ({
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        })),
      };
    });
    expect(Math.abs(positions.controlsRight - positions.blockRight)).toBeLessThan(1);
    expect(positions.bottom).toBeLessThanOrEqual(positions.chartTop + 1);
    expect(positions.buttons[0].right).toBeLessThanOrEqual(positions.buttons[1].left + 1);
    expect(positions.buttons[1].right).toBeLessThanOrEqual(positions.blockRight + 1);
    await expect(fit).toHaveAttribute("title", /.+/);
    await expect(scroll).toHaveAttribute("title", /.+/);
    await fit.focus();
    await expect(fit).toBeFocused();
    expect(await fit.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(fit).toHaveAttribute("aria-pressed", "true");
    await expect(scroll).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () =>
        wrap.evaluate((el) => {
          const viewport = el.getBoundingClientRect();
          const svg = el.querySelector("svg")!;
          const rect = svg.getBoundingClientRect();
          const textClipped = Array.from(svg.querySelectorAll("text")).some((text) => {
            const r = text.getBoundingClientRect();
            return (
              r.left < rect.left - 1 ||
              r.right > rect.right + 1 ||
              r.top < rect.top - 1 ||
              r.bottom > rect.bottom + 1
            );
          });
          return (
            rect.left >= viewport.left - 1 &&
            rect.right <= viewport.right + 1 &&
            el.scrollWidth <= el.clientWidth + 1 &&
            !textClipped
          );
        }),
      )
      .toBe(true);
    const fittedWidth = await svg.evaluate((el) => el.getBoundingClientRect().width);
    if (requireOverflow) expect(fittedWidth).toBeLessThan(expandedWidth - 5);
    // Scroll restores the intrinsic readable dimensions, even when the viewport is wider.
    await scroll.focus();
    await page.keyboard.press("Space");
    await expect(scroll).toHaveAttribute("aria-pressed", "true");
    await expect(fit).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(async () =>
        Math.abs((await svg.evaluate((el) => el.getBoundingClientRect().width)) - expandedWidth),
      )
      .toBeLessThan(1);
    if (requireOverflow) {
      await expect
        .poll(() => wrap.evaluate((el) => el.scrollWidth - el.clientWidth))
        .toBeGreaterThan(5);
      await wrap.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      expect(await wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(5);
    }
    await expect(container.locator(".chart-scroll-hint")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  }
}

async function checkCategoryRows(page: Page, mobile: boolean) {
  const containers = page.locator(".category-revenue");
  for (const container of await containers.all()) {
    const svg = container.locator("svg.bar-chart");
    const list = container.locator(".category-revenue-list");
    if (mobile) {
      await expect(list).toBeVisible();
      await expect(svg).toBeVisible();
      await expect(container.getByRole("img")).toHaveCount(1);
      await expect(container.getByRole("list")).toHaveCount(0);
      await expect(list).toHaveAttribute("aria-hidden", "true");
    } else {
      await expect(list).toBeHidden();
      await expect(svg).toBeVisible();
      await expect(container.getByRole("list")).toHaveCount(0);
      await expect(svg).toHaveAccessibleName(/.+/);
      await expect(svg.locator("desc")).toHaveText(/.+/);
      const geometry = await svg.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const texts = Array.from(el.querySelectorAll<SVGTextElement>("text"));
        const bounds = texts.map((text) => {
          const r = text.getBoundingClientRect();
          const ctm = text.getScreenCTM()!;
          return {
            left: r.left,
            right: r.right,
            top: r.top,
            bottom: r.bottom,
            font: parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b),
          };
        });
        return {
          bounds,
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        };
      });
      for (const b of geometry.bounds) {
        expect(b.font).toBeGreaterThanOrEqual(11);
        expect(b.left).toBeGreaterThanOrEqual(geometry.rect.left - 1);
        expect(b.right).toBeLessThanOrEqual(geometry.rect.right + 1);
        expect(b.top).toBeGreaterThanOrEqual(geometry.rect.top - 1);
        expect(b.bottom).toBeLessThanOrEqual(geometry.rect.bottom + 1);
      }
      for (let i = 0; i < geometry.bounds.length; i++)
        for (let j = i + 1; j < geometry.bounds.length; j++) {
          const a = geometry.bounds[i],
            b = geometry.bounds[j];
          expect(
            a.right <= b.left + 1 ||
              b.right <= a.left + 1 ||
              a.bottom <= b.top + 1 ||
              b.bottom <= a.top + 1,
          ).toBe(true);
        }
    }
  }
  for (const row of await page.locator(".category-revenue-row:visible").all()) {
    await row.scrollIntoViewIfNeeded();
    const name = row.locator(".category-revenue-name");
    const value = row.locator(".category-revenue-value");
    await expect(name).toBeVisible();
    await expect(value).toBeVisible();
    const bounds = await row.evaluate((el) => {
      const row = el.getBoundingClientRect();
      return Array.from(el.children).map((child) => {
        const r = child.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          font: parseFloat(getComputedStyle(child).fontSize),
          rowLeft: row.left,
          rowRight: row.right,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      });
    });
    const [a, b] = bounds;
    expect(
      a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1,
    ).toBe(true);
    for (const b of bounds) {
      expect(b.font).toBeGreaterThanOrEqual(14);
      expect(b.left).toBeGreaterThanOrEqual(Math.max(0, b.rowLeft) - 1);
      expect(b.right).toBeLessThanOrEqual(Math.min(b.viewportWidth, b.rowRight) + 1);
      expect(b.top).toBeGreaterThanOrEqual(-1);
      expect(b.bottom).toBeLessThanOrEqual(b.viewportHeight + 1);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}

test("responsive fixture: readable exact category rows and accessible revenue", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.CHART_FIXTURE_ENABLED !== "1",
    "Run npm run test:chart-responsive for the isolated fixture.",
  );
  test.setTimeout(240000);
  // The category rendering must not depend on Segmenter availability.
  await page.addInitScript(() => {
    Object.defineProperty(Intl, "Segmenter", { value: undefined });
  });
  for (const locale of ["en", "ur"])
    for (const theme of ["light", "night"])
      for (const width of [360, 390, 700, 701, 1440]) {
        await context.addCookies([
          { name: "verdant-locale", value: locale, url: APP_ORIGIN },
          { name: "verdant-theme", value: theme, url: APP_ORIGIN },
        ]);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${APP_ORIGIN}/chart-fixture`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("html")).toHaveAttribute("dir", locale === "ur" ? "rtl" : "ltr");
        await expect(page.locator("svg.line-chart")).toHaveCount(3);
        await checkRevenue(page);
        await checkCategoryRows(page, width <= 700);
        await checkControls(page, locale, true);
        await expect(page.getByText("Scroll sideways to see the whole chart")).toHaveCount(0);
        const long = page.getByRole("heading", { name: "Long categories" }).locator("..");
        const names = [
          "Household cleaning and personal care essentials",
          "گھریلو صفائی اور روزمرہ استعمال کی اشیاء",
          "UnbrokenCategoryNameWithExtraLongWords",
        ];
        const values = ["$1,234,567,890.12", "-$543,210,987.65", "$90,071,992,547,409.91"];
        for (let i = 0; i < names.length; i++) {
          const row =
            width <= 700
              ? long.locator(".category-revenue-row").nth(i)
              : long.locator(".category-bar-row").nth(i);
          await expect(
            row.locator(width <= 700 ? ".category-revenue-name" : ".chart-label"),
          ).toHaveText(names[i]);
          await expect(
            row.locator(width <= 700 ? ".category-revenue-value" : ".chart-value"),
          ).toHaveText(values[i]);
        }
        // The visible mobile key and the chart always use the same exact source values.
        for (let i = 0; i < names.length; i++) {
          await expect(long.locator(".category-bar-row").nth(i).locator(".chart-label")).toHaveText(
            names[i],
          );
          await expect(long.locator(".category-bar-row").nth(i).locator(".chart-value")).toHaveText(
            values[i],
          );
          await expect(long.locator("svg.bar-chart desc")).toContainText(
            `${names[i]}: ${values[i]}`,
          );
        }
        for (const heading of ["Empty revenue", "Empty categories"]) {
          const empty = page.getByRole("heading", { name: heading }).locator("..");
          await expect(empty.locator(".chart-control")).toHaveCount(0);
          await expect(empty.locator("svg.line-chart, svg.bar-chart")).toHaveCount(0);
        }
        await expect(page.locator("svg.line-chart").nth(1).locator("desc")).toContainText(
          "2025-01-01: $1,234,567,890.12",
        );
        const short = page.getByRole("heading", { name: "Short categories" }).locator("..");
        const rowSelector = width <= 700 ? ".category-revenue-row" : ".category-bar-row";
        await expect(short.locator(rowSelector).last()).toContainText("$0.00");
        {
          await expect(short.locator(".chart-bar")).toHaveCount(3);
          const bars = await short.locator("svg.bar-chart").evaluate((el) => {
            const rows = Array.from(el.querySelectorAll(".category-bar-row"));
            return rows.slice(0, 3).map((row) => {
              const bar = row.querySelector("rect")!;
              return {
                x: Number(bar.getAttribute("x")),
                width: Number(bar.getAttribute("width")),
                negative: bar.classList.contains("chart-bar--negative"),
              };
            });
          });
          expect(bars[0].negative).toBe(false);
          expect(bars[1].negative).toBe(true);
          expect(bars[2].negative).toBe(false);
          expect(bars[0].x).toBeCloseTo(bars[1].x + bars[1].width, 5);
          expect(bars[2].x).toBeCloseTo(bars[0].x, 5);
        }
        const limit = page.getByRole("heading", { name: "Category limit" }).locator("..");
        await expect(limit.locator(rowSelector)).toHaveCount(6);
        await expect(limit.locator(".category-limit")).toContainText(
          locale === "en" ? "Showing first 6 of 7 categories" : "اقسام دکھائی گئی ہیں",
        );
        const zeros = page.getByRole("heading", { name: "Zero categories" }).locator("..");
        await expect(zeros.locator(rowSelector)).toHaveCount(6);
        await expect(zeros.locator(rowSelector).first()).toContainText("$0.00");
        await expect(zeros.locator(".chart-bar")).toHaveCount(0);
        await expect(zeros.locator(".chart-axis")).toHaveCount(1);
        await expect(zeros.locator(".chart-axis")).toHaveText("$0.00");
        await expect(zeros.locator(".category-limit")).toBeVisible();
        const audit = await new AxeBuilder({ page })
          .include("main")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(audit.violations.map((v) => v.id)).toEqual([]);
      }
});

test("actual dashboard and reports charts fit their responsive containers", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(240000);
  const { FIXTURE_ORIGIN, FIXTURE_CONTROL_HEADER, FIXTURE_CONTROL_VALUE, FIXTURE_CREDENTIALS } =
    await import("./fixture-config");
  expect(
    (
      await request.post(`${FIXTURE_ORIGIN}/__fixture/reset`, {
        headers: { [FIXTURE_CONTROL_HEADER]: FIXTURE_CONTROL_VALUE },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(`${APP_ORIGIN}/login`);
  await page.getByLabel("Email address", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.email);
  await page.getByLabel("Password", { exact: true }).fill(FIXTURE_CREDENTIALS.owner.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  for (const locale of ["en", "ur"])
    for (const theme of ["light", "night"])
      for (const width of [360, 390, 1440])
        for (const path of ["/", "/reports"]) {
          await context.addCookies([
            { name: "verdant-locale", value: locale, url: APP_ORIGIN },
            { name: "verdant-theme", value: theme, url: APP_ORIGIN },
          ]);
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${APP_ORIGIN}${path}`);
          await page.evaluate(() => document.fonts.ready);
          await expect(page.locator("svg.line-chart")).toHaveCount(1);
          await checkRevenue(page);
          await checkCategoryRows(page, width <= 700);
          await checkControls(page, locale);
          const revenuePanel = page.locator("svg.line-chart").locator("xpath=ancestor::section[1]");
          await expect(
            revenuePanel.locator(".panel-heading + .chart-container > .chart-controls"),
          ).toHaveCount(1);
          if (path === "/reports") {
            const categoryPanel = page
              .locator("svg.bar-chart")
              .locator("xpath=ancestor::section[1]");
            await expect(
              categoryPanel.locator(".panel-heading + .category-revenue .chart-controls"),
            ).toHaveCount(1);
          }
        }
});
