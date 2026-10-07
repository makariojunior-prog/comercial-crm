const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('http://localhost:5173/comercial-crm/', { waitUntil: 'networkidle' });
  console.log('Page loaded');
  // Keep browser open
  await page.waitForTimeout(60000);
  await browser.close();
})();
