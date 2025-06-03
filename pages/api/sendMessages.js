import puppeteer from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth'; // Rimosso
import chromium from '@sparticuz/chromium';

// const stealth = StealthPlugin(); // Rimosso
// stealth.enabledEvasions.clear(); // Rimosso
// puppeteer.use(stealth); // Rimosso

export const config = {
  maxDuration: 60, // Vercel Hobby tier max duration
};

// Helper function for random delays
const randomDelay = (min = 500, max = 1500) => Math.floor(Math.random() * (max - min + 1)) + min;

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
          headless: false, // Per debug locale, impostare a false per vedere il browser
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
          headless: chromium.headless // chromium.headless è true per Vercel
        };

    browser = await puppeteer.launch(launchOptions);
    let page = await browser.newPage(); // `page` potrebbe essere ricreata
    
    await page.setViewport({ width: 1280, height: 800 }); // Un viewport comune
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    page.setDefaultNavigationTimeout(60000); // 60 secondi
    page.setDefaultTimeout(30000); // 30 secondi per altre operazioni
    
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
      // 'lax', 'strict', 'none' sono i valori validi per sameSite
      if (sameSite && !['Lax', 'Strict', 'None'].includes(c.sameSite)) {
        rest.sameSite = 'None'; // Default o rimuovi se invalido. Puppeteer potrebbe gestirlo.
      }
      return rest;
    });
    await page.setCookie(...cookieArray);
    console.log('Cookies set.');
    
    const results = [];

    // Controllo sessione iniziale prima del loop
    console.log('Checking initial LinkedIn session status by navigating to feed...');
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 45000 });
    let currentUrl = page.url();
    console.log(`Current URL after navigating to feed: ${currentUrl}`);

    if (!currentUrl.includes('linkedin.com/feed')) {
        if (currentUrl.includes('login') || currentUrl.includes('checkpoint') || currentUrl.includes('challenge')) {
            console.error('LinkedIn session is invalid or requires verification. Please update cookies.');
            await browser.close();
            return res.status(401).json({ success: false, error: 'LinkedIn session invalid. Please re-login and update cookies.', results });
        } else {
            console.warn(`Navigated to feed, but URL is ${currentUrl}. Proceeding with caution, but session might be unstable.`);
            // Potrebbe essere una pagina intermedia di LinkedIn, non necessariamente un errore di sessione grave
        }
    }
    console.log('Initial LinkedIn session check passed or warning issued.');

    for (let i = 0; i < items.length; i++) {
      const { profileUrl, message } = items[i];
      try {
        console.log(`\n=== Processing profile ${i + 1}/${items.length}: ${profileUrl} ===`);
        
        // Controllo sessione prima di ogni profilo (opzionale se il controllo iniziale è sufficiente)
        // Potrebbe essere troppo aggressivo, valutare se necessario
        /*
        if (i > 0) { // Non al primo giro
            console.log(`Re-checking session by visiting feed before profile ${profileUrl}`);
            await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 45000 });
            currentUrl = page.url();
            if (!currentUrl.includes('linkedin.com/feed')) {
                console.error(`Session lost before processing ${profileUrl}. Current URL: ${currentUrl}`);
                throw new Error('LinkedIn session lost. Please re-login and update cookies.');
            }
            console.log(`Session still active. Proceeding to ${profileUrl}`);
        }
        */

        console.log(`Navigating to profile: ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(randomDelay(4000, 7000)); // Pausa più lunga e variabile
        
        currentUrl = page.url();
        console.log(`Current URL after navigating to profile ${profileUrl}: ${currentUrl}`);
        if (!currentUrl.includes(profileUrl.split('linkedin.com')[1])) { // Verifica se siamo ancora sul profilo o reindirizzati
            if (currentUrl.includes('login') || currentUrl.includes('checkpoint') || currentUrl.includes('challenge')) {
                console.error(`Redirected to login/checkpoint page for profile ${profileUrl}. Session likely lost.`);
                throw new Error('LinkedIn session lost or requires verification. Please update cookies.');
            }
            console.warn(`URL mismatch for profile ${profileUrl}. Expected to contain ${profileUrl.split('linkedin.com')[1]}, but got ${currentUrl}. Taking screenshot.`);
            // await page.screenshot({ path: `debug-url-mismatch-${Date.now()}-${profileUrl.split('/').pop()}.png` });
            // Non necessariamente un errore fatale, ma sospetto
        }

        // Log the beginning of the body's outerHTML for context
        try {
          const bodyHTMLStart = await page.evaluate(() => document.body && document.body.outerHTML ? document.body.outerHTML.substring(0, 500) : 'No body element found or body is null');
          console.log(`Body HTML Start for ${profileUrl} (first 500 chars): ${bodyHTMLStart}`);
        } catch (htmlError) {
          console.warn(`Could not get body HTML start for ${profileUrl}:`, htmlError.message);
        }
        
        const messageButtonSelectors = [
          'button[data-control-name="message"]',
          'a[data-control-name="message"]',
          '.pv-top-card-v2-ctas button[data-control-name="message"]',
          'button[aria-label*="Message"]', 
          'button[aria-label*="Messaggio"]', 
          'button[aria-label*="Send message"]',
          'button[aria-label*="Invia messaggio"]',
          '.pv-s-profile-actions--message',
          '.message-anywhere-button',
          'button.artdeco-button[aria-label*="message" i]',
          'a.artdeco-button[aria-label*="message" i]',
          'button.pv-top-card-v2-ctas__message',
          'a.message-anywhere-button'
        ];
        
        let messageButton = null;
        let foundBySelector = null;
        console.log(`Searching for message button for ${profileUrl}...`);
        for (const selector of messageButtonSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 2500, visible: true }); // Aumentato leggermente timeout
            const button = await page.$(selector);
            if (button) {
              const isActuallyVisible = await button.isIntersectingViewport();
              if(isActuallyVisible){
                console.log(`Found message button with selector: ${selector} for ${profileUrl}`);
                messageButton = button;
                foundBySelector = selector;
                break;
              } 
            }
          } catch (e) {
            continue;
          }
        }
        
        if (!messageButton) {
          console.log(`Message button not found by specific selectors for ${profileUrl}. Attempting text-based search.`);
          try {
            const jsHandle = await page.evaluateHandle(() => {
              const elements = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
              let foundBtn = null;
              const keywords = ['message', 'messaggio', 'send message', 'invia messaggio']; 
              for (const elem of elements) {
                  let elemText = (elem.innerText || elem.textContent || '').trim().toLowerCase();
                  let ariaLabel = (elem.getAttribute('aria-label') || '').trim().toLowerCase();
                  for (const keyword of keywords) {
                      if (elemText.includes(keyword) || ariaLabel.includes(keyword)) {
                          const rect = elem.getBoundingClientRect();
                          const style = window.getComputedStyle(elem);
                          if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !elem.disabled) {
                              console.log(`[LinkedIn Page Eval] Potential message button by text: '${keyword}' in element: ${elem.outerHTML.substring(0,100)}`);
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
            if (potentialButton && (await potentialButton.isIntersectingViewport())){
                console.log(`Found message button by text content (visible) for ${profileUrl}.`);
                messageButton = potentialButton;
                foundBySelector = 'text-based search';
            } else {
                if(potentialButton) await potentialButton.dispose();
                console.log(`Message button by text content not found or not visible for ${profileUrl}.`);
            }
            await jsHandle.dispose();
          } catch (e) {
            console.error(`Text search for message button failed for ${profileUrl}:`, e.message);
          }
        }
        
        if (!messageButton) {
          console.error(`Pulsante messaggio non trovato per ${profileUrl} dopo tutti i tentativi. URL: ${page.url()}`);
          // await page.screenshot({ path: `debug-no-message-button-${Date.now()}-${profileUrl.split('/').pop()}.png` });
          throw new Error(`Pulsante messaggio non trovato per ${profileUrl}`);
        }
        
        console.log(`Clicking message button (found by: ${foundBySelector}) for ${profileUrl}...`);
        await page.waitForTimeout(randomDelay());
        await messageButton.click();
        
        console.log(`Waiting for modal/messaging page to open after clicking message button for ${profileUrl}... Current URL: ${page.url()}`);
        await page.waitForTimeout(randomDelay(4000,6000)); 
        
        currentUrl = page.url(); // Aggiorna URL dopo il click
        console.log(`URL after clicking message button for ${profileUrl}: ${currentUrl}`);
        
        // Scenario 1: Redirected to a dedicated messaging page (e.g., /messaging/thread/...)
        if (currentUrl.includes('/messaging/thread/') || currentUrl.includes('/inbox/thread/')) {
          console.log(`Redirected to messaging page: ${currentUrl} for ${profileUrl}.`);
          await page.waitForTimeout(randomDelay(2000,4000));

          const messagingSelectors = [
            '.msg-form__contenteditable[role="textbox"]', // Main LinkedIn messaging textbox
            'div[aria-label*="Write a message"][contenteditable="true"]', // Common aria-label
            '[data-control-name="compose_message"] [contenteditable="true"]' // Fallback
          ];
          let textbox = null;
          for (const selector of messagingSelectors) {
            try {
              await page.waitForSelector(selector, { visible: true, timeout: 7000 });
              textbox = await page.$(selector);
              if (textbox && await textbox.isIntersectingViewport()) {
                console.log(`Found textbox on messaging page with selector: ${selector}`);
                break;
              }
              textbox = null;
            } catch (e) { continue; }
          }

          if (!textbox) {
            console.error(`Textbox not found on dedicated messaging page ${currentUrl} for ${profileUrl}.`);
            // await page.screenshot({ path: `debug-no-textbox-messaging-page-${Date.now()}.png`});
            throw new Error('Textbox non trovata sulla pagina di messaggistica dedicata.');
          }

          console.log('Typing message on dedicated messaging page...');
          await textbox.click({delay: randomDelay(100,300)});
          await page.waitForTimeout(randomDelay());
          await textbox.type(message, { delay: randomDelay(80,150) });
          await page.waitForTimeout(randomDelay());

          const sendBtnSelectors = [
            'button[data-control-name="send"]', 
            '.msg-form__send-button', 
            'button[type="submit"].msg-form__send-button' // More specific
          ];
          let sendBtn = null;
          for (const sel of sendBtnSelectors) {
            try {
                await page.waitForSelector(sel, {visible: true, timeout: 5000});
                sendBtn = await page.$(sel);
                if (sendBtn && await sendBtn.isIntersectingViewport()) {
                    console.log(`Found send button on messaging page with selector: ${sel}`);
                    break;
                }
                sendBtn = null;
            } catch(e){ continue; }
          }

          if (!sendBtn) {
            console.error(`Send button not found on dedicated messaging page ${currentUrl} for ${profileUrl}.`);
            // await page.screenshot({ path: `debug-no-sendbtn-messaging-page-${Date.now()}.png`});
            throw new Error('Pulsante di invio non trovato sulla pagina di messaggistica dedicata.');
          }
          console.log('Clicking send button on messaging page...');
          await sendBtn.click({delay: randomDelay(100,300)});
          await page.waitForTimeout(randomDelay(2000,3000));
          results.push({ profileUrl, status: 'sent' });
          console.log(`Message sent to ${profileUrl} via dedicated messaging page.`);
          continue; // Prossimo profilo nel loop for
        }
        
        // Scenario 2: Message modal/overlay on the profile page
        console.log(`No redirect to messaging page detected. Looking for message modal on ${currentUrl} for ${profileUrl}.`);
        await page.waitForTimeout(randomDelay(1000,2000)); // Breve attesa per il modale

        const modalTextboxSelectors = [
          '.msg-form__contenteditable[role="textbox"]', // Preferito per il modale
          'div[role="dialog"] div[role="textbox"][contenteditable="true"]', // Dentro un dialogo
          '.msg-overlay-conversation-bubble__content-text[contenteditable="true"]', // Un altro tipo di modale
          '[data-testid="conversation-compose-box"] [contenteditable="true"]'
        ];
        let modalTextbox = null;
        for (const selector of modalTextboxSelectors) {
          try {
            await page.waitForSelector(selector, { visible: true, timeout: 7000 });
            modalTextbox = await page.$(selector);
            if (modalTextbox && await modalTextbox.isIntersectingViewport()) {
              console.log(`Found textbox in modal with selector: ${selector}`);
              break;
            }
            modalTextbox = null;
          } catch (e) { continue; }
        }

        if (!modalTextbox) {
          console.error(`Modal textbox not found on ${currentUrl} for ${profileUrl}.`);
          // await page.screenshot({ path: `debug-no-modal-textbox-${Date.now()}-${profileUrl.split('/').pop()}.png` });
          throw new Error('Campo di testo per il messaggio non trovato nel modal.');
        }
        
        console.log('Typing message in modal...');
        await modalTextbox.click({delay: randomDelay(100,300)});
        await page.waitForTimeout(randomDelay());
        await modalTextbox.type(message, { delay: randomDelay(80,150) });
        await page.waitForTimeout(randomDelay());
        
        const modalSendButtonSelectors = [
            'button[data-control-name="send"]', 
            '.msg-form__send-button', 
            'button[type="submit"].msg-form__send-button',
            '[data-testid="send-button"]'
        ];
        let modalSendButton = null;
        for (const sel of modalSendButtonSelectors) {
          try {
            await page.waitForSelector(sel, {visible: true, timeout: 5000});
            modalSendButton = await page.$(sel);
            if (modalSendButton && await modalSendButton.isIntersectingViewport()) {
                console.log(`Found send button in modal with selector: ${sel}`);
                break;
            }
            modalSendButton = null;
           } catch(e){ continue; }
        }

        if (!modalSendButton) {
          console.error(`Modal send button not found on ${currentUrl} for ${profileUrl}.`);
          // await page.screenshot({ path: `debug-no-modal-send-button-${Date.now()}-${profileUrl.split('/').pop()}.png` });
          throw new Error('Pulsante di invio non trovato nel modal.');
        }
        
        console.log('Clicking modal send button...');
        await modalSendButton.click({delay: randomDelay(100,300)});
        await page.waitForTimeout(randomDelay(3000, 5000)); // Attesa più lunga per invio e chiusura modale
        
        results.push({ profileUrl, status: 'sent' });
        console.log(`Message sent to ${profileUrl} via modal.`);
        
      } catch (err) {
        console.error(`Error sending to ${profileUrl}: ${err.message}. Current URL: ${page.url()}`);
        results.push({ profileUrl, status: 'error', error: err.message });
        // Prova a fare uno screenshot per debugging, anche se potrebbe fallire
        /* try {
          const errorProfileName = profileUrl.split('/').pop() || 'unknown-profile';
          await page.screenshot({ path: `debug-error-${Date.now()}-${errorProfileName}.png` });
          console.log(`Screenshot attempted: debug-error-${Date.now()}-${errorProfileName}.png`);
        } catch (screenshotError) {
          console.warn('Screenshot failed during error handling:', screenshotError.message);
        } */
        
        // Decidi se continuare con il prossimo profilo o interrompere.
        // Se l'errore è "LinkedIn session lost", potremmo voler interrompere tutto.
        if (err.message.includes('LinkedIn session lost') || err.message.includes('session invalid')) {
            console.error("Aborting due to session loss.");
            await browser.close();
            return res.status(401).json({ success: false, error: 'LinkedIn session lost or invalid. Please update cookies.', results });
        }
        // Se è un errore per un singolo profilo, continua con il prossimo.
        console.log('Continuing to next profile after error.');
      }
      // Pausa tra un profilo e l'altro per non sovraccaricare LinkedIn
      if (i < items.length - 1) {
          const interProfileDelay = randomDelay(5000, 10000);
          console.log(`Pausing for ${interProfileDelay / 1000}s before next profile...`);
          await page.waitForTimeout(interProfileDelay);
      }
    }
    
    console.log('All profiles processed.');
    await browser.close();
    return res.status(200).json({ success: true, results });
    
  } catch (error) {
    console.error('Fatal error processing sendMessages request:', error.message, error.stack);
    if (browser) {
        try {
            await browser.close();
        } catch (closeError) {
            console.error("Error closing browser during fatal error handling:", closeError.message);
        }
    }
    // Restituisci un errore generico 500 se non è già stato gestito un errore di sessione
    if (!res.headersSent) {
        if (error.message.includes('LinkedIn session lost') || error.message.includes('session invalid')) {
            return res.status(401).json({ success: false, error: 'LinkedIn session lost or invalid. Please update cookies.' });
        }
        return res.status(500).json({ success: false, error: `Internal Server Error: ${error.message}` });
    }
  }
}