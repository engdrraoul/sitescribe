const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://13.37.100.54/');
  await page.waitForTimeout(5000); // Wait for scripts

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button.autofill-btn')).map(b => ({
      text: b.innerText,
      email: b.getAttribute('data-email'),
      pass: b.getAttribute('data-pass')
    }));
  });

  console.log(JSON.stringify(buttons, null, 2));
  await browser.close();
})();
