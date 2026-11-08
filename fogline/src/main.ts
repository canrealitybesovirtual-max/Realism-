import * as THREE from 'three';
import './ui/ui.css';
import { CONFIG } from './config';
import { Game } from './game/Game';

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLDivElement;

function fatal(msg: string): void {
  uiRoot.innerHTML = `<div class="fatal">${msg}</div>`;
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
    alpha: false,
    depth: true
  });
} catch (err) {
  console.error(err);
  fatal('WebGL is not available on this device or browser.');
  throw err;
}
renderer.setClearColor(CONFIG.render.clearColor, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  fatal('The graphics context was lost. Reload the page to continue.');
});

const game = new Game(renderer, uiRoot);

const resize = () => game.handleResize();
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 250));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) game.pause();
  else game.resume();
});

game.start();

if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_SINGLE) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[sw] registration failed', err));
  });
}

(window as unknown as { game: Game }).game = game;
