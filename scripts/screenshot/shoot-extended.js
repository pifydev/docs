const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT_DIR = 'E:\\\\project\\\\pi-docs\\\\screenshots';
const TARGETS = [{"url":"http://localhost:4321/docs/en","name":"en-home"},{"url":"http://localhost:4321/docs/en/ch01-overview","name":"en-ch01"},{"url":"http://localhost:4321/docs/en/ch02-three-layer-arch","name":"en-ch02"},{"url":"http://localhost:4321/docs/en/ch04-model-invocation","name":"en-ch04"},{"url":"http://localhost:4321/docs/vi","name":"vi-home"},{"url":"http://localhost:4321/docs/vi/ch01-overview","name":"vi-ch01"},{"url":"http://localhost:4321/docs/zh","name":"zh-home"},{"url":"http://localhost:4321/docs/zh/ch04-model-invocation","name":"zh-ch04"}];

const VIEWPORT = { width: 1280, height: 800 };
const RENDER_WAIT_MS = 3000;

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const target of TARGETS) {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    try {
      const resp = await page.goto(target.url, { waitUntil: 'load', timeout: 15000 });
      const httpStatus = resp ? resp.status() : null;
      const finalUrl = page.url();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(RENDER_WAIT_MS);

      const viewportPath = path.join(OUT_DIR, target.name + '-viewport.png');
      await page.screenshot({ path: viewportPath, fullPage: false });

      const fullPath = path.join(OUT_DIR, target.name + '-full.png');
      await page.screenshot({ path: fullPath, fullPage: true });

      results.push({
        target: target.name, ok: true, httpStatus, finalUrl,
        viewportPath, fullPath,
        viewportSize: fs.statSync(viewportPath).size,
        fullSize: fs.statSync(fullPath).size,
      });
    } catch (err) {
      results.push({ target: target.name, ok: false, error: String(err && err.message || err) });
    } finally {
      await context.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify({ results }, null, 2));
})();