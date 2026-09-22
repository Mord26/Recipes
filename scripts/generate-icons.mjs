import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#c7602f"/>
      <stop offset="1" stop-color="#9c4020"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="url(#bg)"/>
  <circle cx="256" cy="272" r="150" fill="#fbf8f2"/>
  <circle cx="256" cy="272" r="118" fill="#f5efe4"/>
  <circle cx="256" cy="272" r="112" fill="none" stroke="#c7602f" stroke-opacity="0.25" stroke-width="4"/>
  <g stroke="#fbf8f2" stroke-width="22" stroke-linecap="round">
    <line x1="176" y1="66" x2="176" y2="122"/>
    <line x1="256" y1="56" x2="256" y2="118"/>
    <line x1="336" y1="66" x2="336" y2="122"/>
  </g>
  <text x="256" y="308" font-family="Georgia, serif" font-size="120" text-anchor="middle" fill="#9c4020">🍲</text>
</svg>`;

await mkdir('public/icons', { recursive: true });

const source = sharp(Buffer.from(svg));
await source.clone().resize(512, 512).png().toFile('public/icons/icon-512.png');
await source.clone().resize(192, 192).png().toFile('public/icons/icon-192.png');
await source.clone().resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('icons generated');
