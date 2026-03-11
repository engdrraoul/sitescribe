# 🚀 SiteScribe

SiteScribe est un outil d'automatisation de navigation et de capture d'écran. Il explore un site web, capture chaque page et génère un rapport HTML élégant.

## 🛠️ Installation

1. Assurez-vous d'avoir [Node.js](https://nodejs.org/) installé.
2. Ouvrez un terminal dans ce dossier.
3. Installez les dépendances :
   ```bash
   npm install
   ```
4. Installez le navigateur nécessaire :
   ```bash
   npx playwright install chromium
   ```

## 📸 Utilisation

Pour lancer l'outil sur un site :
```bash
node scribe.js https://votre-site.com
```

Le rapport sera généré dans le dossier `output/index.html`.

## ✨ Fonctionnalités
- **Crawler Intelligent** : Découvre automatiquement les pages du même domaine.
- **Captures Full-Page** : Prend une capture d'écran de toute la hauteur de la page.
- **Rapport Premium** : Une interface moderne pour visualiser les résultats.
- **Vitesse** : Utilise Playwright pour une performance optimale.
