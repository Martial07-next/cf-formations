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
    const drawing = useRef(false);
    const last = useRef<{ x: number; y: number } | null>(null);
    const [empty, setEmpty] = useState(true);

    useEffect(() => {
      const c = canvas.current!;
      const ratio = window.devicePixelRatio || 1;
      c.width = c.offsetWidth * ratio;
      c.height = height * ratio;
      const ctx = c.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f3a';
    }, [height]);

    const point = (e: React.PointerEvent) => {
      const r = canvas.current!.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const mark = (isEmpty: boolean) => {
      setEmpty(isEmpty);
      onChange?.(isEmpty);
    };

    useImperativeHandle(ref, () => ({
      toDataURL: () => (empty ? null : trimmed(canvas.current!)),
      clear: () => {
        const c = canvas.current!;
        c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
        mark(true);
      },
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
            last.current = point(e);
            const ctx = canvas.current!.getContext('2d')!;
            ctx.beginPath();
            ctx.arc(last.current.x, last.current.y, 1, 0, Math.PI * 2);
            ctx.fill();
            if (empty) mark(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const p = point(e);
            const ctx = canvas.current!.getContext('2d')!;
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        <div className="signature-pad-foot">
          <span className="hint">{empty ? 'Signe dans le cadre' : 'Signature prête'}</span>
          <button
            type="button"
            className="small ghost"
            onClick={() => {
              const c = canvas.current!;
              c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
              mark(true);
            }}
          >
            <Eraser size={14} aria-hidden /> Effacer
          </button>
        </div>
      </div>
    );
  }
);
