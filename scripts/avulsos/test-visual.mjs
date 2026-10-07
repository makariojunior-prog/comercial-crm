import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  try {
    const browser = await chromium.launch();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    await page.goto('http://localhost:5173/comercial-crm/', { waitUntil: 'domcontentloaded' });
    console.log('Page loaded');
    
    // Look for any element that might open a note dialog
    // Try clicking the first button that might be "Nova Nota"
    await page.evaluate(() => {
      // Dispatch a keyboard event or look for note creation UI
      const buttons = document.querySelectorAll('button');
      for (let btn of buttons) {
        console.log(btn.textContent);
        if (btn.textContent.toLowerCase().includes('nota')) {
          btn.click();
          return;
        }
      }
    });

    await page.waitForTimeout(1500);

    // Take screenshot
    await page.screenshot({ path: 'verification-screenshot.png', fullPage: true });
    console.log('Screenshot taken');

    // Get info about elements
    const info = await page.evaluate(() => {
      const textarea = document.querySelector('textarea');
      const corespButtons = document.querySelectorAll('[class*="px-2 py-0"]');
      const colorButtons = document.querySelectorAll('[title*="Vermelho"]');
      
      return {
        textareaExists: !!textarea,
        corespButtonsCount: corespButtons.length,
        redColorExists: colorButtons.length > 0
      };
    });

    console.log('Page info:', info);

    await browser.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
