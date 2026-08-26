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

test("publishes one adaptive Pify favicon for both locales", async ({
  page,
  request,
}) => {
  let iconHref = "";

  for (const path of ["/en/quickstart", "/vi/quickstart"]) {
    await page.goto(path);

    const icons = page.locator('link[rel="icon"]');
    await expect(icons).toHaveCount(1);
    await expect(icons).toHaveAttribute("type", "image/svg+xml");
    await expect(icons).toHaveAttribute("sizes", "any");

    iconHref = (await icons.getAttribute("href")) ?? "";
    const iconUrl = new URL(iconHref, "http://127.0.0.1:3010");
    expect(iconUrl.pathname).toBe("/icon.svg");
    expect(iconUrl.search).not.toBe("");
  }

  const [metadataIcon, compatibilityIcon] = await Promise.all([
    request.get(iconHref),
    request.get("/favicon.svg"),
  ]);

  for (const response of [metadataIcon, compatibilityIcon]) {
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
  }

  const svg = await metadataIcon.text();
  expect(svg).toContain("@media (prefers-color-scheme: dark)");
  expect(svg).toContain(".mark { fill: #09090b; }");
  expect(svg).toContain(".mark { fill: #ffffff; }");
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
    "/api/search?query=shouldStopAfterTurn&locale=vi",
  );
  expect(searchResponse.ok()).toBe(true);
  const results = (await searchResponse.json()) as Array<{ url: string }>;
  expect(results.length).toBeGreaterThan(0);
  expect(
    results.filter((result) => !/^\/vi(?:[\/#]|$)/.test(result.url)),
  ).toEqual([]);

  await page.goto("/vi");
  await page
    .getByRole("button", { name: "Mở tìm kiếm" })
    .evaluate((element: HTMLButtonElement) => element.click());
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.getByPlaceholder("Tìm kiếm").fill("shouldStopAfterTurn");

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

  const highlightedCode = page.locator(
    ".pify-docs-body figure.shiki code.language-typescript",
  );
  await expect(highlightedCode.first()).toBeVisible();
  await expect(
    highlightedCode.first().locator("span[style]").first(),
  ).toBeVisible();

  const lightTokenColor = await highlightedCode
    .first()
    .locator("span[style]")
    .first()
    .evaluate((element) => getComputedStyle(element).color);

  const html = page.locator("html");
  await expect(html).toHaveClass(/light/);
  await page
    .getByRole("button", { name: "Toggle Theme" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(html).toHaveClass(/dark/);

  const darkTokenColor = await highlightedCode
    .first()
    .locator("span[style]")
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(darkTokenColor).not.toBe(lightTokenColor);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vi/quickstart");
  await expect(
    page.getByRole("button", { name: "Mở", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sửa trên GitHub" }),
  ).toBeVisible();
  await expect(page.getByText("Kết quả", { exact: true })).toBeVisible();
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

test("keeps course syntax highlighting and Mermaid rendering across themes", async ({
  page,
}) => {
  await page.goto("/en/course/07-agent-loop");

  const diagram = page.locator(".pify-mermaid > div > svg").first();
  const highlightedCode = page
    .locator(".pify-docs-body figure.shiki code")
    .first();
  const highlightedToken = highlightedCode.locator("span[style]").first();

  await expect(diagram).toBeVisible();
  await expect(highlightedCode).toBeVisible();
  await expect(highlightedToken).toBeVisible();

  const lightTokenColor = await highlightedToken.evaluate(
    (element) => getComputedStyle(element).color,
  );

  const html = page.locator("html");
  await expect(html).toHaveClass(/light/);
  await page
    .getByRole("button", { name: "Toggle Theme" })
    .evaluate((element: HTMLButtonElement) => element.click());
  await expect(html).toHaveClass(/dark/);

  const darkTokenColor = await highlightedToken.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(darkTokenColor).not.toBe(lightTokenColor);
  await expect(highlightedToken).toBeVisible();
  await expect(diagram).toBeVisible();
});

test("serves machine-readable documentation surfaces", async ({ request }) => {
  const [
    robots,
    sitemap,
    englishIndex,
    vietnameseIndex,
    englishFull,
    vietnameseFull,
  ] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
    request.get("/en/llms.txt"),
    request.get("/vi/llms.txt"),
    request.get("/en/llms-full.txt"),
    request.get("/vi/llms-full.txt"),
  ]);

  for (const response of [
    robots,
    sitemap,
    englishIndex,
    vietnameseIndex,
    englishFull,
    vietnameseFull,
  ]) {
    expect(response.ok()).toBe(true);
  }

  const machineReadableBodies = await Promise.all([
    robots.text(),
    sitemap.text(),
    englishIndex.text(),
    vietnameseIndex.text(),
    englishFull.text(),
    vietnameseFull.text(),
  ]);
  const [
    robotsBody,
    sitemapBody,
    englishIndexBody,
    vietnameseIndexBody,
    englishFullBody,
  ] = machineReadableBodies;

  expect(robotsBody).toContain("Sitemap: https://docs.pify.dev/sitemap.xml");
  expect(sitemapBody.match(/<url>/g)).toHaveLength(86);

  for (const [response, body] of [
    [englishIndex, englishIndexBody],
    [vietnameseIndex, vietnameseIndexBody],
  ] as const) {
    expect(response.headers()["content-type"]).toContain("text/plain");
    expect(body.match(/^- \[/gm)).toHaveLength(43);
  }

  expect(englishIndexBody).toContain(
    "[Build Your Own Pi-style Agent](https://docs.pify.dev/en/course)",
  );
  expect(englishIndexBody).toContain(
    "[Checkpoint 14: Evaluate the Agent reproducibly](https://docs.pify.dev/en/course/14-agent-evaluation)",
  );
  expect(vietnameseIndexBody).toContain(
    "[Tự xây Pi-style Agent](https://docs.pify.dev/vi/course)",
  );
  expect(vietnameseIndexBody).toContain(
    "[Checkpoint 14: Đánh giá Agent có thể tái lập](https://docs.pify.dev/vi/course/14-agent-evaluation)",
  );

  expect(englishFull.headers()["content-type"]).toContain("text/plain");
  expect(englishFullBody.length).toBeGreaterThan(100_000);
  expect(englishFullBody).toContain(
    "The smallest credible release gate covers every layer",
  );
  expect(englishFullBody).toContain("EVALUATION_CLEANUP_FAILED");

  for (const body of machineReadableBodies) {
    expect(body).not.toMatch(/(?:https:\/\/docs\.pify\.dev)?\/zh(?:[\/#?]|$)/);
  }
});

test("keeps course search results scoped to the requested locale", async ({
  request,
}) => {
  const [englishResponse, vietnameseResponse] = await Promise.all([
    request.get("/api/search?query=SCRIPT_EXHAUSTED&locale=en"),
    request.get("/api/search?query=SCRIPT_EXHAUSTED&locale=vi"),
  ]);

  for (const response of [englishResponse, vietnameseResponse]) {
    expect(response.ok()).toBe(true);
  }

  const englishResults = (await englishResponse.json()) as Array<{
    url: string;
  }>;
  const vietnameseResults = (await vietnameseResponse.json()) as Array<{
    url: string;
  }>;

  expect(englishResults.length).toBeGreaterThan(0);
  expect(vietnameseResults.length).toBeGreaterThan(0);
  expect(englishResults.every(({ url }) => /^\/en(?:[\/#]|$)/.test(url))).toBe(
    true,
  );
  expect(
    vietnameseResults.every(({ url }) => /^\/vi(?:[\/#]|$)/.test(url)),
  ).toBe(true);
  expect(
    englishResults.some(({ url }) =>
      url.startsWith("/en/course/04-deterministic-model"),
    ),
  ).toBe(true);
  expect(
    vietnameseResults.some(({ url }) =>
      url.startsWith("/vi/course/04-deterministic-model"),
    ),
  ).toBe(true);
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
  expect(paths).toHaveLength(86);

  for (let index = 0; index < paths.length; index += 8) {
    const batch = paths.slice(index, index + 8);
    const pages = await Promise.all(
      batch.map(async (path) => {
        const response = await request.get(path);
        return { path, response, body: await response.text() };
      }),
    );

    for (const { path, response, body } of pages) {
      expect(response.ok(), path).toBe(true);
      expect(body, path).not.toMatch(
        /<a[^>]+href="(?!https?:\/\/|mailto:|#)[^"]*\.mdx?(?:[?#][^"]*)?"/i,
      );
    }
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

test("redirects legacy Markdown URLs to clean localized routes", async ({
  request,
}) => {
  const cases = [
    ["/quickstart.md", "/en/quickstart"],
    ["/en/how-to/add-custom-tool.md", "/en/how-to/add-custom-tool"],
    ["/vi/reference/api.mdx", "/vi/reference/api"],
    ["/course/07-agent-loop.md", "/en/course/07-agent-loop"],
    ["/en/course/index.mdx", "/en/course"],
    ["/vi/course/14-agent-evaluation.md", "/vi/course/14-agent-evaluation"],
  ] as const;

  for (const [legacyPath, cleanPath] of cases) {
    const response = await request.get(legacyPath, { maxRedirects: 0 });
    expect(response.status(), legacyPath).toBe(307);
    expect(response.headers().location, legacyPath).toBe(cleanPath);
  }
});
