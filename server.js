const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;
const OUTPUT_DIR = path.join(__dirname, 'output');

// Middleware to serve static files from the output directory
app.use(express.static(OUTPUT_DIR));

// View engine or simple HTML response
app.get('/', (req, res) => {
  res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>2Cconseil - Générateur d'Audit</title>
            <style>
                body { font-family: 'Inter', sans-serif; background: #0f172a; color: white; text-align: center; padding: 50px; }
                button { background: #38bdf8; color: #0f172a; border: none; padding: 15px 30px; font-size: 1.2rem; font-weight: bold; border-radius: 8px; cursor: pointer; transition: 0.3s; }
                button:hover { background: #0ea5e9; transform: translateY(-2px); }
                .loader { display: none; margin-top: 20px; font-size: 1.1rem; color: #94a3b8; }
                .report-link { display: none; margin-top: 30px; font-size: 1.2rem; color: #38bdf8; text-decoration: none; }
            </style>
        </head>
        <body>
            <h1>Générateur de Rapport Fonctionnel</h1>
            <p>Cliquez sur le bouton ci-dessous pour lancer l'audit (cela peut prendre quelques minutes).</p>
            <button id="runBtn" onclick="runScript()">Lancer l'Audit</button>
            <div id="loader" class="loader">⏳ Audit en cours... Veuillez patienter.</div>
            <a id="reportLink" class="report-link" href="/index.html" target="_blank">✅ Rapport terminé ! Cliquez ici pour le voir.</a>
            
            <script>
                async function runScript() {
                    document.getElementById('runBtn').style.display = 'none';
                    document.getElementById('loader').style.display = 'block';
                    document.getElementById('reportLink').style.display = 'none';
                    
                    try {
                        const response = await fetch('/run-audit');
                        if (response.ok) {
                            document.getElementById('loader').style.display = 'none';
                            document.getElementById('reportLink').style.display = 'block';
                        } else {
                            alert("Une erreur s'est produite lors de l'audit.");
                            document.getElementById('loader').style.display = 'none';
                            document.getElementById('runBtn').style.display = 'inline-block';
                        }
                    } catch (e) {
                        alert("Erreur de connexion serveur.");
                        document.getElementById('loader').style.display = 'none';
                        document.getElementById('runBtn').style.display = 'inline-block';
                    }
                }
            </script>
        </body>
        </html>
    `);
});

// Endpoint to trigger the Playwright script
app.get('/run-audit', async (req, res) => {
  console.log("🚀 Lancement de l'audit demandé...");

  // Si on est sur Render, Playwright en mode headless true est obligatoire
  const isHeadless = process.env.RENDER ? '--headless' : '';
  const cmd = `node scribe.js http://13.37.100.54/ --login ${isHeadless}`;

  exec(cmd, { env: process.env }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Erreur d'exécution: ${error.message}`);
      return res.status(500).send("Erreur lors de l'exécution du script.");
    }
    console.log("✅ Audit terminé avec succès.");
    res.status(200).send("Audit terminé");
  });
});

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`🌐 Accédez à l'interface via http://localhost:${PORT}`);
});
