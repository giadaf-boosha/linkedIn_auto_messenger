import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chrome from 'chrome-aws-lambda';

puppeteer.use(StealthPlugin());

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { cookies, items } = req.body;
  if (!cookies || !items || !Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }
  let browser;
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const launchOptions = isDev
      ? {
          headless: true,
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      : {
          args: chrome.args,
          defaultViewport: chrome.defaultViewport,
          executablePath: await chrome.executablePath,
          headless: chrome.headless
        };
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    // Extend default navigation and operation timeouts to 60s
    const navTimeout = 60000;
    page.setDefaultNavigationTimeout(navTimeout);
    page.setDefaultTimeout(navTimeout);

    // Parse cookies input (stringified JSON or already array)
    let cookieArrayRaw;
    if (typeof cookies === 'string') {
      try {
        cookieArrayRaw = JSON.parse(cookies);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid cookies JSON' });
      }
    } else if (Array.isArray(cookies)) {
      cookieArrayRaw = cookies;
    } else {
      return res.status(400).json({ success: false, error: 'Cookies must be a JSON array or string' });
    }
    const cookieArray = cookieArrayRaw.map(c => {
      const { sameSite, ...rest } = c;
      return rest;
    });
    await page.setCookie(...cookieArray);
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: navTimeout });

    const results = [];
    for (const { profileUrl, message } of items) {
      try {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        // Click the Message button on profile header, with fallback to text match
        let btn = null;
        try {
          btn = await page.waitForSelector('button[data-control-name="message"], a[data-control-name="message"]', { timeout: 5000 });
        } catch {
          const els = await page.$$('button, a');
          for (const el of els) {
            const txt = (await el.evaluate(e => e.innerText || '')).trim();
            if (/^message\b/i.test(txt) || /^messaggio/i.test(txt)) {
              btn = el;
              break;
            }
          }
        }
        if (!btn) throw new Error('Message button not found');
        await btn.click();
        // Wait for message input (contenteditable) and type message
        // Target contenteditable message input
        const boxSelector = 'div[role="textbox"], [contenteditable="true"]';
        await page.waitForSelector(boxSelector, { timeout: navTimeout });
        await page.focus(boxSelector);
        // Clear existing content
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        // Type message
        await page.keyboard.type(message, { delay: 50 });
        // Click the Send button
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const sendBtn = btns.find(el => /send|invia/i.test(el.innerText));
          if (!sendBtn) throw new Error('Send button not found');
          sendBtn.click();
        });
        results.push({ profileUrl, status: 'sent' });
      } catch (err) {
        console.error(`Error sending to ${profileUrl}:`, err.message);
        results.push({ profileUrl, status: 'error', error: err.message });
      }
    }
    await browser.close();
    return res.status(200).json({ success: true, results });
  } catch (error) {
    if (browser) await browser.close();
    console.error(error);
    return res.status(500).json({ success: false, error: error.message });
  }
}