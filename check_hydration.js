const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Listen for console logs and errors
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  const content = await page.content();
  if (content.includes('Login to Continue')) {
    console.log('SUCCESS: "Login to Continue" found in DOM!');
  } else {
    console.log('FAIL: "Login to Continue" NOT found in DOM!');
  }
  
  if (content.includes('skeleton')) {
    console.log('WARNING: Skeletons are still present in DOM!');
  } else {
    console.log('SUCCESS: Skeletons are gone from DOM!');
  }

  await browser.close();
})();
