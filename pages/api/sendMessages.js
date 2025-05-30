import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';

// Specifica un set ridotto di evasioni
const stealth = StealthPlugin({
  enabledEvasions: new Set([
    // 'contentWindow', // Rimosso
    // 'iframe.contentWindow', // Rimosso
    // 'media.codecs', // Rimuoviamo anche questa
    'navigator.hardwareConcurrency',
    'navigator.languages',
    'navigator.permissions',
    'navigator.plugins',
    'navigator.webdriver',
    'sourceurl',
    'user-agent-override',
    'webgl.vendor',
    'window.outerdimensions'
  ])
});
puppeteer.use(stealth);

export const config = {
  maxDuration: 60,
};

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
          headless: false,
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      : {
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless
        };

    if (!isDev && !(await chromium.executablePath())) {
      console.error('chromium.executablePath is not available on Vercel! It should not happen with @sparticuz/chromium');
      return res.status(500).json({ success: false, error: 'Chromium not available on Vercel' });
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1200, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    
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
    
    const results = [];
    
    for (const { profileUrl, message } of items) {
      try {
        console.log(`\n=== Processing profile: ${profileUrl} ===`);
        
        // Check if page is still active
        try {
          await page.evaluate(() => document.title);
        } catch (e) {
          console.log('Page session lost, creating new page...');
          await page.close();
          page = await browser.newPage();
          await page.setViewport({ width: 1200, height: 800 });
          await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
          await page.setCookie(...cookieArray);
        }
        
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // Wait for page to load
        await page.waitForTimeout(3000);
        
        // Verify we're still on LinkedIn
        const currentUrl = page.url();
        if (!currentUrl.includes('linkedin.com')) {
          throw new Error('Reindirizzato fuori da LinkedIn');
        }
        
        // Try multiple selectors for the message button
        const messageButtonSelectors = [
          'button[data-control-name="message"]',
          'a[data-control-name="message"]',
          'button[aria-label*="Message"]',
          'button[aria-label*="Messaggio"]',
          'button[aria-label*="Send message"]',
          'button[aria-label*="Invia messaggio"]',
          '.pv-s-profile-actions--message',
          '.message-anywhere-button',
          '.pv-top-card-v2-ctas button[data-control-name="message"]'
        ];
        
        let messageButton = null;
        for (const selector of messageButtonSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            messageButton = await page.$(selector);
            if (messageButton) {
              console.log(`Found message button with selector: ${selector}`);
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        // If no button found with selectors, try searching by text
        if (!messageButton) {
          try {
            messageButton = await page.evaluateHandle(() => {
              const buttons = Array.from(document.querySelectorAll('button, a'));
              return buttons.find(btn => {
                const text = btn.textContent?.toLowerCase() || '';
                return text.includes('message') || text.includes('messaggio');
              });
            });
            
            // Verify the handle is valid
            if (messageButton && !(await messageButton.evaluate(el => el !== null))) {
              messageButton = null;
            }
          } catch (e) {
            console.log('Text search for message button failed:', e.message);
            messageButton = null;
          }
        }
        
        if (!messageButton) {
          throw new Error('Pulsante messaggio non trovato');
        }
        
        console.log('Clicking message button...');
        
        // Check page before clicking
        try {
          await page.evaluate(() => document.title);
        } catch (e) {
          throw new Error('Sessione pagina persa prima del click');
        }
        
        await messageButton.click();
        
        // Wait for message modal/window to open
        console.log('Waiting for modal to open...');
        await page.waitForTimeout(5000); // Ridotto da 8 a 5 secondi
        
        // Check if page is still active after click
        let newUrl;
        try {
          newUrl = page.url();
          await page.evaluate(() => document.title);
        } catch (e) {
          throw new Error('Sessione pagina persa dopo il click del pulsante messaggio');
        }
        
        console.log(`URL after click: ${newUrl}`);
        
        // If redirected to messaging page
        if (newUrl.includes('/messaging/')) {
          console.log('Redirected to messaging page');
          
          // Wait for messaging page to load
          await page.waitForTimeout(3000);
          
          // Look for compose area on messaging page
          const messagingSelectors = [
            '.msg-form__contenteditable',
            '.msg-form__msg-content-container [contenteditable="true"]',
            '.compose-publisher [contenteditable="true"]',
            '[data-control-name="compose_message"] [contenteditable="true"]'
          ];
          
          let textbox = null;
          for (const selector of messagingSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000 });
              const element = await page.$(selector);
              if (element) {
                const isVisible = await element.evaluate(el => {
                  const rect = el.getBoundingClientRect();
                  return rect.width > 0 && rect.height > 0;
                });
                if (isVisible) {
                  console.log(`Found messaging textbox with: ${selector}`);
                  textbox = element;
                  break;
                }
              }
            } catch (e) {
              continue;
            }
          }
          
          if (textbox) {
            // Type message on messaging page
            await textbox.click();
            await page.waitForTimeout(500);
            await textbox.type(message, { delay: 50 });
            
            // Find send button on messaging page
            const sendBtn = await page.$('button[data-control-name="send"], .msg-form__send-button');
            if (sendBtn) {
              await sendBtn.click();
              await page.waitForTimeout(2000);
              results.push({ profileUrl, status: 'sent' });
              continue;
            }
          }
        }
        
        // If not redirected or textbox not found on messaging page, try original approach
        let textbox = null;
        
        // Check for modal first
        const modalExists = await page.$('.msg-overlay, .artdeco-modal, [role="dialog"]');
        if (!modalExists) {
          console.log('No modal found, taking screenshot for debugging...');
          try {
            await page.screenshot({ path: `debug-no-modal-${Date.now()}.png` });
          } catch (e) {
            console.log('Screenshot failed');
          }
          throw new Error('Modal di messaggio non si è aperto');
        }
        
        // Rest of the original textbox search logic...
        const textboxSelectors = [
          'div[role="textbox"][contenteditable="true"]',
          '[contenteditable="true"][role="textbox"]',
          '.msg-form__contenteditable',
          'div[contenteditable="true"]',
          '.msg-form__msg-content-container div[contenteditable="true"]',
          '.msg-form__msg-content-container [contenteditable="true"]',
          '.msg-overlay-conversation-bubble [contenteditable="true"]',
          '.msg-overlay .msg-form [contenteditable="true"]'
        ];
        
        console.log('Searching for message textbox in modal...');
        
        for (let i = 0; i < textboxSelectors.length; i++) {
          const selector = textboxSelectors[i];
          try {
            console.log(`Trying textbox selector ${i+1}/${textboxSelectors.length}: ${selector}`);
            await page.waitForSelector(selector, { timeout: 3000 });
            
            const elements = await page.$$(selector);
            for (const element of elements) {
              try {
                const isVisible = await element.evaluate(el => {
                  const rect = el.getBoundingClientRect();
                  const style = window.getComputedStyle(el);
                  return rect.width > 0 && 
                         rect.height > 0 && 
                         style.visibility !== 'hidden' && 
                         style.display !== 'none' &&
                         !el.disabled;
                });
                
                if (isVisible) {
                  textbox = element;
                  console.log(`Found visible textbox with selector: ${selector}`);
                  break;
                }
              } catch (e) {
                console.log(`Element evaluation failed: ${e.message}`);
                continue;
              }
            }
            
            if (textbox) break;
            
          } catch (e) {
            console.log(`Selector ${selector} failed: ${e.message}`);
            continue;
          }
        }
        
        if (!textbox) {
          throw new Error('Campo di testo per il messaggio non trovato nel modal');
        }
        
        // Type the message
        console.log('Typing message...');
        await textbox.click();
        await page.waitForTimeout(500);
        await textbox.type(message, { delay: 50 });
        
        // Find and click send button
        const sendButton = await page.$('button[data-control-name="send"], .msg-form__send-button');
        if (!sendButton) {
          throw new Error('Pulsante di invio non trovato');
        }
        
        await sendButton.click();
        await page.waitForTimeout(3000);
        
        results.push({ profileUrl, status: 'sent' });
        
      } catch (err) {
        console.error(`Error sending to ${profileUrl}:`, err.message);
        results.push({ profileUrl, status: 'error', error: err.message });
        
        // Try to take a screenshot for debugging
        try {
          await page.screenshot({ path: `debug-error-${Date.now()}.png` });
        } catch (e) {
          console.log('Screenshot failed');
        }
      }
    }
    
    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Error processing request:', err.message);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}