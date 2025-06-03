import puppeteer from 'puppeteer-extra';
import chromium from '@sparticuz/chromium';
import OpenAI from 'openai';

export const config = {
  maxDuration: 60, // Vercel Hobby tier max duration
};

// Helper function for random delays
const randomDelay = (min = 500, max = 1500) => Math.floor(Math.random() * (max - min + 1)) + min;

export default async function handler(req, res) {
  console.log(`[${new Date().toISOString()}] Received request for /api/previewMessages. Method: ${req.method}, URL: ${req.url}`);

  if (req.method !== 'POST') {
    console.warn(`[${new Date().toISOString()}] Method Not Allowed: ${req.method} for /api/previewMessages. Allowed: POST.`);
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { cookies, criteria, template, profileUrl } = req.body;
  if (!cookies || !template || (!criteria && !profileUrl)) {
    return res.status(400).json({ success: false, error: 'Missing required parameters: cookies, template, and criteria or profileUrl' });
  }

  let browser;
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const launchOptions = isDev
      ? {
          headless: false,
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
      : {
          args: chromium.args,
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(), 
          headless: chromium.headless
        };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    page.setDefaultNavigationTimeout(45000); // 45s per navigazione
    page.setDefaultTimeout(30000); // 30s per altre operazioni

    let cookieArrayRaw;
    if (typeof cookies === 'string') {
      try { cookieArrayRaw = JSON.parse(cookies); } catch (e) { return res.status(400).json({ success: false, error: 'Invalid cookies JSON' }); }
    } else if (Array.isArray(cookies)) {
      cookieArrayRaw = cookies;
    } else { return res.status(400).json({ success: false, error: 'Cookies must be a JSON array or string' }); }
    
    const cookieArray = cookieArrayRaw.map(c => {
      const { sameSite, ...rest } = c;
      if (sameSite && !['Lax', 'Strict', 'None'].includes(c.sameSite)) {
        rest.sameSite = 'None'; 
      }
      return rest;
    });
    await page.setCookie(...cookieArray);
    console.log('[Preview API] Cookies set.');

    // Controllo sessione iniziale
    console.log('[Preview API] Checking LinkedIn session status by navigating to feed...');
    await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 40000 });
    let currentUrl = page.url();
    console.log(`[Preview API] Current URL after navigating to feed: ${currentUrl}`);

    if (!currentUrl.includes('linkedin.com/feed')) {
      if (currentUrl.includes('login') || currentUrl.includes('checkpoint') || currentUrl.includes('challenge')) {
        console.error('[Preview API] LinkedIn session is invalid or requires verification. Please update cookies.');
        await browser.close();
        return res.status(401).json({ success: false, error: 'LinkedIn session invalid. Please re-login and update cookies.' });
      }
      console.warn(`[Preview API] Navigated to feed, but URL is ${currentUrl}. Session might be unstable.`);
    }
    console.log('[Preview API] Initial LinkedIn session check passed or warning issued.');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const results = [];

    const extractProfileData = async (page, targetUrl) => {
      console.log(`[Preview API] Extracting data from ${targetUrl}. Current page URL: ${page.url()}`);
      if (!page.url().includes('linkedin.com/in/') && !page.url().includes('linkedin.com/search')){
          if(page.url().includes('login') || page.url().includes('checkpoint')){
              console.error(`[Preview API] Looks like session expired before extracting profile data. Current URL: ${page.url()}`);
              throw new Error('LinkedIn session expired before profile data extraction.');
          }
      }
      await page.waitForTimeout(randomDelay(1000, 2000));
      // ... (la tua logica extractProfileData esistente, assicurati che sia robusta ai cambiamenti UI)
      // Per brevità, non la includo qui ma va adattata come abbiamo fatto per sendMessages
      // Aggiungere log dettagliati dentro extractProfileData e extractJobExperience
      console.log(`[Preview API] Attempting to extract profile data for ${targetUrl}`);
      const profileData = await page.evaluate(() => {
        const selectText = (selectors) => {
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.innerText) { const txt = el.innerText.trim(); if (txt) return txt; }
          } return '';
        };
        const name = selectText(['h1', '.text-heading-xlarge', '.pv-text-details__left-panel h1']);
        const headline = selectText(['.text-body-medium.break-words', '.pv-text-details__left-panel div:nth-child(2) > div']);
        const location = selectText(['.text-body-small.inline.t-black--light', '.pv-text-details__left-panel div:nth-child(3) > span']);
        return { name, headline, location, profileSummary: 'Summary placeholder', skills: ['Skill placeholder'], jobTitle: 'Job placeholder', companyName: 'Company placeholder' };
      });
      console.log(`[Preview API] Extracted basic data for ${targetUrl}: Name - ${profileData.name}`);
      return profileData;
    };

    const extractJobExperience = async (page, targetUrl) => { 
        console.log(`[Preview API] Attempting to extract job experience for ${targetUrl}`);
        return { jobs: [{ title: 'Job exp placeholder', company: 'Company exp placeholder'}] };
    };

    if (profileUrl) { // Single profile preview
      console.log(`[Preview API] Processing single profile: ${profileUrl}`);
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(randomDelay(3000, 5000));
      currentUrl = page.url();
      console.log(`[Preview API] Current URL after navigating to single profile ${profileUrl}: ${currentUrl}`);
      if (!currentUrl.includes(profileUrl.split('linkedin.com')[1])) {
        if (currentUrl.includes('login') || currentUrl.includes('checkpoint')){
            throw new Error('LinkedIn session lost or requires verification for single profile.');
        }
        console.warn(`[Preview API] URL mismatch for single profile. Expected ${profileUrl}, got ${currentUrl}`);
        // Non lanciare errore qui, lascia che extractProfileData tenti, potrebbe essere un URL valido alternativo
      }

      const pData = await extractProfileData(page, profileUrl);
      const jInfo = await extractJobExperience(page, profileUrl);
      const finalProfile = { ...pData, ...jInfo };
      // ... (la tua logica di generazione messaggio OpenAI esistente)
      const message = `Generated message for ${finalProfile.name || 'profile'}`;
      results.push({ profileUrl, profileData: finalProfile, message });
    } else { // Batch preview from criteria
      console.log(`[Preview API] Processing batch from criteria: ${criteria}`);
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(criteria)}&origin=GLOBAL_SEARCH_HEADER`;
      console.log(`[Preview API] Navigating to search URL: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await page.waitForTimeout(randomDelay(3000, 5000));
      currentUrl = page.url();
      console.log(`[Preview API] Current URL after search: ${currentUrl}`);
      if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
          throw new Error('LinkedIn session lost during search. Please update cookies.');
      }

      console.log('[Preview API] Extracting profile URLs from search results...');
      const profileUrls = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a.app-aware-link[href*="/in/"]'));
        const urls = anchors.map(a => a.href.split('?')[0]).filter(href => !href.includes('/search/'));
        return [...new Set(urls)].slice(0, 3); // Limita a 3 per l'anteprima
      });
      console.log(`[Preview API] Found ${profileUrls.length} profile URLs for batch preview.`);

      for (const url of profileUrls) {
        console.log(`[Preview API] Processing profile from batch: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
        await page.waitForTimeout(randomDelay(3000, 5000));
        currentUrl = page.url();
        console.log(`[Preview API] Current URL after navigating to batch profile ${url}: ${currentUrl}`);
        if (!currentUrl.includes(url.split('linkedin.com')[1])){
            if (currentUrl.includes('login') || currentUrl.includes('checkpoint')){
                console.warn(`[Preview API] Session lost before processing batch profile ${url}. Skipping.`);
                results.push({ profileUrl: url, profileData: { name: 'Sessione Scaduta', headline: '-'}, message: 'Impossibile caricare: sessione scaduta.'});
                continue; // Salta questo profilo e prova con il prossimo
            }
            console.warn(`[Preview API] URL mismatch for batch profile ${url}. Expected similar to ${url}, got ${currentUrl}.`);
        }

        try {
            const pData = await extractProfileData(page, url);
            const jInfo = await extractJobExperience(page, url);
            const finalProfile = { ...pData, ...jInfo };
            // ... (la tua logica di generazione messaggio OpenAI esistente)
            const message = `Generated message for ${finalProfile.name || 'profile'}`;
            results.push({ profileUrl: url, profileData: finalProfile, message });
        } catch (profileError) {
            console.error(`[Preview API] Error processing profile ${url} from batch: ${profileError.message}`);
            results.push({ profileUrl: url, profileData: { name: 'Errore Caricamento Profilo', headline: '-' }, message: 'Impossibile generare messaggio.', error: profileError.message });
             if (profileError.message.includes('LinkedIn session expired')) {
                console.error('[Preview API] Aborting batch due to confirmed session loss during profile extraction.');
                throw profileError; // Rilancia per interrompere tutto il processo di preview.
            }
        }
        await page.waitForTimeout(randomDelay(1000,2000)); // Pausa tra un profilo e l'altro nel batch
      }
    }
    
    console.log('[Preview API] All profiles for preview processed.');
    await browser.close();
    return res.status(200).json({ success: true, results });
    
  } catch (error) {
    console.error(`[Preview API] Fatal error: ${error.message}`, error.stack);
    if (browser) {
      try { await browser.close(); } catch (closeError) { console.error("[Preview API] Error closing browser during fatal error handling:", closeError.message); }
    }
    if (!res.headersSent) {
      if (error.message.includes('LinkedIn session invalid') || error.message.includes('LinkedIn session lost') || error.message.includes('LinkedIn session expired')) {
        return res.status(401).json({ success: false, error: 'LinkedIn session lost or invalid. Please update cookies.' });
      }
      return res.status(500).json({ success: false, error: `Internal Server Error in Preview API: ${error.message}` });
    }
  }
}