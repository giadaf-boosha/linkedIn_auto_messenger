import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chrome from 'chrome-aws-lambda';
import OpenAI from 'openai';

puppeteer.use(StealthPlugin());

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
    
    // Extend default navigation and operation timeouts to 120s
    const navTimeout = 120000;
    page.setDefaultNavigationTimeout(navTimeout);
    page.setDefaultTimeout(navTimeout);

    // Imposto i timeout a 120s per evitare errori di navigazione
    const navTimeout = 120000;
    page.setDefaultNavigationTimeout(navTimeout);
    page.setDefaultTimeout(navTimeout);

    // Extend default navigation and operation timeouts to 120s
    const navTimeout = 120000;
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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const results = [];

    // Funzione per lo scrolling automatico della pagina per caricare tutto il contenuto
    const autoScroll = async (page) => {
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    };

    if (profileUrl) {
      // Single profile preview: navigate and extract detailed profile info
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      await page.waitForSelector('h1', { timeout: navTimeout });
      // Extract core profile fields
      const profileData = await page.evaluate(() => {
        // helper to select first non-empty text from selectors
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
        const name = selectText(['h1.text-heading-xlarge', 'h1.inline.t-24', 'h1']);
        const headline = selectText(['div.text-body-medium', 'h2', 'span.text-body-medium.break-words']);
        const location = selectText(['span.text-body-small.inline.t-black--light', 'span.t-16.t-normal']);
        const profileSummary = selectText([
          'section.pv-about-section .pv-about__summary-text',
          'section.pv-about-section p',
          'section[id*="about"]'
        ]);
        // extract skills
        const skills = Array.from(
          document.querySelectorAll(
            'span.pv-skill-category-entity__name-text, span.pv-skill-entity__skill-name-text'
          )
        ).map(el => el.innerText.trim()).filter(Boolean);
        // derive jobTitle and companyName from headline if pattern
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
        return { name, headline, location, profileSummary, skills, jobTitle, companyName };
      });

      // Modifico con una versione migliorata che estrae più dati
      await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: navTimeout });
      await page.waitForSelector('h1', { timeout: navTimeout });
      
      // Scorri la pagina per caricare tutti i contenuti
      await autoScroll(page);
      
      // Estrai dati profilo base in modo più completo
      const enhancedProfileData = await page.evaluate(() => {
        // helper to select first non-empty text from selectors
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
          return Array.from(elements).map(el => el.innerText.trim()).filter(Boolean);
        };
        
        const name = selectText(['h1.text-heading-xlarge', 'h1.inline.t-24', 'h1']);
        const headline = selectText(['div.text-body-medium', 'h2', 'span.text-body-medium.break-words']);
        const location = selectText(['span.text-body-small.inline.t-black--light', 'span.t-16.t-normal']);
        
        // Estrai riepilogo profilo più completo
        const profileSummary = selectText([
          'section.pv-about-section .pv-about__summary-text',
          'section.pv-about-section p',
          'section[id*="about"] .display-flex p',
          'section[id*="about"]'
        ]);
        
        // Estrai tutte le competenze
        const skills = Array.from(
          document.querySelectorAll(
            'span.pv-skill-category-entity__name-text, span.pv-skill-entity__skill-name-text, li.skill-entity'
          )
        ).map(el => el.innerText.trim()).filter(Boolean);
        
        // Estrai endorsements e raccomandazioni
        const endorsements = document.querySelector('div.pv-skills-section__endorsement-count') 
          ? document.querySelector('div.pv-skills-section__endorsement-count').innerText 
          : '';
        
        // Numero di connessioni
        const connectionsText = selectText(['.pv-top-card--list .t-black--light', 'span.t-bold:contains("connessioni")']);
        const connections = connectionsText.match(/\d+/) ? connectionsText.match(/\d+/)[0] : '';
        
        // derive jobTitle and companyName from headline if pattern
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
        
        // Estrai lingue conosciute
        const languages = selectMultiple('li.languages__list-item h3, section[id*="languages"] li span.t-bold');
        
        // Estrai interessi
        const interests = selectMultiple('section[id*="interest"] li span.t-bold, .pv-interests-section h3');
        
        // Estrai certificazioni
        const certifications = selectMultiple('section[id*="certifications"] li .t-bold, section[id*="certifications"] .t-bold span');
        
        return { 
          name, 
          headline, 
          location, 
          profileSummary, 
          skills, 
          jobTitle, 
          companyName,
          connections,
          endorsements,
          languages,
          interests,
          certifications
        };
      });
      
      // Estrai tutte le esperienze lavorative in modo dettagliato
      const jobsCollection = await page.evaluate(() => {
        const select = el => el ? el.innerText.trim() : '';
        const jobs = [];
        
        // Cerca la sezione delle esperienze
        let section = document.querySelector('section[id*="experience"]') || document.querySelector('section.experience-section');
        if (!section) {
          const hdr = Array.from(document.querySelectorAll('h2')).find(h => /esperienza|experience/i.test(h.innerText));
          section = hdr ? hdr.closest('section') : null;
        }
        
        if (section) {
          // Seleziona tutte le esperienze lavorative
          const jobEls = section.querySelectorAll('li.artdeco-list__item, div.pvs-entity, .pv-entity__position-group');
          
          // Estrai informazioni per ciascuna esperienza (limita a 3 per prestazioni)
          Array.from(jobEls).slice(0, 3).forEach(jobEl => {
            let title = select(jobEl.querySelector('.pv-entity__summary-info h3, .t-bold span, span.mr1.t-bold'));
            let company = select(jobEl.querySelector('.pv-entity__secondary-title, span.t-14.t-normal, .t-black--light span:not(.visually-hidden)'));
            
            // Estrai URL azienda
            const companyUrl = jobEl.querySelector('a[href*="/company/"]')?.href || '';
            
            // Estrai date e durata
            let dateRange = '';
            let duration = '';
            let location = '';
            
            const dateEls = Array.from(jobEl.querySelectorAll('span.t-14.t-normal.t-black--light, span.t-12.t-normal.t-black--light, .pv-entity__date-range span:not(:first-child)'));
            for (const el of dateEls) {
              const txt = select(el);
              if (!dateRange && /\d{4}/.test(txt)) dateRange = txt;
              else if (!duration && /\d+\s+(anno|year|mese|month)/i.test(txt)) duration = txt;
              else if (!location && !/\d/.test(txt) && txt.length > 1) location = txt;
            }
            
            // Descrizione del ruolo
            const description = select(jobEl.querySelector('div.pv-entity__description, div.inline-show-more-text, .pvs-list__outer-container .pvs-list'));
            
            // Aggiungi solo se il titolo o l'azienda non sono vuoti
            if (title || company) {
              jobs.push({
                title,
                company,
                companyUrl,
                dateRange,
                duration,
                location,
                description
              });
            }
          });
        }
        return jobs;
      });
      
      // Estrai tutte le esperienze formative in modo dettagliato
      const educationCollection = await page.evaluate(() => {
        const select = el => el ? el.innerText.trim() : '';
        const schools = [];
        
        // Cerca la sezione della formazione
        let section = document.querySelector('section[id*="education"]') || document.querySelector('section.education-section');
        if (!section) {
          const hdr = Array.from(document.querySelectorAll('h2')).find(h => /formazione|education/i.test(h.innerText));
          section = hdr ? hdr.closest('section') : null;
        }
        
        if (section) {
          // Seleziona tutte le istituzioni formative
          const schoolEls = section.querySelectorAll('li.artdeco-list__item, div.pvs-entity');
          
          // Estrai informazioni per ciascuna scuola (limita a 3 per prestazioni)
          Array.from(schoolEls).slice(0, 3).forEach(schEl => {
            const schoolName = select(schEl.querySelector('h3.pv-entity__school-name, span.mr1.t-bold, span.t-bold.hoverable-link-text'));
            const degree = select(schEl.querySelector('p.pv-entity__secondary-title, span.pv-entity__comma-item, span.t-14.t-normal'));
            const dates = select(schEl.querySelector('p.pv-entity__dates span:not(:first-child), .pv-entity__date-range span:not(:first-child)'));
            const fieldOfStudy = select(schEl.querySelector('.pv-entity__fos span:not(:first-child), span.text-body-small:not(:first-child)'));
            const description = select(schEl.querySelector('div.pv-entity__description, div.inline-show-more-text'));
            const schoolUrl = schEl.querySelector('a[href*="/school/"]')?.href || '';
            
            // Aggiungi solo se il nome della scuola non è vuoto
            if (schoolName) {
              schools.push({
                schoolName,
                degree,
                fieldOfStudy,
                dates,
                description,
                schoolUrl
              });
            }
          });
        }
        return schools;
      });
      
      // Optionally extract contact info via overlay
      let contact = { email: '', phone: '', website: '' };
      try {
        const contactUrl = `${profileUrl}/overlay/contact-info/`;
        await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
        await page.waitForTimeout(2000);
        contact = await page.evaluate(() => {
          const emailEl = document.querySelector('section.ci-email a, a[href^="mailto:"]');
          const phoneEl = document.querySelector('section.ci-phone span.t-14');
          const siteEl = document.querySelector('section.ci-websites a[href^="http"]:not([href*="linkedin.com"])');
          return {
            email: emailEl?.innerText.trim() || '',
            phone: phoneEl?.innerText.trim() || '',
            website: siteEl?.href || ''
          };
        });
      } catch (e) {
        // ignore if contact overlay not accessible
      }
      // restore main profile page
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      const finalProfile = { 
        ...enhancedProfileData, 
        jobs: jobsCollection, 
        schools: educationCollection,
        ...contact 
      };
      // build prompt with all extracted fields
      const parts = [`${template}`, 'Profilo:'];
      for (const [key, value] of Object.entries(finalProfile)) {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        if (Array.isArray(value)) {
          parts.push(`${label}: ${value.join(', ')}`);
        } else {
          parts.push(`${label}: ${value}`);
        }
      }
      const systemMessage = `Genera un messaggio di vendita LinkedIn personalizzato. Usa le informazioni specifiche del profilo per personalizzare il template di messaggio fornito. Indirizza il messaggio a ${finalProfile.name || "questa persona"} e personalizzalo in base alle sue esperienze, competenze e background professionale. Il messaggio deve essere caldo, professionale e diretto, con un'apertura che dimostri interesse genuino nel profilo della persona.`;
      const userPrompt = parts.join('\n');
      
      const response = await openai.chat.completions.create({ 
        model: 'gpt-4.1-mini', 
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      });
      
      const message = response.choices[0].message.content;
      results.push({ profileUrl, profileData: finalProfile, message });
    } else {
      // Batch preview: extract full info for top 5 profiles
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(criteria)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: navTimeout });
      await page.waitForFunction(
        () => document.querySelectorAll('a[href*="/in/"]').length > 0,
        { timeout: navTimeout }
      );
      // Collect unique profile URLs (limit 5)
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
          if (out.length >= 5) break;
        }
        return out;
      });
      // Visit each profile to extract detailed data and generate message
      for (const url of profileUrls) {
        try {
          // Vai al profilo e attendi il caricamento completo
          await page.goto(url, { waitUntil: 'networkidle2', timeout: navTimeout });
          await page.waitForSelector('h1', { timeout: navTimeout });
          
          // Scorri la pagina per caricare tutti i contenuti
          await autoScroll(page);
          
          // Estrai dati profilo base
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
              return Array.from(elements).map(el => el.innerText.trim()).filter(Boolean);
            };
            
            // Estrai informazioni di base
            const name = selectText(['h1.text-heading-xlarge', 'h1.inline.t-24', 'h1']);
            const headline = selectText(['div.text-body-medium', 'h2', 'span.text-body-medium.break-words']);
            const location = selectText(['span.text-body-small.inline.t-black--light', 'span.t-16.t-normal']);
            
            // Estrai riepilogo profilo più completo
            const profileSummary = selectText([
              'section.pv-about-section .pv-about__summary-text',
              'section.pv-about-section p',
              'section[id*="about"] .display-flex p',
              'section[id*="about"]'
            ]);
            
            // Estrai tutte le competenze
            const skills = Array.from(
              document.querySelectorAll(
                'span.pv-skill-category-entity__name-text, span.pv-skill-entity__skill-name-text, li.skill-entity'
              )
            ).map(el => el.innerText.trim()).filter(Boolean);
            
            // Estrai endorsements e raccomandazioni
            const endorsements = document.querySelector('div.pv-skills-section__endorsement-count') 
              ? document.querySelector('div.pv-skills-section__endorsement-count').innerText 
              : '';
            
            // Numero di connessioni
            const connectionsText = selectText(['.pv-top-card--list .t-black--light', 'span.t-bold:contains("connessioni")']);
            const connections = connectionsText.match(/\d+/) ? connectionsText.match(/\d+/)[0] : '';
            
            // Estrai jobTitle e companyName dall'headline
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
            
            // Estrai lingue conosciute
            const languages = selectMultiple('li.languages__list-item h3, section[id*="languages"] li span.t-bold');
            
            // Estrai interessi
            const interests = selectMultiple('section[id*="interest"] li span.t-bold, .pv-interests-section h3');
            
            // Estrai certificazioni
            const certifications = selectMultiple('section[id*="certifications"] li .t-bold, section[id*="certifications"] .t-bold span');
            
            return { 
              name, 
              headline, 
              location, 
              profileSummary, 
              skills, 
              jobTitle, 
              companyName,
              connections,
              endorsements,
              languages,
              interests,
              certifications
            };
          });
          // Extract first experience/job details
          const jobInfo = await page.evaluate(() => {
            const select = el => el ? el.innerText.trim() : '';
            let jobDateRange = '', jobCompanyUrl = '', jobDescription = '', jobDuration = '', jobLocation = '';
            let section = document.querySelector('section[id*="experience"]') || document.querySelector('section.experience-section');
            if (!section) {
              const hdr = Array.from(document.querySelectorAll('h2')).find(h => /esperienza|experience/i.test(h.innerText));
              section = hdr ? hdr.closest('section') : null;
            }
            if (section) {
              const jobEl = section.querySelector('li.artdeco-list__item, div.pvs-entity');
              if (jobEl) {
                jobCompanyUrl = jobEl.querySelector('a[href*="/company/"]')?.href || '';
                const dateEls = Array.from(jobEl.querySelectorAll('span.t-14.t-normal.t-black--light, span.t-12.t-normal.t-black--light'));
                for (const el of dateEls) {
                  const txt = select(el);
                  if (!jobDateRange && /\d{4}/.test(txt)) jobDateRange = txt;
                  else if (!jobDuration && /\d+\s+(anno|year|mese|month)/i.test(txt)) jobDuration = txt;
                  else if (!jobLocation && !/\d/.test(txt)) jobLocation = txt;
                }
                jobDescription = select(jobEl.querySelector('div.pv-entity__description, div.inline-show-more-text'));
              }
            }
            return { jobDateRange, jobCompanyUrl, jobDescription, jobDuration, jobLocation };
          });
          // Estrai tutte le esperienze lavorative in modo dettagliato
          const jobsCollection = await page.evaluate(() => {
            const select = el => el ? el.innerText.trim() : '';
            const jobs = [];
            
            // Cerca la sezione delle esperienze
            let section = document.querySelector('section[id*="experience"]') || document.querySelector('section.experience-section');
            if (!section) {
              const hdr = Array.from(document.querySelectorAll('h2')).find(h => /esperienza|experience/i.test(h.innerText));
              section = hdr ? hdr.closest('section') : null;
            }
            
            if (section) {
              // Seleziona tutte le esperienze lavorative
              const jobEls = section.querySelectorAll('li.artdeco-list__item, div.pvs-entity, .pv-entity__position-group');
              
              // Estrai informazioni per ciascuna esperienza (limita a 3 per prestazioni)
              Array.from(jobEls).slice(0, 3).forEach(jobEl => {
                let title = select(jobEl.querySelector('.pv-entity__summary-info h3, .t-bold span, span.mr1.t-bold'));
                let company = select(jobEl.querySelector('.pv-entity__secondary-title, span.t-14.t-normal, .t-black--light span:not(.visually-hidden)'));
                
                // Estrai URL azienda
                const companyUrl = jobEl.querySelector('a[href*="/company/"]')?.href || '';
                
                // Estrai date e durata
                let dateRange = '';
                let duration = '';
                let location = '';
                
                const dateEls = Array.from(jobEl.querySelectorAll('span.t-14.t-normal.t-black--light, span.t-12.t-normal.t-black--light, .pv-entity__date-range span:not(:first-child)'));
                for (const el of dateEls) {
                  const txt = select(el);
                  if (!dateRange && /\d{4}/.test(txt)) dateRange = txt;
                  else if (!duration && /\d+\s+(anno|year|mese|month)/i.test(txt)) duration = txt;
                  else if (!location && !/\d/.test(txt) && txt.length > 1) location = txt;
                }
                
                // Descrizione del ruolo
                const description = select(jobEl.querySelector('div.pv-entity__description, div.inline-show-more-text, .pvs-list__outer-container .pvs-list'));
                
                // Aggiungi solo se il titolo o l'azienda non sono vuoti
                if (title || company) {
                  jobs.push({
                    title,
                    company,
                    companyUrl,
                    dateRange,
                    duration,
                    location,
                    description
                  });
                }
              });
            }
            return jobs;
          });
          
          // Aggiungi la collezione di jobs al jobInfo
          const enhancedJobInfo = { ...jobInfo, jobs: jobsCollection };
          
          // Extract first education/school details
          const schoolInfo = await page.evaluate(() => {
            const select = el => el ? el.innerText.trim() : '';
            let schoolName = '', schoolDegree = '', schoolDescription = '', schoolUrl = '';
            let section = document.querySelector('section[id*="education"]') || document.querySelector('section.education-section');
            if (!section) {
              const hdr = Array.from(document.querySelectorAll('h2')).find(h => /formazione|education/i.test(h.innerText));
              section = hdr ? hdr.closest('section') : null;
            }
            if (section) {
              const schEl = section.querySelector('li.artdeco-list__item, div.pvs-entity');
              if (schEl) {
                schoolName = select(schEl.querySelector('h3.pv-entity__school-name, span.mr1.t-bold, span.t-bold.hoverable-link-text'));
                schoolDegree = select(schEl.querySelector('p.pv-entity__secondary-title, span.pv-entity__comma-item, span.t-14.t-normal'));
                schoolDescription = select(schEl.querySelector('div.pv-entity__description, div.inline-show-more-text'));
                schoolUrl = schEl.querySelector('a[href*="/school/"]')?.href || '';
              }
            }
            return { schoolName, schoolDegree, schoolDescription, schoolUrl };
          });

          // Estrai tutte le esperienze formative in modo dettagliato
          const educationCollection = await page.evaluate(() => {
            const select = el => el ? el.innerText.trim() : '';
            const schools = [];
            
            // Cerca la sezione della formazione
            let section = document.querySelector('section[id*="education"]') || document.querySelector('section.education-section');
            if (!section) {
              const hdr = Array.from(document.querySelectorAll('h2')).find(h => /formazione|education/i.test(h.innerText));
              section = hdr ? hdr.closest('section') : null;
            }
            
            if (section) {
              // Seleziona tutte le istituzioni formative
              const schoolEls = section.querySelectorAll('li.artdeco-list__item, div.pvs-entity');
              
              // Estrai informazioni per ciascuna scuola (limita a 3 per prestazioni)
              Array.from(schoolEls).slice(0, 3).forEach(schEl => {
                const schoolName = select(schEl.querySelector('h3.pv-entity__school-name, span.mr1.t-bold, span.t-bold.hoverable-link-text'));
                const degree = select(schEl.querySelector('p.pv-entity__secondary-title, span.pv-entity__comma-item, span.t-14.t-normal'));
                const dates = select(schEl.querySelector('p.pv-entity__dates span:not(:first-child), .pv-entity__date-range span:not(:first-child)'));
                const fieldOfStudy = select(schEl.querySelector('.pv-entity__fos span:not(:first-child), span.text-body-small:not(:first-child)'));
                const description = select(schEl.querySelector('div.pv-entity__description, div.inline-show-more-text'));
                const schoolUrl = schEl.querySelector('a[href*="/school/"]')?.href || '';
                
                // Aggiungi solo se il nome della scuola non è vuoto
                if (schoolName) {
                  schools.push({
                    schoolName,
                    degree,
                    fieldOfStudy,
                    dates,
                    description,
                    schoolUrl
                  });
                }
              });
            }
            return schools;
          });
          
          // Aggiungi la collezione di scuole al schoolInfo
          const enhancedSchoolInfo = { ...schoolInfo, schools: educationCollection };
          
          // Attempt contact overlay extraction
          let contact = { email: '', phone: '', website: '' };
          try {
            await page.goto(`${url}/overlay/contact-info/`, { waitUntil: 'domcontentloaded', timeout: navTimeout });
            await page.waitForTimeout(2000);
            contact = await page.evaluate(() => {
              const emailEl = document.querySelector('section.ci-email a, a[href^="mailto:"]');
              const phoneEl = document.querySelector('section.ci-phone span.t-14');
              const siteEl = document.querySelector('section.ci-websites a[href^="http"]:not([href*="linkedin.com"])');
              return {
                email: emailEl?.innerText.trim() || '',
                phone: phoneEl?.innerText.trim() || '',
                website: siteEl?.href || ''
              };
            });
          } catch {/* ignore overlay errors */}
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
          const finalProfile = { ...profileData, ...enhancedJobInfo, ...enhancedSchoolInfo, ...contact };
          const partsArr = [`${template}`, 'Profilo:'];
          for (const [key, value] of Object.entries(finalProfile)) {
            const label = key.charAt(0).toUpperCase() + key.slice(1);
            if (Array.isArray(value)) {
              partsArr.push(`${label}: ${value.join(', ')}`);
            } else {
              partsArr.push(`${label}: ${value}`);
            }
          }
          const systemMessageBatch = `Genera un messaggio di vendita LinkedIn personalizzato. Usa le informazioni specifiche del profilo per personalizzare il template di messaggio fornito. Indirizza il messaggio a ${finalProfile.name || "questa persona"} e personalizzalo in base alle sue esperienze, competenze e background professionale. Il messaggio deve essere caldo, professionale e diretto, con un'apertura che dimostri interesse genuino nel profilo della persona.`;
          const userPromptBatch = partsArr.join('\n');
          
          const resp = await openai.chat.completions.create({ 
            model: 'gpt-4.1-mini', 
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
        }
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