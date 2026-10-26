// Frame the raw launcher captures in docs/assets/raw/ for the README: each
// window on a generated blue-purple gradient, with rounded corners and a soft
// drop shadow, written to docs/assets/ under the same file name.
// Usage: electron scripts/readme-images.mjs   (via `make readme-images`)
// Electron's own Chromium does the drawing (a canvas in a hidden window), so
// the output only depends on the raw PNGs and the constants below.
import { app, BrowserWindow } from 'electron';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ASSETS = path.resolve('docs/assets');
const RAW = path.join(ASSETS, 'raw');

// Pixels of the raw captures, which are 2x (750pt window -> 1500px).
const FRAME = {
  padX: 150,
  padY: 130,
  radius: 24,
  gradient: ['#8ec5fc', '#a5b4fc', '#d8b4fe'], // sky blue -> indigo -> lavender
};

/** Runs in the renderer: compose one framed PNG and return it as a data URL. */
function compose(src, f) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('cannot decode image'));
    img.onload = () => {
      const w = img.width + 2 * f.padX;
      const h = img.height + 2 * f.padY;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      // A vertical ramp painted one solid row at a time: canvas gradients are
      // dithered, which makes the PNG several times larger.
      const stops = f.gradient.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
      for (let y = 0; y < h; y++) {
        const t = (y / (h - 1)) * (stops.length - 1);
        const i = Math.min(Math.floor(t), stops.length - 2);
        const rgb = stops[i].map((a, k) => Math.round(a + (stops[i + 1][k] - a) * (t - i)));
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.fillRect(0, y, w, 1);
      }

      const shape = new Path2D();
      shape.roundRect(f.padX, f.padY, img.width, img.height, f.radius);
      // Two shadows: a wide, soft one and a tight contact one.
      for (const [blur, y, alpha] of [
        [100, 40, 0.45],
        [16, 4, 0.25],
      ]) {
        ctx.save();
        ctx.shadowColor = `rgba(20,16,60,${alpha})`;
        ctx.shadowBlur = blur;
        ctx.shadowOffsetY = y;
        ctx.fillStyle = '#000';
        ctx.fill(shape);
        ctx.restore();
      }

      ctx.save();
      ctx.clip(shape);
      ctx.drawImage(img, f.padX, f.padY);
      ctx.restore();
      // Hairline edge, as macOS draws around windows.
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.stroke(shape);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = src;
  });
}

async function main() {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const files = readdirSync(RAW).filter((f) => f.endsWith('.png')).sort();
  for (const file of files) {
    const src = `data:image/png;base64,${readFileSync(path.join(RAW, file)).toString('base64')}`;
    const url = await win.webContents.executeJavaScript(`(${compose})(${JSON.stringify(src)}, ${JSON.stringify(FRAME)})`);
    writeFileSync(path.join(ASSETS, file), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`docs/assets/${file}`);
  }
}

// Not a top-level await: an ESM main entry must finish loading before `ready` fires.
app.dock?.hide();
app
  .whenReady()
  .then(main)
  .then(
    () => app.quit(),
    (err) => {
      console.error(err);
      app.exit(1);
    },
  );
