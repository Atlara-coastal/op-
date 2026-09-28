/**
 * JocoAdmin - Build Script for Mobile (Capacitor www)
 * Copies required web assets into www/ directory for native Android (APK) and iOS (Xcode) builds.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const targetDir = path.join(__dirname, 'www');

// Compile Tailwind CSS statically (no runtime CDN compiler in the packaged app).
execSync('npx tailwindcss -i tailwind.input.css -o tailwind.build.css --minify', {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

// Ensure clean target dir
if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}
fs.mkdirSync(targetDir, { recursive: true });

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
}

// Assets to copy
const filesToCopy = ['index.html', 'styles.css', 'tailwind.build.css', 'manifest.json', 'sw.js', 'firebase-messaging-sw.js', 'instalar.html'];
const dirsToCopy = ['js', 'icons'];

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(targetDir, file));
  }
});

dirsToCopy.forEach(dir => {
  const src = path.join(__dirname, dir);
  if (fs.existsSync(src)) {
    copyRecursiveSync(src, path.join(targetDir, dir));
  }
});

console.log('✓ Build finalizado con éxito en la carpeta www/ para Android & iOS.');
