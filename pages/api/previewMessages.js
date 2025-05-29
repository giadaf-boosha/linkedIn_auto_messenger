import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';
import OpenAI from 'openai';

// Specifica un set ridotto di evasioni
const stealth = StealthPlugin({
  enabledEvasions: new Set([
    'media.codecs',
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
  const { cookies, criteria, template, profileUrl } = req.body;
  if (!cookies || !template || (!criteria && !profileUrl)) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }
  let browser;
  try {
    const isDev = process.env.NODE_ENV !== 'production';
    const launchOptions = isDev
      ? {
          headless: 'new',
          executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
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
    
    // Riduci i timeout e ottimizza le prestazioni
    const navTimeout = 30000; // Ridotto da 60s a 30s
    page.setDefaultNavigationTimeout(navTimeout);
    page.setDefaultTimeout(navTimeout);
    
    // Ottimizza il caricamento delle pagine
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image'){
        req.abort();
      } else {
        req.continue();
      }
    });

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
    
    // Prova prima ad andare al feed per verificare l'autenticazione
    try {
      await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: navTimeout });
    } catch (error) {
      console.warn('Feed navigation failed, continuing with direct profile access...');
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const results = [];

    // Funzione per lo scrolling ottimizzato
    const optimizedScroll = async (page) => {
      try {
        await page.evaluate(async () => {
          await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 200; // Aumentato per scroll più veloce
            const maxScrolls = 10; // Limite massimo di scroll
            let scrollCount = 0;
            
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;
              scrollCount++;
              
              if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
                clearInterval(timer);
                resolve();
              }
            }, 50); // Ridotto l'intervallo per scroll più veloce
          });
        });
      } catch (error) {
        console.warn('Scroll failed:', error.message);
      }
    };

    // Funzione per estrarre dati profilo in modo più efficiente
    const extractProfileData = async (page, maxRetries = 2) => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          await page.waitForSelector('h1', { timeout: 15000 }); // Timeout ridotto
          
          const profileData = await page.evaluate(() => {
            const selectText = (selectors) => {
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.innerText) {
                  const txt = el.innerText.trim();
                  if (txt) return txt;
                }
              }
              return '';
            };
            
            const selectMultiple = (selector) => {
              const elements = document.querySelectorAll(selector);
              return Array.from(elements).slice(0, 5).map(el => el.innerText.trim()).filter(Boolean);
            };
            
            const name = selectText(['h1.text-heading-xlarge', 'h1.inline.t-24', 'h1']);
            const headline = selectText(['div.text-body-medium', 'h2', 'span.text-body-medium.break-words']);
            const location = selectText(['span.text-body-small.inline.t-black--light', 'span.t-16.t-normal']);
            
            const profileSummary = selectText([
              'section.pv-about-section .pv-about__summary-text',
              'section.pv-about-section p',
              'section[id*="about"] .display-flex p',
              'section[id*="about"]'
            ]);
            
            const skills = selectMultiple('span.pv-skill-category-entity__name-text, span.pv-skill-entity__skill-name-text, li.skill-entity');
            
            // Deriva jobTitle e companyName dall'headline
            let jobTitle = '';
            let companyName = '';
            if (/\bat\b/i.test(headline)) {
              const parts = headline.split(/\bat\b/i);
              jobTitle = (parts[0] || '').trim();
              companyName = (parts[1] || '').trim();
            } else if (headline.includes('@')) {
              const parts = headline.split('@');
              jobTitle = (parts[0] || '').trim();
              companyName = (parts[1] || '').trim();
            }
            
            return { 
              name, 
              headline, 
              location, 
              profileSummary, 
              skills, 
              jobTitle, 
              companyName
            };
          });
          
          return profileData;
        } catch (error) {
          console.warn(`Attempt ${attempt + 1} failed for profile data extraction:`, error.message);
          if (attempt < maxRetries - 1) {
            await page.waitForTimeout(2000);
          }
        }
      }
      return { name: '', headline: '', location: '', profileSummary: '', skills: [], jobTitle: '', companyName: '' };
    };

    // Funzione per estrarre esperienze lavorative in modo più efficiente
    const extractJobExperience = async (page) => {
      try {
        const jobInfo = await page.evaluate(() => {
          const select = el => el ? el.innerText.trim() : '';
          const jobs = [];
          
          let section = document.querySelector('section[id*="experience"]') || document.querySelector('section.experience-section');
          if (!section) {
            const hdr = Array.from(document.querySelectorAll('h2')).find(h => /esperienza|experience/i.test(h.innerText));
            section = hdr ? hdr.closest('section') : null;
          }
          
          if (section) {
            const jobEls = section.querySelectorAll('li.artdeco-list__item, div.pvs-entity, .pv-entity__position-group');
            
            // Limita a massimo 2 esperienze per velocità
            Array.from(jobEls).slice(0, 2).forEach(jobEl => {
              const title = select(jobEl.querySelector('.pv-entity__summary-info h3, .t-bold span, span.mr1.t-bold'));
              const company = select(jobEl.querySelector('.pv-entity__secondary-title, span.t-14.t-normal, .t-black--light span:not(.visually-hidden)'));
              
              if (title || company) {
                jobs.push({ title, company });
              }
            });
          }
          return { jobs };
        });
        
        return jobInfo;
      } catch (error) {
        console.warn('Job extraction failed:', error.message);
        return { jobs: [] };
      }
    };

    if (profileUrl) {
      // Single profile preview con gestione migliorata degli errori
      try {
        await page.goto(profileUrl, { 
          waitUntil: 'domcontentloaded', 
          timeout: navTimeout 
        });
        
        const profileData = await extractProfileData(page);
        const jobInfo = await extractJobExperience(page);
        
        const finalProfile = { ...profileData, ...jobInfo };
        
        // Genera messaggio con OpenAI
        const parts = [`${template}`, 'Profilo:'];
        for (const [key, value] of Object.entries(finalProfile)) {
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          if (Array.isArray(value)) {
            parts.push(`${label}: ${value.join(', ')}`);
          } else {
            parts.push(`${label}: ${value}`);
          }
        }
        
        const systemMessage = `Genera un messaggio di vendita LinkedIn personalizzato. Usa le informazioni specifiche del profilo per personalizzare il template di messaggio fornito. Indirizza il messaggio a ${finalProfile.name || "questa persona"} e personalizzalo in base alle sue esperienze, competenze e background professionale. Il messaggio deve essere caldo, professionale e diretto, con un'apertura che dimostri interesse genuino nel profilo della persona.

CONTESTO IMPORTANTE: Max Brigida è il Founder di IT's Week, l'evento di riferimento per il Tech Made in Italy che si terrà l'11-12 Novembre 2025 a Rimini. IT's Week è la settimana dedicata ai Software Italiani, con oltre 2000 partecipanti, 90+ speakers, 80+ espositori e focus su innovazione, tech e software 100% Made in Italy. Include anche gli Ada Lovelace Awards per celebrare le eccellenze tech italiane.

ISTRUZIONI:
1. Quando appropriato, menziona IT's Week come opportunità di networking e business per professionisti del tech, innovatori e aziende
2. Se il profilo della persona è correlato al tech, software, innovazione o business, suggerisci IT's Week come evento perfetto per loro
3. Usa il fatto che IT's Week rappresenta il meglio del tech italiano per creare connessioni con il background della persona
4. Mantieni il focus sulla personalizzazione basata sul profilo, ma integra naturalmente IT's Week quando rilevante

IMPORTANTE: Termina sempre il messaggio con questa firma:

*Un caro saluto,

Max Brigida
Made in Italy Tech Evangelist
Founder IT's Week & Software Italiani
"L'Italia ha tutto per diventare la Silicon Valley Europea.
IT's Week è qui per dimostrarlo."*`;
        const userPrompt = parts.join('\n');
        
        const response = await openai.chat.completions.create({ 
          model: 'gpt-4o-mini', 
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7
        });
        
        const message = response.choices[0].message.content;
        results.push({ profileUrl, profileData: finalProfile, message });
        
      } catch (error) {
        console.error(`Error with profile ${profileUrl}:`, error.message);
        results.push({ 
          profileUrl, 
          profileData: { name: 'Errore nel caricamento', headline: '', location: '', profileSummary: '', skills: [], jobTitle: '', companyName: '' }, 
          message: 'Impossibile generare il messaggio per questo profilo.',
          error: error.message 
        });
      }
    } else {
      // Batch preview ottimizzato
      try {
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(criteria)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        
        await page.waitForFunction(
          () => document.querySelectorAll('a[href*="/in/"]').length > 0,
          { timeout: 15000 }
        );
        
        // Raccogli URL profili (limitato a 3 per velocità)
        const profileUrls = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/in/"]'));
          const seen = new Set();
          const out = [];
          for (const a of anchors) {
            const url = a.href.split('?')[0];
            if (!seen.has(url)) {
              seen.add(url);
              out.push(url);
            }
            if (out.length >= 3) break; // Ridotto da 5 a 3
          }
          return out;
        });
        
        // Visita ogni profilo con timeout ridotti
        for (const url of profileUrls) {
          try {
            await page.goto(url, { 
              waitUntil: 'domcontentloaded', 
              timeout: 20000 // Timeout ridotto per batch
            });
            
            const profileData = await extractProfileData(page, 1); // Solo 1 tentativo per batch
            const jobInfo = await extractJobExperience(page);
            
            const finalProfile = { ...profileData, ...jobInfo };
            
            const partsArr = [`${template}`, 'Profilo:'];
            for (const [key, value] of Object.entries(finalProfile)) {
              const label = key.charAt(0).toUpperCase() + key.slice(1);
              if (Array.isArray(value)) {
                partsArr.push(`${label}: ${value.join(', ')}`);
              } else {
                partsArr.push(`${label}: ${value}`);
              }
            }
            
            const systemMessageBatch = `Genera un messaggio di vendita LinkedIn personalizzato. Usa le informazioni specifiche del profilo per personalizzare il template di messaggio fornito. Indirizza il messaggio a ${finalProfile.name || "questa persona"} e personalizzalo in base alle sue esperienze, competenze e background professionale. Il messaggio deve essere caldo, professionale e diretto, con un'apertura che dimostri interesse genuino nel profilo della persona.

CONTESTO IMPORTANTE: Max Brigida è il Founder di IT's Week, l'evento di riferimento per il Tech Made in Italy che si terrà l'11-12 Novembre 2025 a Rimini. IT's Week è la settimana dedicata ai Software Italiani, con oltre 2000 partecipanti, 90+ speakers, 80+ espositori e focus su innovazione, tech e software 100% Made in Italy. Include anche gli Ada Lovelace Awards per celebrare le eccellenze tech italiane.

ISTRUZIONI:
1. Quando appropriato, menziona IT's Week come opportunità di networking e business per professionisti del tech, innovatori e aziende
2. Se il profilo della persona è correlato al tech, software, innovazione o business, suggerisci IT's Week come evento perfetto per loro
3. Usa il fatto che IT's Week rappresenta il meglio del tech italiano per creare connessioni con il background della persona
4. Mantieni il focus sulla personalizzazione basata sul profilo, ma integra naturalmente IT's Week quando rilevante

IMPORTANTE: Termina sempre il messaggio con questa firma:

*Un caro saluto,

Max Brigida
Made in Italy Tech Evangelist
Founder IT's Week & Software Italiani
"L'Italia ha tutto per diventare la Silicon Valley Europea.
IT's Week è qui per dimostrarlo."*`;
            const userPromptBatch = partsArr.join('\n');
            
            const resp = await openai.chat.completions.create({ 
              model: 'gpt-4o-mini', 
              messages: [
                { role: 'system', content: systemMessageBatch },
                { role: 'user', content: userPromptBatch }
              ],
              temperature: 0.7
            });
            
            const message = resp.choices[0].message.content;
            results.push({ profileUrl: url, profileData: finalProfile, message });
            
          } catch (err) {
            console.error(`Error previewing ${url}:`, err.message);
            results.push({
              profileUrl: url,
              profileData: { name: 'Errore nel caricamento', headline: '', location: '', profileSummary: '', skills: [], jobTitle: '', companyName: '' },
              message: 'Impossibile generare il messaggio per questo profilo.',
              error: err.message
            });
          }
        }
      } catch (error) {
        console.error('Batch processing error:', error.message);
        return res.status(500).json({ success: false, error: `Errore nella ricerca batch: ${error.message}` });
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