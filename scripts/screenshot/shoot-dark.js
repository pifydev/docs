const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/docs/en', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.setItem('starlight-theme', 'dark');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../../screenshots/en-home-dark-viewport.png', fullPage: false });
  await page.screenshot({ path: '../../screenshots/en-home-dark-full.png', fullPage: true });
  console.log('OK dark');
  await browser.close();
})();