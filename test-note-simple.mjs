import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5173/comercial-crm/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    console.log('Waiting for app to load...');
    await page.waitForTimeout(2000);

    console.log('Looking for buttons...');
    // Try to find any note-related button
    const buttons = await page.locator('button').all();
    console.log(`Found ${buttons.length} buttons on page`);

    // Try to click the first button that might create a note
    for (let i = 0; i < Math.min(5, buttons.length); i++) {
      const text = await buttons[i].textContent();
      console.log(`Button ${i}: ${text?.substring(0, 50)}`);
      if (text && text.toLowerCase().includes('nota')) {
        console.log(`Clicking button: ${text}`);
        await buttons[i].click();
        await page.waitForTimeout(1500);
        break;
      }
    }

    console.log('Taking screenshot...');
    await page.screenshot({ path: 'note-test.png', fullPage: false });
    console.log('Screenshot saved to note-test.png');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
