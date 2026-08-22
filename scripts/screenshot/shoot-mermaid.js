const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/docs/en/ch01-overview', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const mermaid = await page.$('.mermaid');
  if (mermaid) {
    await mermaid.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await mermaid.screenshot({ path: 'screenshots/en-mermaid.png' });
    console.log('OK');
  } else {
    console.log('NO MERMAID FOUND');
  }
  await browser.close();
})();