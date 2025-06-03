import puppeteer from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth'; // Rimosso
import chromium from '@sparticuz/chromium';

// const stealth = StealthPlugin(); // Rimosso
// stealth.enabledEvasions.clear(); // Rimosso
// puppeteer.use(stealth); // Rimosso

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
          console.warn(`Redirected off LinkedIn to ${currentUrl} for profile ${profileUrl}. Taking screenshot.`);
          await page.screenshot({ path: `debug-redirected-${Date.now()}.png` });
          throw new Error('Reindirizzato fuori da LinkedIn');
        }

        // Log the beginning of the body's outerHTML for context
        try {
          const bodyHTMLStart = await page.evaluate(() => document.body && document.body.outerHTML ? document.body.outerHTML.substring(0, 1000) : 'No body element found');
          console.log(`Body HTML Start for ${profileUrl}: ${bodyHTMLStart}`);
        } catch (htmlError) {
          console.log(`Could not get body HTML start for ${profileUrl}:`, htmlError.message);
        }
        
        // Try multiple selectors for the message button
        const messageButtonSelectors = [
          'button[data-control-name="message"]', // Specific
          'a[data-control-name="message"]',       // Specific
          '.pv-top-card-v2-ctas button[data-control-name="message"]', // Common on profile pages
          'button[aria-label*="Message"]', // Case-insensitive contains "Message"
          'button[aria-label*="Messaggio"]', // Italian
          'button[aria-label*="Send message"]',
          'button[aria-label*="Invia messaggio"]',
          '.pv-s-profile-actions--message', // Older selector
          '.message-anywhere-button',       // Another common class
          'button.artdeco-button[aria-label*="message" i]', // More general artdeco button with message in aria-label (i for case-insensitive)
          'a.artdeco-button[aria-label*="message" i]',
          'button.pv-top-card-v2-ctas__message', // Another specific class from some layouts
          'a.message-anywhere-button' // Ensure anchor version is also tried
          // Add other selectors based on future findings
        ];
        
        let messageButton = null;
        let foundBySelector = null;
        for (const selector of messageButtonSelectors) {
          try {
            // console.log(`Trying message button selector: ${selector} for profile ${profileUrl}`);
            // Wait for a short time to see if it appears, visible is important
            await page.waitForSelector(selector, { timeout: 2000, visible: true });
            const button = await page.$(selector);
            if (button) {
              // Additional check if it's truly visible and interactable
              const isActuallyVisible = await button.isIntersectingViewport();
              if(isActuallyVisible){
                console.log(`Found message button with selector: ${selector} for profile ${profileUrl}`);
                messageButton = button;
                foundBySelector = selector;
                break;
              } else {
                // console.log(`Selector ${selector} found but button not intersecting viewport.`);
              }
            }
          } catch (e) {
            // console.log(`Message button selector ${selector} failed or not visible: ${e.message}`);
            continue;
          }
        }
        
        // If no button found with selectors, try searching by text more robustly
        if (!messageButton) {
          console.log(`Message button not found by specific selectors for ${profileUrl}. Attempting text-based search.`);
          try {
            const jsHandle = await page.evaluateHandle(() => {
              const elements = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
              // console.log(`[LinkedIn Page Eval] Checking ${elements.length} elements for message button by text.`);
              let foundBtn = null;
              const keywords = ['message', 'messaggio', 'send message', 'invia messaggio']; 

              for (let i = 0; i < elements.length; i++) {
                  const elem = elements[i];
                  let elemText = '';
                  let ariaLabel = '';

                  // Prefer innerText for visible text, fallback to textContent
                  if (elem.innerText) elemText = elem.innerText.trim().toLowerCase();
                  else if (elem.textContent) elemText = elem.textContent.trim().toLowerCase();
                  
                  if (elem.getAttribute('aria-label')) {
                      ariaLabel = elem.getAttribute('aria-label').trim().toLowerCase();
                  }

                  for (const keyword of keywords) {
                      if (elemText.includes(keyword) || ariaLabel.includes(keyword)) {
                          const rect = elem.getBoundingClientRect();
                          const style = window.getComputedStyle(elem);
                          const isVisible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !elem.disabled;
                          
                          if (isVisible) {
                              console.log(`[LinkedIn Page Eval] Found potential message button by text: '${keyword}' in element with text/aria: '${elemText}' / '${ariaLabel}'`);
                              foundBtn = elem;
                              break; 
                          }
                      }
                  }
                  if (foundBtn) break; 
              }
              return foundBtn;
            });

            const potentialButton = jsHandle.asElement();
            if (potentialButton) {
                // Check if it's truly visible and interactable from Puppeteer's perspective
                if (await potentialButton.isIntersectingViewport()){
                    console.log(`Found message button by text content and it is visible for ${profileUrl}.`);
                    messageButton = potentialButton;
                    foundBySelector = 'text-based search';
                } else {
                    console.log(`Message button found by text content for ${profileUrl}, but not visible/intersecting viewport.`);
                    await potentialButton.dispose(); // Clean up handle
                }
            } else {
                console.log(`Message button not found by text content for ${profileUrl}.`);
            }
            await jsHandle.dispose(); // Always dispose the JSHandle

          } catch (e) {
            console.log(`Text search for message button failed for ${profileUrl}:`, e.message);
            messageButton = null; 
          }
        }
        
        if (!messageButton) {
          console.error(`Pulsante messaggio non trovato per ${profileUrl} dopo tutti i tentativi. Screenshotting...`);
          try {
            await page.screenshot({ path: `debug-no-message-button-${Date.now()}-${profileUrl.split('/').pop()}.png` });
          } catch (screenshotError) {
            console.log(`Screenshot failed for no-message-button on ${profileUrl}:`, screenshotError.message);
          }
          throw new Error('Pulsante messaggio non trovato');
        }
        
        console.log(`Clicking message button (found by: ${foundBySelector}) for ${profileUrl}...`);
        
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
          let foundTextboxSelector = null;
          for (const selector of messagingSelectors) {
            try {
              await page.waitForSelector(selector, { timeout: 5000, visible: true });
              const element = await page.$(selector);
              if (element) {
                console.log(`Found messaging textbox with: ${selector}`);
                textbox = element;
                foundTextboxSelector = selector;
                break;
              }
            } catch (e) {
              // console.log(`Messaging textbox selector ${selector} not found or not visible.`);
              continue;
            }
          }
          
          if (textbox) {
            console.log(`Attempting to click textbox found by: ${foundTextboxSelector}`);
            await textbox.click();
            await page.waitForTimeout(500);
            console.log('Typing message on messaging page...');
            await textbox.type(message, { delay: 50 });
            
            // Find send button on messaging page
            const sendBtnSelectors = ['button[data-control-name="send"]', '.msg-form__send-button'];
            let sendBtn = null;
            for (const sel of sendBtnSelectors) {
                sendBtn = await page.$(sel);
                if (sendBtn) {
                    console.log(`Found send button on messaging page with selector: ${sel}`);
                    break;
                }
            }

            if (sendBtn) {
              console.log('Attempting to click send button on messaging page...');
              await sendBtn.click();
              await page.waitForTimeout(2000);
              results.push({ profileUrl, status: 'sent' });
              console.log(`Message sent to ${profileUrl} via messaging page.`);
              continue;
            } else {
              console.error('Send button not found on messaging page.');
              throw new Error('Pulsante di invio non trovato nella pagina di messaggistica');
            }
          } else {
            console.error('Textbox not found on messaging page.');
            throw new Error('Campo di testo non trovato nella pagina di messaggistica');
          }
        }
        
        // If not redirected or textbox not found on messaging page, try original modal approach
        let textbox = null; // Riscopri textbox per il modale
        let foundModalTextboxSelector = null;
        
        // Check for modal first
        const modalExists = await page.evaluate(() => !!document.querySelector('.msg-overlay, .artdeco-modal, [role="dialog"]'));
        if (!modalExists) {
          console.log('No modal found, taking screenshot for debugging...');
          try {
            await page.screenshot({ path: `debug-no-modal-${Date.now()}.png` });
          } catch (e) {
            console.log('Screenshot failed for no-modal.');
          }
          throw new Error('Modal di messaggio non si è aperto o non è stato trovato');
        }
        console.log('Modal detected. Proceeding with modal textbox search.');
        
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
        
        for (let idx = 0; idx < textboxSelectors.length; idx++) {
          const selector = textboxSelectors[idx];
          try {
            // console.log(`Trying modal textbox selector ${idx + 1}/${textboxSelectors.length}: ${selector}`);
            // waitForSelector con visible: true è cruciale per elementi interattivi
            await page.waitForSelector(selector, { timeout: 2000, visible: true }); 
            const elements = await page.$$(selector);
            for (const element of elements) {
              const isActuallyVisible = await element.isIntersectingViewport();
              if (isActuallyVisible) {
                textbox = element;
                foundModalTextboxSelector = selector;
                console.log(`Found visible modal textbox with selector: ${selector}`);
                break;
              }
            }
            if (textbox) break;
          } catch (e) {
            // console.log(`Modal textbox selector ${selector} not found or not visible: ${e.message}`);
            continue;
          }
        }
        
        if (!textbox) {
          console.error(`Modal textbox not found after trying all selectors for profile ${profileUrl}.`);
          await page.screenshot({ path: `debug-no-modal-textbox-${Date.now()}.png` });
          throw new Error('Campo di testo per il messaggio non trovato nel modal');
        }
        
        // Type the message
        console.log(`Attempting to click modal textbox found by: ${foundModalTextboxSelector}`);
        await textbox.click();
        await page.waitForTimeout(500);
        console.log('Typing message in modal...');
        await textbox.type(message, { delay: 50 });
        
        // Find and click send button in modal
        const sendButtonSelectors = ['button[data-control-name="send"]', '.msg-form__send-button', '.msg-send-button'];
        let sendButton = null;
        for (const sel of sendButtonSelectors) {
            sendButton = await page.$(sel);
            if (sendButton) {
                // Verifichiamo che sia visibile e cliccabile
                const isActuallyVisible = await sendButton.isIntersectingViewport();
                if (isActuallyVisible) {
                    console.log(`Found visible modal send button with selector: ${sel}`);
                    break;
                } else {
                    console.log(`Modal send button found with ${sel} but not visible, trying next.`);
                    sendButton = null; // Resetta se non visibile
                }
            }
        }

        if (!sendButton) {
          console.error(`Modal send button not found for profile ${profileUrl}.`);
          await page.screenshot({ path: `debug-no-modal-send-button-${Date.now()}.png` });
          throw new Error('Pulsante di invio non trovato nel modal');
        }
        
        console.log('Attempting to click modal send button...');
        await sendButton.click();
        await page.waitForTimeout(3000);
        
        results.push({ profileUrl, status: 'sent' });
        console.log(`Message sent to ${profileUrl} via modal.`);
        
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