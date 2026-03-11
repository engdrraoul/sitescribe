#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
# Installation des navigateurs pour Playwright et de leurs dépendances systèmes ! (Obligatoire sur Render)
npx playwright install --with-deps chromium
