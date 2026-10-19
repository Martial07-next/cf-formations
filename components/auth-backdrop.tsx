'use client';

import { useEffect, useRef } from 'react';

/**
 * Fond de la page de connexion, dessiné en 2D (canvas) : une bulle jaune et
 * une bulle verte qui tournent, se rapprochent et fusionnent (métaballes),
 * avec un grain léger. Plus lent si le système demande moins de mouvement.
 */
export function AuthBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;

    // Champ calculé en basse résolution puis agrandi (flou CSS) : fluide partout.
    const SCALE = 7;
    let w = 0;
    let h = 0;
    let img: ImageData | null = null;
    const resize = () => {
      w = Math.max(80, Math.ceil(window.innerWidth / SCALE));
      h = Math.max(80, Math.ceil(window.innerHeight / SCALE));
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    // Grain : petite tuile de bruit, déplacée à chaque image.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 160;
    const tctx = tile.getContext('2d');
    if (tctx && grainRef.current) {
      const n = tctx.createImageData(160, 160);
      for (let i = 0; i < n.data.length; i += 4) {
        const v = Math.random() * 255;
        n.data[i] = n.data[i + 1] = n.data[i + 2] = v;
        n.data[i + 3] = 255;
      }
      tctx.putImageData(n, 0, 0);
      grainRef.current.style.backgroundImage = `url(${tile.toDataURL()})`;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const speed = reduced ? 0.35 : 1;
    const bg = [11, 18, 13];
    const yellow = [255, 236, 0];
    const green = [8, 235, 96];
    let raf = 0;
    let t0 = performance.now();
    let elapsed = 0;

    const frame = (now: number) => {
      elapsed += (now - t0) * speed;
      t0 = now;
      const t = elapsed / 1000;
      if (!img) return;
      const d = img.data;
      const m = Math.min(w, h);
      // Trajectoires : elles tournent autour du centre et se croisent régulièrement.
      const cx = w / 2;
      const cy = h / 2;
      const ax = w * 0.3;
      const ay = h * 0.26;
      const x1 = cx + ax * Math.cos(t * 0.31) + w * 0.05 * Math.sin(t * 0.71);
      const y1 = cy + ay * Math.sin(t * 0.43) + h * 0.04 * Math.cos(t * 0.57);
      const x2 = cx - ax * Math.cos(t * 0.29 + 0.6) + w * 0.05 * Math.cos(t * 0.63);
      const y2 = cy - ay * Math.sin(t * 0.37 + 0.4) + h * 0.04 * Math.sin(t * 0.51);
      const r1 = m * (0.3 + 0.03 * Math.sin(t * 0.9));
      const r2 = m * (0.28 + 0.03 * Math.cos(t * 0.8));
      const r1s = r1 * r1;
      const r2s = r2 * r2;

      let i = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx1 = x - x1;
          const dy1 = y - y1;
          const dx2 = x - x2;
          const dy2 = y - y2;
          const f1 = r1s / (dx1 * dx1 + dy1 * dy1 + 1);
          const f2 = r2s / (dx2 * dx2 + dy2 * dy2 + 1);
          const f = f1 + f2;
          // Bord doux autour du seuil (fusion « goutte d'eau »), cœur plus lumineux.
          let a = (f - 0.75) / 0.6;
          a = a < 0 ? 0 : a > 1 ? 1 : a * a * (3 - 2 * a);
          const glow = f > 1 ? Math.min(0.35, (f - 1) * 0.12) : 0;
          const k = f2 / (f + 1e-6); // part de vert
          const r = yellow[0] + (green[0] - yellow[0]) * k;
          const g = yellow[1] + (green[1] - yellow[1]) * k;
          const b = yellow[2] + (green[2] - yellow[2]) * k;
          d[i] = bg[0] + (r + (255 - r) * glow - bg[0]) * a;
          d[i + 1] = bg[1] + (g + (255 - g) * glow - bg[1]) * a;
          d[i + 2] = bg[2] + (b + (255 - b) * glow - bg[2]) * a;
          d[i + 3] = 255;
          i += 4;
        }
      }
      ctx.putImageData(img, 0, 0);
      if (grainRef.current) grainRef.current.style.backgroundPosition = `${(Math.random() * 160) | 0}px ${(Math.random() * 160) | 0}px`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Onglet caché : pause.
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (document.visibilityState === 'visible') {
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <div className="auth-bg" aria-hidden>
      <canvas ref={canvasRef} className="auth-canvas" />
      <div ref={grainRef} className="auth-grain2" />
    </div>
  );
}
