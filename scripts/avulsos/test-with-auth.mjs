import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log('Loading app...');
    await page.goto('http://localhost:5173/comercial-crm/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Try to login with test email
    const emailInput = await page.locator('input[type="email"]').first().catch(() => null);
    if (emailInput) {
      console.log('Found email input, attempting login...');
      await emailInput.fill('makariojr2@gmail.com');
      
      const passwordInput = await page.locator('input[type="password"]').first().catch(() => null);
      if (passwordInput) {
        // Try a dummy password - this will likely fail but we can check the flow
        await passwordInput.fill('test123');
      }

      // Look for login button
      const loginBtn = await page.locator('button:has-text("Entrar")').first().catch(() => null);
      if (loginBtn) {
        await loginBtn.click();
        console.log('Clicked login button');
        await page.waitForTimeout(2000);
      }
    }

    // Check if we're logged in or still at login page
    const hasDashboard = await page.locator('text=/Dashboard|Notas|Clientes/i').first().isVisible().catch(() => false);
    
    if (hasDashboard) {
      console.log('Successfully logged in, taking screenshot...');
      await page.screenshot({ path: 'dashboard.png' });

      // Try to find and click a note button
      const buttons = await page.locator('button').all();
      for (let btn of buttons) {
        const text = await btn.textContent();
        if (text && text.toLowerCase().includes('nota')) {
          console.log('Found note button, clicking...');
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }

      // Take screenshot of note modal
      await page.screenshot({ path: 'note-modal-final.png' });
      console.log('Note modal screenshot saved');
    } else {
      console.log('Still at login page - credentials may be needed');
      await page.screenshot({ path: 'login-page.png' });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
  }
})();
