'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

/** Image de la signature recadrée sur le tracé (marge de 6 px). */
function trimmed(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')!;
  const { width, height } = c;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  // Taille raisonnable pour le stockage (largeur max 400 px).
  const scale = Math.min(1, 400 / (maxX - minX + 1));
  out.width = Math.round((maxX - minX + 1) * scale);
  out.height = Math.round((maxY - minY + 1) * scale);
  out.getContext('2d')!.drawImage(c, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

export type SignaturePadHandle = { toDataURL: () => string | null; clear: () => void };

/** Zone de signature au doigt, au stylet ou à la souris. */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (empty: boolean) => void }>(
  function SignaturePad({ height = 180, onChange }, ref) {
    const canvas = useRef<HTMLCanvasElement>(null);
    // Le tracé est gardé en mémoire (liste de traits) : redessiné à chaque
    // redimensionnement et effacé à 100 % (rien ne reste sur le canvas).
    const strokes = useRef<{ x: number; y: number }[][]>([]);
    const drawing = useRef(false);
    const [empty, setEmpty] = useState(true);

    const mark = (isEmpty: boolean) => {
      setEmpty(isEmpty);
      onChange?.(isEmpty);
    };

    function redraw() {
      const c = canvas.current;
      if (!c) return;
      const ratio = window.devicePixelRatio || 1;
      const ctx = c.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f3a';
      ctx.fillStyle = '#0b1f3a';
      for (const st of strokes.current) {
        if (st.length === 1) {
          ctx.beginPath();
          ctx.arc(st[0].x, st[0].y, 1.1, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(st[0].x, st[0].y);
        for (const p of st.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }

    // Taille réelle du canvas = taille affichée (y compris dans une fenêtre ouverte plus tard).
    useEffect(() => {
      const c = canvas.current!;
      const fit = () => {
        const ratio = window.devicePixelRatio || 1;
        const w = Math.round(c.clientWidth * ratio);
        const h = Math.round(height * ratio);
        if (w && (c.width !== w || c.height !== h)) {
          c.width = w;
          c.height = h;
          redraw();
        }
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(c);
      return () => ro.disconnect();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [height]);

    function clear() {
      strokes.current = [];
      drawing.current = false;
      redraw();
      mark(true);
    }

    const point = (e: React.PointerEvent) => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    useImperativeHandle(ref, () => ({
      toDataURL: () => (empty || !strokes.current.length ? null : trimmed(canvas.current!)),
      clear,
    }));

    return (
      <div className="signature-pad">
        <canvas
          ref={canvas}
          style={{ height }}
          aria-label="Zone de signature"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([point(e)]);
            redraw();
            if (empty) mark(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            strokes.current[strokes.current.length - 1]?.push(point(e));
            redraw();
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
          onLostPointerCapture={() => {
            drawing.current = false;
          }}
        />
        <div className="signature-pad-foot">
          <span className="hint">{empty ? 'Signe dans le cadre' : 'Signature prête'}</span>
          <button type="button" className="small ghost" onClick={clear}>
            <Eraser size={14} aria-hidden /> Effacer
          </button>
        </div>
      </div>
    );
  }
);
