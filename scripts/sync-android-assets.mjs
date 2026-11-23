import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const androidWwwDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'www');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ directory not found. Run "npm run build" first.');
  process.exit(1);
}

fs.rmSync(androidWwwDir, { recursive: true, force: true });
fs.mkdirSync(androidWwwDir, { recursive: true });
fs.cpSync(distDir, androidWwwDir, { recursive: true });

// Ensure asset URLs in Android WebViewAssetLoader resolve cleanly relative to /assets/www/index.html
const indexPath = path.join(androidWwwDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(/(src|href)="\/assets\//g, '$1="./assets/');
  fs.writeFileSync(indexPath, html, 'utf-8');
}

console.log(`Synced built HUD bundle from dist/ to ${androidWwwDir}`);
