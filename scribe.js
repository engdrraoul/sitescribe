const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

const URL_TO_CRAWL = process.argv[2];
const SHOULD_LOGIN = process.argv.includes('--login');
const RUN_HEADLESS = process.argv.includes('--headless');
const OPENROUTER_API_KEY = "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";

if (!URL_TO_CRAWL) {
    console.error('Usage: node scribe.js <URL> [--login]');
    process.exit(1);
}

const DOMAIN = new URL(URL_TO_CRAWL).hostname;
const OUTPUT_DIR = path.join(__dirname, 'output');
const CAPTURES_DIR = path.join(OUTPUT_DIR, 'captures');
const MD_DIR = path.join(OUTPUT_DIR, 'descriptions');

const ACCOUNTS = [
    { name: 'Siège', selector: 'button.autofill-btn[data-email="siege@ladom.fr"]' },
    { name: 'RU 1', selector: 'button.autofill-btn[data-email="instructeur_ladom@gmail.com"]' },
    { name: 'Agent GU', selector: 'button.autofill-btn[data-email="agent.guadeloupe@ladom.fr"]' }
];

async function analyzeWithAI(imagePath, url, role) {
    try {
        console.log(`🤖 IA (OpenRouter) en cours d'analyse pour: ${path.basename(imagePath)}...`);
        const base64Image = Buffer.from(fs.readFileSync(imagePath)).toString("base64");

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "google/gemini-2.0-flash-001",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Tu rédiges un texte de documentation fonctionnelle à partir d’une capture d’écran d’application web.

Consignes à respecter impérativement :
- Décris uniquement la page affichée.
- Reste factuel, simple, clair et professionnel.
- Le texte doit expliquer à quoi sert la page et quels éléments principaux elle contient.
- Ne fais pas d’analyse UX/UI.
- Ne fais pas d’audit.
- Ne donne aucune recommandation d’amélioration.
- Ne fais pas de résumé critique.
- N’interprète pas au-delà de ce qui est visible.
- N’utilise pas de ton conversationnel.
- Ne parle pas en première personne.
- N’ajoute pas d’introduction du type : "Voici une analyse", "Rapport", "Audit", etc.
- Ne structure pas la réponse avec trop de sous-parties.
- Le rendu doit pouvoir être copié directement dans une documentation HTML.

Format attendu :
- Un titre court correspondant au nom de la page (ex: ## Nom de la page)
- Un paragraphe bref expliquant le rôle de la page
- Puis, si nécessaire, une courte liste des éléments visibles ou des informations affichées

Style attendu : rédaction sobre, phrases courtes, ton neutre, texte concis.`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${base64Image}`
                                }
                            }
                        ]
                    }
                ]
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://sitescribe.audit", // Requis par OpenRouter
                    "X-Title": "SiteScribe Pro"
                }
            }
        );

        return response.data.choices[0].message.content;
    } catch (e) {
        console.error(`❌ Erreur OpenRouter: ${e.response?.data?.error?.message || e.message}`);
        return `### 📄 Analyse Automatique (Échec)
        Désolé, l'IA via OpenRouter n'a pas pu analyser cette page.
        **URL:** ${url}
        **Erreur:** ${e.response?.data?.error?.message || e.message}`;
    }
}

async function run() {
    console.log(`🚀 SiteScribe starting for: ${URL_TO_CRAWL}`);

    await fs.remove(OUTPUT_DIR);
    await fs.ensureDir(CAPTURES_DIR);
    await fs.ensureDir(MD_DIR);

    const browser = await chromium.launch({
        headless: RUN_HEADLESS,
        args: ['--start-maximized']
    });
    const context = await browser.newContext({
        viewport: null
    });
    const page = await context.newPage();

    const results = [];
    let globalCount = 0;

    if (SHOULD_LOGIN) {
        // --- 🧪 FLUX TEST : MOT DE PASSE OUBLIÉ (2CCONSEIL) ---
        console.log("\n🧪 [PARCOURS TEST] Vérification de la réinitialisation de mot de passe...");
        try {
            await page.goto(URL_TO_CRAWL, { waitUntil: 'networkidle' });

            // 1. Clic sur Mot de passe oublié
            const forgotLink = page.locator('a:has-text("Mot de passe oublié"), a[href*="lost-password"]');
            if (await forgotLink.count() > 0) {
                await forgotLink.first().click();
                await page.waitForLoadState('networkidle');

                globalCount++;
                console.log(`📸 [${globalCount}] Capturing: Page de Récupération`);
                let fileName = `page_${globalCount}.png`;
                let fullPath = path.join(CAPTURES_DIR, fileName);
                await page.screenshot({ path: fullPath, fullPage: true });
                let desc = await analyzeWithAI(fullPath, page.url(), "Système (Reset)");
                await fs.writeFile(path.join(MD_DIR, `page_${globalCount}.md`), desc);
                results.push({ id: globalCount, url: page.url(), title: "Réinitialisation - Demande", screenshot: `captures/${fileName}`, description: desc });

                // 2. Saisie du mail
                await page.fill('#user_login, input[type="email"]', 'cjaptest@yopmail.com');
                await page.click('#wp-submit, button[type="submit"]');
                await page.waitForTimeout(2000);

                // 3. Navigation Yopmail
                console.log("📨 Accès à Yopmail (cjaptest)...");
                const yopPage = await context.newPage();
                await yopPage.goto('https://yopmail.com/fr', { waitUntil: 'networkidle' });

                await yopPage.reload({ waitUntil: 'networkidle' }); // Reload demandé

                // --- GESTION DU CONSENTEMENT (GDPR) ---
                try {
                    const consentBtn = yopPage.locator('.fc-button-label:has-text("Consent"), .fc-button-label:has-text("Accepter"), button#accept');
                    // On attend un peu au cas où le popup met du temps à apparaître
                    await consentBtn.first().waitFor({ state: 'visible', timeout: 4000 });
                    if (await consentBtn.count() > 0) {
                        await consentBtn.first().click();
                        await yopPage.waitForTimeout(1500);
                    }
                } catch (e) {
                    // Si on timeout, c'est qu'il n'y a pas de popup
                    console.log("   ➡️ Aucun popup de consentement bloquant.");
                }

                // Interaction spécifique demandée
                await yopPage.click('#ycptcpt > div.nw > div');
                await yopPage.fill('#login', 'cjaptest@yopmail.com');
                await yopPage.keyboard.press('Enter');
                await yopPage.waitForTimeout(4000);

                // Recherche et clic sur le mail
                const inboxFrame = yopPage.frameLocator('#ifinbox');
                const firstMail = inboxFrame.locator('.mctn').first();
                if (await firstMail.count() > 0) {
                    await firstMail.locator('div').first().click();
                    await yopPage.waitForTimeout(2000);

                    // --- CAPTURE YOPMAIL ---
                    globalCount++;
                    console.log(`📸 [${globalCount}] Capturing: Boîte Yopmail`);
                    let yopFileName = `page_${globalCount}.png`;
                    let yopFullPath = path.join(CAPTURES_DIR, yopFileName);
                    await yopPage.screenshot({ path: yopFullPath, fullPage: true });
                    let yopDesc = await analyzeWithAI(yopFullPath, yopPage.url(), "Documentation 2Cconseil");
                    await fs.writeFile(path.join(MD_DIR, `page_${globalCount}.md`), yopDesc);
                    results.push({ id: globalCount, url: yopPage.url(), title: "Vérification Yopmail", screenshot: `captures/${yopFileName}`, description: yopDesc });

                    const mailFrame = yopPage.frameLocator('#ifmail');
                    const resetBtn = mailFrame.locator('a:has-text("Réinitialiser mon mot de passe")');

                    if (await resetBtn.count() > 0) {
                        const resetUrl = await resetBtn.getAttribute('href');
                        console.log(`🔗 Lien extrait : ${resetUrl}`);

                        const finalResetPage = await context.newPage();
                        await finalResetPage.goto(resetUrl, { waitUntil: 'networkidle' });

                        globalCount++;
                        console.log(`📸 [${globalCount}] Capturing: Reset Final`);
                        fileName = `page_${globalCount}.png`;
                        fullPath = path.join(CAPTURES_DIR, fileName);
                        await finalResetPage.screenshot({ path: fullPath, fullPage: true });
                        desc = await analyzeWithAI(fullPath, finalResetPage.url(), "Documentation 2Cconseil");
                        await fs.writeFile(path.join(MD_DIR, `page_${globalCount}.md`), desc);
                        results.push({ id: globalCount, url: finalResetPage.url(), title: "Réinitialisation - Succès", screenshot: `captures/${fileName}`, description: desc });

                        await finalResetPage.close();
                    }
                }
                await yopPage.close();
                console.log("✅ Parcours Reset terminé. Retour à la connexion standard.");
            }
        } catch (e) {
            console.error(`⚠️ Échec du parcours de récupération : ${e.message}`);
        }

        for (const account of ACCOUNTS) {
            console.log(`\n🔑 [NEW SESSION] Account: ${account.name}`);
            try {
                await page.goto(URL_TO_CRAWL, { waitUntil: 'networkidle', timeout: 60000 });
                await page.waitForTimeout(2000);

                // --- LOGIN VIDE ---
                globalCount++;
                console.log(`📸 [${globalCount}] Capturing: Login (Vide)`);
                let fileName = `page_${globalCount}.png`;
                let mdName = `page_${globalCount}.md`;
                let fullPath = path.join(CAPTURES_DIR, fileName);
                await page.screenshot({ path: fullPath, fullPage: true });

                let desc = await analyzeWithAI(fullPath, page.url(), account.name);
                await fs.writeFile(path.join(MD_DIR, mdName), desc);

                results.push({ id: globalCount, url: page.url(), title: `Connexion (Vide) - ${account.name}`, screenshot: `captures/${fileName}`, description: desc });

                // Autofill
                const btn = page.locator(account.selector);
                await btn.waitFor({ state: 'visible', timeout: 20000 });
                await btn.click();
                await page.waitForTimeout(1500);

                // --- LOGIN REMPLIE ---
                globalCount++;
                console.log(`📸 [${globalCount}] Capturing: Login (Remplie)`);
                fileName = `page_${globalCount}.png`;
                mdName = `page_${globalCount}.md`;
                fullPath = path.join(CAPTURES_DIR, fileName);
                await page.screenshot({ path: fullPath, fullPage: true });

                desc = await analyzeWithAI(fullPath, page.url(), account.name);
                await fs.writeFile(path.join(MD_DIR, mdName), desc);

                results.push({ id: globalCount, url: page.url(), title: `Connexion (Remplie) - ${account.name}`, screenshot: `captures/${fileName}`, description: desc });

                // Submit
                console.log(`Submit login as ${account.name}...`);
                await page.click('#wp-submit');

                console.log('⏳ Waiting for dashboard...');
                try {
                    await page.waitForFunction(() => {
                        return window.location.href.includes('wp-admin') ||
                            !!document.querySelector('#wpadminbar') ||
                            !!document.querySelector('.dashboard') ||
                            !!document.querySelector('.home');
                    }, { timeout: 45000 });
                } catch (e) {
                    console.log('Dashboard detection timed out...');
                }

                console.log(`✅ Session active for: ${account.name}`);

                // --- CRAWL SESSION ---
                const sessionVisited = new Set();
                const sessionQueue = [page.url()];
                let sessionCount = 0;

                while (sessionQueue.length > 0 && sessionCount < 12) {
                    const url = sessionQueue.shift();
                    const baseSafeUrl = url.split('#')[0].replace(/\/$/, "");
                    if (sessionVisited.has(baseSafeUrl)) continue;

                    try {
                        console.log(`   📸 [VISIT] [${account.name}] Attempting: ${url}`);
                        // Safety check: ensure the browser is still open before goto
                        if (browser.isConnected()) {
                            await page.goto(url, { waitUntil: 'load', timeout: 35000 }).catch(() => { });
                            await page.waitForTimeout(3000);
                        } else break;

                        const isMainPage = await page.evaluate(() => {
                            const body = document.body;
                            return body && body.innerText.trim().length > 50;
                        });

                        if (!isMainPage) continue;

                        sessionVisited.add(baseSafeUrl);
                        sessionCount++;
                        globalCount++;

                        const title = await page.title();
                        fileName = `page_${globalCount}.png`;
                        mdName = `page_${globalCount}.md`;
                        fullPath = path.join(CAPTURES_DIR, fileName);
                        await page.screenshot({ path: fullPath, fullPage: true });

                        desc = await analyzeWithAI(fullPath, url, account.name);
                        await fs.writeFile(path.join(MD_DIR, mdName), desc);

                        results.push({
                            id: globalCount,
                            url,
                            title: `[${account.name}] ${title || url}`,
                            screenshot: `captures/${fileName}`,
                            description: desc
                        });

                        // --- 🌀 SCÉNARIOS SPÉCIFIQUES ---

                        // 1. RU (Instructeur) - Détail formation
                        if (account.name.includes("RU")) {
                            const ruTableLink = page.locator('table tbody tr:nth-child(1) a').first();
                            if (await ruTableLink.count() > 0) {
                                console.log("   🔬 [RU] Exploration du détail formation...");
                                const [newTab] = await Promise.all([
                                    context.waitForEvent('page'),
                                    ruTableLink.click({ modifiers: ['Control', 'Meta'] }) // Simule clic nouvel onglet
                                ]).catch(() => [null]);

                                if (newTab) {
                                    await newTab.waitForLoadState('networkidle');
                                    globalCount++;
                                    const ntName = `page_${globalCount}.png`;
                                    await newTab.screenshot({ path: path.join(CAPTURES_DIR, ntName), fullPage: true });
                                    const ntDesc = await analyzeWithAI(path.join(CAPTURES_DIR, ntName), newTab.url(), account.name);
                                    results.push({ id: globalCount, url: newTab.url(), title: `[${account.name}] Détail Formation`, screenshot: `captures/${ntName}`, description: ntDesc });
                                    await newTab.close();
                                }
                            }
                        }

                        // 2. AGENT - Grilles et Inscription
                        const agentGrid = page.locator('.filtered-subpages-grid a').first();
                        if (await agentGrid.count() > 0 && account.name.toLowerCase().includes("agent")) {
                            console.log("   🔬 [AGENT] Exploration d'un cours...");
                            const [courseTab] = await Promise.all([
                                context.waitForEvent('page'),
                                agentGrid.click({ modifiers: ['Control', 'Meta'] })
                            ]).catch(() => [null]);

                            if (courseTab) {
                                await courseTab.waitForLoadState('networkidle');
                                // Capture cours
                                globalCount++;
                                const cName = `page_${globalCount}.png`;
                                await courseTab.screenshot({ path: path.join(CAPTURES_DIR, cName), fullPage: true });
                                const cDesc = await analyzeWithAI(path.join(CAPTURES_DIR, cName), courseTab.url(), account.name);
                                results.push({ id: globalCount, url: courseTab.url(), title: `[${account.name}] Vue Cours`, screenshot: `captures/${cName}`, description: cDesc });

                                // Clic Bouton Inscription (Buy/Access)
                                const buyBtn = courseTab.locator('.masterstudy-buy-button__link, .btn-buy, a:has-text("S\'inscrire")').first();
                                if (await buyBtn.count() > 0) {
                                    await buyBtn.click();
                                    await courseTab.waitForTimeout(3000);
                                    globalCount++;
                                    const bName = `page_${globalCount}.png`;
                                    await courseTab.screenshot({ path: path.join(CAPTURES_DIR, bName), fullPage: true });
                                    const bDesc = await analyzeWithAI(path.join(CAPTURES_DIR, bName), courseTab.url(), account.name);
                                    results.push({ id: globalCount, url: courseTab.url(), title: `[${account.name}] Inscription/Achat`, screenshot: `captures/${bName}`, description: bDesc });
                                }
                                await courseTab.close();
                            }
                        }

                        // 3. QUIZ - Navigation
                        const quizList = page.locator('.space-y-4 a').first();
                        if (await quizList.count() > 0 && url.includes('quiz')) {
                            console.log("   🔬 Navigation Quiz détectée...");
                            await quizList.click();
                            await page.waitForTimeout(3000);
                            globalCount++;
                            const qName = `page_${globalCount}.png`;
                            await page.screenshot({ path: path.join(CAPTURES_DIR, qName), fullPage: true });
                            const qDesc = await analyzeWithAI(path.join(CAPTURES_DIR, qName), page.url(), account.name);
                            results.push({ id: globalCount, url: page.url(), title: `[${account.name}] Quiz Detail`, screenshot: `captures/${qName}`, description: qDesc });
                        }

                        // --- EXTRACTION DES LIENS (Uniquement visibles dans le DOM actuel) ---
                        const links = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('a'))
                                .filter(a => {
                                    const rect = a.getBoundingClientRect();
                                    const style = window.getComputedStyle(a);
                                    const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 2 && rect.width > 2;
                                    const isExternal = a.hostname !== window.location.hostname;
                                    return visible && !!a.href && !a.href.startsWith('javascript:') && !isExternal;
                                })
                                .map(a => a.href)
                                .filter(href => href.startsWith('http') && !href.includes('#') && !href.includes('logout'));
                        });

                        for (const link of links) {
                            try {
                                const lUrl = new URL(link);
                                const lBase = link.split('#')[0].replace(/\/$/, "");
                                if (lUrl.hostname === DOMAIN && !sessionVisited.has(lBase)) {
                                    sessionQueue.push(link);
                                }
                            } catch (e) { }
                        }
                    } catch (e) {
                        console.error(`   ❌ Session Capture Error: ${e.message}`);
                        if (e.message.includes("closed")) break; // Stop loop if browser closed
                    }
                }

                // Logout
                console.log(`Logging out from ${account.name} session...`);
                try {
                    const origin = new URL(URL_TO_CRAWL).origin;
                    await page.goto(`${origin}/wp-login.php?action=logout`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });
                    const confirmLogout = page.locator('a:has-text("Se déconnecter"), a[href*="logout"]');
                    if (await confirmLogout.count() > 0) {
                        await confirmLogout.first().click();
                        await page.waitForTimeout(2000);
                    }
                } catch (e) { console.log("Logout warning (skipped):", e.message); }

                await context.clearCookies().catch(() => { });

            } catch (e) {
                console.error(`⚠️ Session lifecycle failed for ${account.name}: ${e.message}`);
                await context.clearCookies().catch(() => { });
            }
        }
    }

    try {
        await browser.close();
    } catch (e) { }

    await generateReport(results, URL_TO_CRAWL);
    console.log(`\n✨ Done! Report generated with OpenRouter AI analysis.`);
}

async function generateReport(results, baseUrl) {
    const cardsHtml = results.map(res => `
        <div class="card" id="card-${res.id}" style="--delay: ${res.id * 0.1}s" onclick="openPreview('${res.screenshot}', '${encodeURIComponent(res.title)}', '${res.url}', ${res.id})">
            <button class="delete-card" onclick="event.stopPropagation(); deleteCard(${res.id})" title="Supprimer cette capture">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
            </button>
            <div class="card-image" style="background-image: url('${res.screenshot}')">
                <div class="card-overlay">
                    <span>Voir les détails</span>
                </div>
            </div>
            <div class="card-content">
                <div class="card-tag">${res.title.split(']')[0].replace('[', '') || 'Système'}</div>
                <h3>${res.title.includes(']') ? res.title.split(']')[1].trim() : res.title}</h3>
                <p>${res.url}</p>
            </div>
        </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>2Cconseil • Documentation Fonctionnelle</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #030712;
            --surface: rgba(17, 24, 39, 0.7);
            --primary: #38bdf8;
            --secondary: #818cf8;
            --accent: #f472b6;
            --text: #f9fafb;
            --text-dim: #9ca3af;
            --glass: rgba(255, 255, 255, 0.03);
            --border: rgba(255, 255, 255, 0.08);
            --shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: var(--bg);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
            background-image: 
                radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 100% 100%, rgba(129, 140, 248, 0.08) 0%, transparent 40%);
            line-height: 1.6;
        }

        header {
            padding: 80px 40px 40px;
            text-align: center;
            position: relative;
        }

        .logo-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin-bottom: 20px;
        }

        .logo-icon {
            width: 50px; height: 50px;
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 30px rgba(56, 189, 248, 0.4);
        }

        h1 {
            font-size: 4rem;
            font-weight: 800;
            letter-spacing: -0.04em;
            background: linear-gradient(to right, #fff, #94a3b8);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            font-size: 1.2rem;
            color: var(--text-dim);
            max-width: 600px;
            margin: 0 auto;
        }

        .stats-bar {
            margin: 40px auto;
            display: inline-flex;
            background: var(--glass);
            padding: 8px 24px;
            border-radius: 99px;
            border: 1px solid var(--border);
            backdrop-filter: blur(10px);
            font-size: 0.9rem;
            color: var(--text-dim);
            gap: 20px;
        }

        .stats-bar strong { color: var(--primary); }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
            gap: 30px;
            padding: 40px;
            width: 100%;
        }

        .card {
            background: var(--surface);
            border-radius: 24px;
            border: 1px solid var(--border);
            overflow: hidden;
            cursor: pointer;
            transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
            position: relative;
            backdrop-filter: blur(12px);
            animation: fadeIn 0.8s ease backwards;
            animation-delay: var(--delay);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .card:hover {
            transform: translateY(-12px);
            border-color: rgba(56, 189, 248, 0.4);
            box-shadow: 0 30px 60px rgba(0,0,0,0.6), 0 0 40px rgba(56, 189, 248, 0.1);
        }

        .card-image {
            height: 300px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: top center;
            background-color: #000;
            position: relative;
            transition: 0.5s;
        }

        .card:hover .card-image {
            transform: scale(1.02);
        }

        .card-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: 0.3s;
        }

        .card:hover .card-overlay { opacity: 1; }

        .card-overlay span {
            background: var(--primary);
            color: var(--bg);
            padding: 10px 20px;
            border-radius: 8px;
            font-weight: 700;
            font-size: 0.85rem;
            text-transform: uppercase;
        }

        .card-content {
            padding: 30px;
            position: relative;
            z-index: 2;
            background: var(--bg);
        }

        .card-tag {
            display: inline-block;
            padding: 4px 12px;
            background: rgba(129, 140, 248, 0.15);
            color: var(--secondary);
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 700;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .card h3 {
            font-size: 1.4rem;
            font-weight: 700;
            margin-bottom: 10px;
            color: #fff;
        }

        .card p {
            font-size: 0.9rem;
            color: var(--text-dim);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .delete-card {
            position: absolute;
            top: 20px; right: 20px;
            width: 40px; height: 40px;
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 12px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            z-index: 10;
            opacity: 0;
            transition: all 0.3s;
            backdrop-filter: blur(5px);
        }

        .card:hover .delete-card { opacity: 1; }
        .delete-card:hover { 
            background: #ef4444; color: #fff; 
            transform: scale(1.1) rotate(5deg);
        }
        .delete-card svg { width: 20px; height: 20px; }

        /* MODAL DESIGN */
        #previewModal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(3, 7, 18, 0.98);
            z-index: 2000;
            backdrop-filter: blur(25px);
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .modal-content {
            background: var(--bg);
            width: 100%; height: 100%;
            border-radius: 32px;
            border: 1px solid var(--border);
            display: flex; flex-direction: column;
            overflow: hidden;
            box-shadow: 0 50px 100px rgba(0,0,0,0.8);
            position: relative;
        }

        .modal-header {
            padding: 24px 40px;
            background: rgba(17, 24, 39, 0.8);
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10;
        }

        .modal-header h2 { font-size: 1.8rem; font-weight: 700; color: #fff; }
        .modal-header p { color: var(--primary); font-size: 0.9rem; font-weight: 500; }

        .modal-close {
            width: 48px; height: 48px;
            background: var(--glass);
            border: 1px solid var(--border);
            border-radius: 50%;
            color: #fff;
            font-size: 1.5rem;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; transition: 0.3s;
        }

        .modal-close:hover { background: #ef4444; border-color: #ef4444; transform: rotate(90deg); }

        .modal-body {
            display: grid;
            grid-template-columns: 1fr 550px;
            height: 100%;
            overflow: hidden;
        }

        .modal-image-area {
            overflow: auto;
            background: #000;
            position: relative;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }

        .modal-image-area img { 
            max-width: 100%; 
            height: auto; 
            border-radius: 8px;
            box-shadow: 0 0 50px rgba(0,0,0,0.5);
        }

        .modal-doc-area {
            background: #0f172a;
            border-left: 1px solid var(--border);
            padding: 60px 45px;
            overflow-y: auto;
            position: relative;
        }

        .doc-scroll-content { max-width: 100%; }

        .modal-info h2 { color: var(--primary); font-size: 2.2rem; margin-bottom: 25px; font-weight: 800; border-bottom: 2px solid var(--primary); display: inline-block; }
        .modal-info h3 { color: #fff; font-size: 1.6rem; margin: 30px 0 15px; font-weight: 700; }
        .modal-info p { margin-bottom: 20px; font-size: 1.1rem; color: #cbd5e1; line-height: 1.8; }
        .modal-info ul { margin: 20px 0 30px 20px; list-style: none; }
        .modal-info li { margin-bottom: 12px; position: relative; padding-left: 30px; color: #cbd5e1; font-size: 1.05rem; }
        .modal-info li::before {
            content: "→";
            position: absolute; left: 0; color: var(--primary); font-weight: 800;
        }
        .modal-info hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }

        .brand-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: linear-gradient(to right, rgba(56, 189, 248, 0.1), rgba(129, 140, 248, 0.1));
            border: 1px solid rgba(56, 189, 248, 0.2);
            border-radius: 99px;
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 30px;
        }

        .edit-controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .btn-edit {
            background: var(--glass);
            border: 1px solid var(--border);
            color: var(--text-dim);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8rem;
            transition: 0.3s;
        }

        .btn-edit:hover { background: var(--primary); color: var(--bg); border-color: var(--primary); }

        #editorArea {
            display: none;
            width: 100%;
            height: 400px;
            background: rgba(0,0,0,0.3);
            border: 1px solid var(--border);
            border-radius: 12px;
            color: #fff;
            padding: 15px;
            font-family: monospace;
            font-size: 0.95rem;
            margin-bottom: 20px;
            resize: vertical;
        }

        footer {
            padding: 100px 40px;
            text-align: center;
            border-top: 1px solid var(--border);
            color: var(--text-dim);
            font-size: 0.95rem;
            margin-top: 60px;
        }

        .modal-nav {
            display: flex;
            gap: 10px;
            margin-right: 20px;
        }

        .btn-nav {
            background: var(--glass);
            border: 1px solid var(--border);
            color: #fff;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 0.9rem;
            font-weight: 600;
            transition: 0.3s;
        }

        .btn-nav:hover { background: var(--primary); color: var(--bg); border-color: var(--primary); }

        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--primary); }

        @media (max-width: 1200px) {
            .modal-body { grid-template-columns: 1fr; }
            .modal-doc-area { border-left: none; border-top: 1px solid var(--border); }
        }
    </style>
</head>
<body>
    <header>
        <div class="logo-container">
            <div class="logo-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <span style="font-weight: 800; font-size: 1.5rem; letter-spacing: -0.02em;">2Cconseil.fr</span>
        </div>
        <h1>Documentation Fonctionnelle</h1>
        <p class="subtitle">Analyse structurelle et descriptive des interfaces de la plateforme LADOM.</p>
        
        <div class="stats-bar">
            <span>Client : <strong>2Cconseil</strong></span>
            <span>Domaine : <strong>${baseUrl}</strong></span>
            <span>Ressources : <strong id="count-total">${results.length}</strong></span>
        </div>
    </header>

    <div class="grid">${cardsHtml}</div>

    <footer>
        <p>© 2026 2Cconseil • Expertise Digital & Formation • Interface Pro-Wide</p>
    </footer>

    <div id="previewModal" onclick="closeModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div>
                    <h2 id="modalTitle"></h2>
                    <p id="modalUrl"></p>
                </div>
                <div style="display: flex; align-items: center;">
                    <div class="modal-nav">
                        <button class="btn-nav" onclick="prevCard()">&#8592; Précédent</button>
                        <button class="btn-nav" onclick="nextCard()">Suivant &#8594;</button>
                    </div>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
            </div>
            <div class="modal-body">
                <div class="modal-image-area">
                    <img id="modalImg" src="" alt="Capture d'écran">
                </div>
                <div class="modal-doc-area">
                    <div class="doc-scroll-content">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div class="brand-badge">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                DOCUMENTATION 2CCONSEIL
                            </div>
                            <div class="edit-controls">
                                <button class="btn-edit" id="btnEdit" onclick="toggleEdit()">Modifier le texte</button>
                                <button class="btn-edit" onclick="copyMarkdown()">Copier MD</button>
                            </div>
                        </div>
                        
                        <textarea id="editorArea"></textarea>
                        <div class="modal-info" id="modalInfo"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        const reportsData = ${JSON.stringify(results)};
        let currentId = null;
        let isEditing = false;
        
        function openPreview(img, title, url, id) {
            currentId = id;
            isEditing = false;
            document.getElementById('editorArea').style.display = 'none';
            document.getElementById('modalInfo').style.display = 'block';
            document.getElementById('btnEdit').innerText = 'Modifier le texte';

            const data = reportsData.find(r => r.id === id);
            document.getElementById('modalImg').src = img;
            document.getElementById('modalTitle').innerText = decodeURIComponent(title);
            document.getElementById('modalUrl').innerText = url;
            
            const content = data.description;
            document.getElementById('modalInfo').innerHTML = marked.parse(content);
            document.getElementById('editorArea').value = content;
            
            document.getElementById('previewModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function toggleEdit() {
            const info = document.getElementById('modalInfo');
            const editor = document.getElementById('editorArea');
            const btn = document.getElementById('btnEdit');
            
            if (!isEditing) {
                info.style.display = 'none';
                editor.style.display = 'block';
                btn.innerText = 'Sauvegarder';
                isEditing = true;
            } else {
                const newData = editor.value;
                const index = reportsData.findIndex(r => r.id === currentId);
                if (index > -1) reportsData[index].description = newData;
                
                info.innerHTML = marked.parse(newData);
                info.style.display = 'block';
                editor.style.display = 'none';
                btn.innerText = 'Modifier le texte';
                isEditing = false;
            }
        }

        function copyMarkdown() {
            const text = document.getElementById('editorArea').value;
            navigator.clipboard.writeText(text);
            alert('Markdown copié !');
        }

        function closeModal() {
            document.getElementById('previewModal').style.display = 'none';
            document.body.style.overflow = 'auto';
        }

        function deleteCard(id) {
            if (confirm('Supprimer cette ressource ?')) {
                const element = document.getElementById('card-' + id);
                element.style.opacity = '0';
                element.style.transform = 'scale(0.9) translateY(20px)';
                setTimeout(() => {
                    element.remove();
                    const index = reportsData.findIndex(r => r.id === id);
                    if (index > -1) reportsData.splice(index, 1);
                    document.getElementById('count-total').innerText = reportsData.length;
                    
                    if (currentId === id) closeModal();
                }, 500);
            }
        }

        function nextCard() {
            const currentIndex = reportsData.findIndex(r => r.id === currentId);
            if (currentIndex > -1 && currentIndex < reportsData.length - 1) {
                const next = reportsData[currentIndex + 1];
                openPreview(next.screenshot, next.title, next.url, next.id);
            }
        }

        function prevCard() {
            const currentIndex = reportsData.findIndex(r => r.id === currentId);
            if (currentIndex > 0) {
                const prev = reportsData[currentIndex - 1];
                openPreview(prev.screenshot, prev.title, prev.url, prev.id);
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
            if (document.getElementById('previewModal').style.display === 'flex' && !isEditing) {
                if (e.key === 'ArrowRight') nextCard();
                if (e.key === 'ArrowLeft') prevCard();
            }
        });
    </script>
</body>
</html>`;

    await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), html);
}

run();
