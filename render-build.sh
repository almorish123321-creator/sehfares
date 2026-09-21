#!/usr/bin/env bash
# Render Build Script - Installs Chrome for Puppeteer PDF generation

set -e

echo "=== Installing dependencies ==="
npm install

echo "=== Installing Google Chrome Stable ==="
apt-get update -qq
apt-get install -y -qq wget gnupg2

wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list
apt-get update -qq
apt-get install -y -qq google-chrome-stable

echo "=== Chrome installed at: $(which google-chrome-stable) ==="
google-chrome-stable --version

echo "=== Build complete ==="
