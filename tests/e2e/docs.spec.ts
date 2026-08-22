import { expect, test } from "@playwright/test";

test("negotiates locale and rejects unsupported public locales", async ({
  browser,
}) => {
  const englishContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3010",
  });
  const englishPage = await englishContext.newPage();
  await englishPage.goto("/");
  await expect(englishPage).toHaveURL(/\/en$/);

  const response = await englishPage.goto("/zh/ch01-overview");
  expect(response?.status()).toBe(404);
  await expect(englishPage.getByRole("heading", { level: 1 })).toContainText(
    "Page not found",
  );
  await englishContext.close();

  const vietnameseContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3010",
  });
  await vietnameseContext.addCookies([
    {
      name: "pify-locale",
      value: "vi",
      url: "http://127.0.0.1:3010",
    },
  ]);
  const vietnamesePage = await vietnameseContext.newPage();
  await vietnamesePage.goto("/");
  await expect(vietnamesePage).toHaveURL(/\/vi$/);
  await vietnameseContext.close();
});

test("publishes one page title and paired canonical metadata", async ({
  page,
}) => {
  await page.goto("/en/quickstart");

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Quickstart",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://docs.pify.dev/en/quickstart",
  );
  await expect(
    page.locator('link[rel="alternate"][hreflang="en"]'),
  ).toHaveAttribute("href", "https://docs.pify.dev/en/quickstart");
  await expect(
    page.locator('link[rel="alternate"][hreflang="vi"]'),
  ).toHaveAttribute("href", "https://docs.pify.dev/vi/quickstart");
  await expect(
    page.locator('link[rel="alternate"][hreflang="x-default"]'),
  ).toHaveAttribute("href", "https://docs.pify.dev/en/quickstart");
});

test("switches the current page and keeps search results locale-scoped", async ({
  page,
  request,
}) => {
  await page.goto("/vi/ch01-overview");

  await page.getByRole("button", { name: "Chọn ngôn ngữ" }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/ch01-overview$/);

  const searchResponse = await request.get(
    "/api/search?query=vòng%20lặp&locale=vi",
  );
  expect(searchResponse.ok()).toBe(true);
  const results = (await searchResponse.json()) as Array<{ url: string }>;
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((result) => result.url.startsWith("/vi/"))).toBe(true);

  await page.goto("/vi");
  await page
    .getByRole("button", { name: "Mở tìm kiếm" })
    .evaluate((element: HTMLButtonElement) => element.click());
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByPlaceholder("Tìm kiếm").fill("vòng lặp");

  const firstResult = dialog.locator("button[aria-selected]").first();
  await expect(firstResult).toContainText("Chương 3");
  await Promise.all([
    page.waitForURL(/\/vi\/ch03-agent-loop/),
    firstResult.evaluate((element: HTMLButtonElement) => element.click()),
  ]);
});

test("renders docs primitives, theme controls, and a usable mobile drawer", async ({
  page,
}) => {
  await page.goto("/en/ch01-overview");
  await expect(page.locator(".pify-mermaid > div > svg")).toBeVisible();
  await expect(page.locator("pre").first()).toBeVisible();

  const html = page.locator("html");
  await expect(html).toHaveClass(/light/);
  await page
    .getByRole("button", { name: "Toggle Theme" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(html).toHaveClass(/dark/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/quickstart");
  await expect(
    page.getByRole("button", { name: "Mở", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sửa trên GitHub" }),
  ).toBeVisible();
  await expect(page.getByText("Bạn sẽ có gì ở cuối tutorial")).toBeVisible();
  await expect(page.locator(".pify-docs-body")).not.toContainText(":::tip");
  const mobileNav = page.getByRole("button", { name: "Mở thanh điều hướng" });
  await expect(mobileNav).toBeVisible();

  const navBox = await mobileNav.boundingBox();
  expect(navBox?.width).toBeGreaterThanOrEqual(44);
  expect(navBox?.height).toBeGreaterThanOrEqual(44);

  await mobileNav.click();
  await expect(
    page.getByRole("button", { name: "Chọn ngôn ngữ" }),
  ).toBeVisible();
  await expect(
    page.locator('#nd-sidebar-mobile a[href="/vi/ch01-overview"]'),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  const focusStyle = await page.locator(":focus").evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      outline: style.outlineStyle,
      shadow: style.boxShadow,
    };
  });
  expect(focusStyle.tag).not.toBe("BODY");
  expect(focusStyle.outline !== "none" || focusStyle.shadow !== "none").toBe(
    true,
  );
});

test("serves machine-readable documentation surfaces", async ({ request }) => {
  const [robots, sitemap, index, full] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
    request.get("/vi/llms.txt"),
    request.get("/en/llms-full.txt"),
  ]);

  for (const response of [robots, sitemap, index, full]) {
    expect(response.ok()).toBe(true);
  }

  expect(await robots.text()).toContain(
    "Sitemap: https://docs.pify.dev/sitemap.xml",
  );
  expect((await sitemap.text()).match(/<url>/g)).toHaveLength(46);
  expect(index.headers()["content-type"]).toContain("text/plain");
  expect((await index.text()).match(/^- \[/gm)).toHaveLength(23);
  expect(full.headers()["content-type"]).toContain("text/plain");
  expect((await full.text()).length).toBeGreaterThan(100_000);
});

test("renders every internal Markdown source link as a clean public route", async ({
  page,
  request,
}) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);

  const paths = Array.from(
    (await sitemap.text()).matchAll(
      /<loc>https:\/\/docs\.pify\.dev([^<]+)<\/loc>/g,
    ),
    (match) => match[1],
  );
  expect(paths).toHaveLength(46);

  for (const path of paths) {
    const response = await request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(await response.text(), path).not.toMatch(
      /<a[^>]+href="(?!https?:\/\/|mailto:|#)[^"]*\.mdx?(?:[?#][^"]*)?"/i,
    );
  }

  await page.goto("/en");
  const quickstart = page.locator('.pify-docs-body a[href="/en/quickstart"]');
  await expect(quickstart.first()).toBeVisible();
  await quickstart.first().click();
  await expect(page).toHaveURL(/\/en\/quickstart$/);

  const customTool = page.locator(
    '.pify-docs-body a[href="/en/how-to/add-custom-tool"]',
  );
  await expect(customTool).toBeVisible();
  await customTool.click();
  await expect(page).toHaveURL(/\/en\/how-to\/add-custom-tool$/);

  await page.goto("/vi");
  await expect(
    page.locator('.pify-docs-body a[href="/vi/reference/api"]').first(),
  ).toBeVisible();
});
