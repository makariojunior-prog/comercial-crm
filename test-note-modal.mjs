import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate to the app
    await page.goto('http://localhost:5173/comercial-crm/', { waitUntil: 'networkidle' });
    console.log('Page loaded');

    // Wait for page to be interactive
    await page.waitForTimeout(3000);

    // Look for buttons to trigger note creation
    const buttons = await page.locator('button').all();
    console.log(`Found ${buttons.length} buttons`);

    // Try to find and click a note creation button
    let clickedButton = false;
    for (let btn of buttons) {
      const text = await btn.textContent();
      if (text && text.toLowerCase().includes('nota')) {
        console.log('Clicking button: ' + text);
        await btn.click();
        clickedButton = true;
        await page.waitForTimeout(1500);
        break;
      }
    }

    // Take screenshot of current state
    await page.screenshot({ path: 'note-modal.png', fullPage: true });
    console.log('Screenshot saved: note-modal.png');

    // Check textarea dimensions
    const textarea = await page.locator('textarea').first();
    const textareaVisible = await textarea.isVisible().catch(() => false);
    if (textareaVisible) {
      const boundingBox = await textarea.boundingBox();
      console.log(`Textarea found - Height: ${boundingBox?.height}px`);
    } else {
      console.log('Textarea not visible');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await page.waitForTimeout(2000);
    await browser.close();
  }
})();
