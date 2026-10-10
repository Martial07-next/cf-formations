'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, CheckCircle2, Download, Loader2, MousePointer2, PenLine, RotateCcw, Type, X } from 'lucide-react';
import { saveEntry, documentUrl } from '@/app/dossier/actions';
import { SignaturePad, type SignaturePadHandle } from '@/components/signature-pad';
import type { EntryData, Mark } from '@/lib/pdf-dossier';

type Widget = {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'select';
  multiline: boolean;
  exportValue: string;
  options: { value: string; label: string }[];
  readOnly: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  initial: string | boolean;
};
type PageView = { img: string; width: number; height: number; scale: number; widgets: Widget[] };
type Tool = 'fill' | 'text' | 'check' | 'signature';

const uid = () => Math.random().toString(36).slice(2, 10);

/** Chargement de pdf.js (rendu des pages) uniquement dans le navigateur. */
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs;
}

async function renderPages(bytes: ArrayBuffer, targetWidth: number): Promise<PageView[]> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const out: PageView[] = [];
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = targetWidth / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    // Les champs de formulaire sont affichés par nos propres zones de saisie.
    await page.render({ canvasContext: ctx, viewport, annotationMode: pdfjs.AnnotationMode.DISABLE }).promise;
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    const annotations: any[] = await page.getAnnotations({ intent: 'display' });
    const widgets: Widget[] = annotations
      .filter((a) => a.subtype === 'Widget' && a.fieldName && !a.hidden && a.fieldType !== 'Sig' && !a.pushButton)
      .map((a) => {
        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(a.rect);
        const type: Widget['type'] =
          a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Ch' ? 'select' : a.radioButton ? 'radio' : 'checkbox';
        const exportValue = String(a.buttonValue ?? a.exportValue ?? 'Yes');
        const fv = a.fieldValue;
        const initial: string | boolean =
          type === 'checkbox' ? Boolean(fv && fv !== 'Off') : type === 'radio' ? (fv && fv !== 'Off' ? String(fv) : '') : Array.isArray(fv) ? String(fv[0] ?? '') : String(fv ?? '');
        return {
          name: String(a.fieldName),
          type,
          multiline: Boolean(a.multiLine),
          exportValue,
          options: (a.options || []).map((o: any) => ({ value: String(o.exportValue ?? o.displayValue), label: String(o.displayValue ?? o.exportValue) })),
          readOnly: Boolean(a.readOnly),
          left: Math.min(x1, x2) / viewport.width,
          top: Math.min(y1, y2) / viewport.height,
          width: Math.abs(x2 - x1) / viewport.width,
          height: Math.abs(y2 - y1) / viewport.height,
          initial,
        };
      });
    out.push({ img: URL.createObjectURL(blob), width: viewport.width, height: viewport.height, scale, widgets });
  }
  return out;
}

/**
 * Remplissage d'un document du dossier directement sur le PDF :
 * champs du formulaire (s'il y en a), textes libres, coches et signatures.
 * Enregistrement automatique à chaque modification.
 */
export function PdfFiller({
  sessionId,
  documentId,
  title,
  initialData,
  initialCompleted,
  canEdit,
  onClose,
  onSaved,
  loadFile,
}: {
  sessionId: string;
  documentId: string;
  title: string;
  initialData: EntryData | null;
  initialCompleted: boolean;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (data: EntryData, completed: boolean) => void;
  /** Chargement du fichier (par défaut : lien temporaire du stockage). */
  loadFile?: () => Promise<ArrayBuffer>;
}) {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<PageView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string | boolean>>(initialData?.fields || {});
  const [marks, setMarks] = useState<Mark[]>(initialData?.marks || []);
  const [tool, setTool] = useState<Tool>('fill');
  const [textSize, setTextSize] = useState(11);
  const [completed, setCompleted] = useState(initialCompleted);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pendingSig, setPendingSig] = useState<{ page: number; x: number; y: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const sigDialog = useRef<HTMLDialogElement>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  const editable = canEdit && !completed;

  // Chargement du fichier et rendu des pages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let buf: ArrayBuffer;
        if (loadFile) buf = await loadFile();
        else {
          const res = await documentUrl(documentId);
          if (!res.ok) throw new Error(res.error);
          const file = await fetch(res.url);
          if (!file.ok) throw new Error('Fichier introuvable dans le stockage.');
          buf = await file.arrayBuffer();
        }
        if (cancelled) return;
        setBytes(buf);
        const width = Math.min(900, (wrap.current?.clientWidth || 900) - 24);
        const views = await renderPages(buf, Math.max(320, width));
        if (cancelled) return;
        setPages(views);
        // Valeurs déjà présentes dans le PDF, si rien n'a encore été saisi.
        setFields((f) => {
          const next = { ...f };
          for (const p of views) for (const w of p.widgets) if (next[w.name] === undefined && w.initial !== '' && w.initial !== false) next[w.name] = w.initial;
          return next;
        });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Impossible d’ouvrir le document.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => () => pages?.forEach((p) => URL.revokeObjectURL(p.img)), [pages]);

  const data: EntryData = useMemo(() => ({ fields, marks }), [fields, marks]);

  // Enregistrement automatique (1 s après la dernière modification).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!canEdit) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      const res = await saveEntry(sessionId, documentId, data);
      if (res.ok) {
        setSaveState('saved');
        setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
        onSaved?.(data, completed);
      } else {
        setSaveState('error');
        setError(res.error);
      }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const setField = (name: string, value: string | boolean) => setFields((f) => ({ ...f, [name]: value }));
  const updateMark = (id: string, patch: Partial<Mark>) => setMarks((list) => list.map((m) => (m.id === id ? ({ ...m, ...patch } as Mark) : m)));
  const removeMark = (id: string) => setMarks((list) => list.filter((m) => m.id !== id));

  function onPageClick(e: React.MouseEvent<HTMLDivElement>, pageIndex: number) {
    if (!editable || tool === 'fill') return;
    if ((e.target as HTMLElement).closest('.pf-widget, .pf-mark')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (tool === 'text') {
      const id = uid();
      const p = pages![pageIndex];
      setMarks((list) => [...list, { id, kind: 'text', page: pageIndex, x, y: Math.max(0, y - (textSize * p.scale * 0.6) / p.height), text: '', size: textSize }]);
      setFocusId(id);
    } else if (tool === 'check') {
      const p = pages![pageIndex];
      const size = 12;
      setMarks((list) => [
        ...list,
        { id: uid(), kind: 'check', page: pageIndex, x: x - (size * p.scale) / 2 / p.width, y: y - (size * p.scale) / 2 / p.height, size },
      ]);
    } else if (tool === 'signature') {
      setPendingSig({ page: pageIndex, x, y });
      sigDialog.current?.showModal();
    }
  }

  function placeSignature() {
    const image = pad.current?.toDataURL();
    if (!image || !pendingSig || !pages) return;
    const img = new Image();
    img.onload = () => {
      const p = pages[pendingSig.page];
      const w = 0.24;
      const h = (w * p.width * (img.height / img.width)) / p.height;
      setMarks((list) => [...list, { id: uid(), kind: 'signature', page: pendingSig.page, x: Math.min(pendingSig.x, 1 - w), y: Math.min(pendingSig.y, 1 - h), w, h, image }]);
      setPendingSig(null);
      setTool('fill');
      sigDialog.current?.close();
    };
    img.src = image;
  }

  /** Déplacement d'une marque à la souris / au doigt. */
  const startDrag = useCallback(
    (e: React.PointerEvent, mark: Mark) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      const layer = (e.currentTarget as HTMLElement).closest('.pf-layer') as HTMLElement;
      const r = layer.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, mx: mark.x, my: mark.y };
      const move = (ev: PointerEvent) => {
        updateMark(mark.id, {
          x: Math.min(0.98, Math.max(0, start.mx + (ev.clientX - start.x) / r.width)),
          y: Math.min(0.98, Math.max(0, start.my + (ev.clientY - start.y) / r.height)),
        });
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable]
  );

  function setDone(value: boolean) {
    startTransition(async () => {
      const res = await saveEntry(sessionId, documentId, data, value);
      if (!res.ok) setError(res.error);
      else {
        setCompleted(value);
        onSaved?.(data, value);
      }
    });
  }

  async function download() {
    if (!bytes) return;
    try {
      const { fillDocumentPdf, downloadPdf } = await import('@/lib/pdf-dossier');
      downloadPdf(await fillDocumentPdf(bytes, data), `${title}.pdf`);
    } catch (e: any) {
      setError(e?.message || 'Téléchargement impossible.');
    }
  }

  const toolButton = (t: Tool, icon: React.ReactNode, label: string) => (
    <button type="button" className={`small${tool === t ? ' primary' : ''}`} aria-pressed={tool === t} onClick={() => setTool(t)} disabled={!editable}>
      {icon} {label}
    </button>
  );

  return (
    <div className="pf">
      <div className="pf-bar">
        <div className="pf-title">
          <strong>{title}</strong>
          <span className="hint">
            {completed ? (
              <span className="badge validee"><CheckCircle2 size={12} aria-hidden /> Terminé</span>
            ) : saveState === 'saving' ? (
              <><Loader2 size={12} className="spin" aria-hidden /> Enregistrement…</>
            ) : saveState === 'saved' ? (
              <>Enregistré automatiquement à {savedAt}</>
            ) : saveState === 'error' ? (
              'Non enregistré'
            ) : canEdit ? (
              'Chaque modification est enregistrée automatiquement'
            ) : (
              'Lecture seule'
            )}
          </span>
        </div>
        {canEdit && (
          <div className="pf-tools" role="toolbar" aria-label="Outils">
            {toolButton('fill', <MousePointer2 size={14} aria-hidden />, 'Remplir')}
            {toolButton('text', <Type size={14} aria-hidden />, 'Texte')}
            {toolButton('check', <Check size={14} aria-hidden />, 'Coche')}
            {toolButton('signature', <PenLine size={14} aria-hidden />, 'Signature')}
            {tool === 'text' && (
              <select aria-label="Taille du texte" value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} className="input">
                {[8, 9, 10, 11, 12, 14, 16].map((n) => <option key={n} value={n}>{n} pt</option>)}
              </select>
            )}
          </div>
        )}
        <div className="row-actions">
          <button type="button" className="small" onClick={download} disabled={!bytes}><Download size={14} aria-hidden /> PDF</button>
          {canEdit &&
            (completed ? (
              <button type="button" className="small" onClick={() => setDone(false)} disabled={isPending}><RotateCcw size={14} aria-hidden /> Rouvrir</button>
            ) : (
              <button type="button" className="small primary" onClick={() => setDone(true)} disabled={isPending || !pages}><CheckCircle2 size={14} aria-hidden /> Terminé</button>
            ))}
          <button type="button" className="icon ghost" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
        </div>
      </div>
      {editable && tool !== 'fill' && (
        <p className="pf-help" role="status">
          {tool === 'text' ? 'Clique sur le document à l’endroit où écrire.' : tool === 'check' ? 'Clique sur une case pour la cocher.' : 'Clique à l’endroit où signer.'}
        </p>
      )}
      {error && <div role="alert" className="alert alert-error" style={{ margin: '8px 16px' }}>{error}</div>}

      <div className="pf-pages" ref={wrap}>
        {!pages && !error && <p className="hint" style={{ padding: 24 }}><Loader2 size={14} className="spin" aria-hidden /> Ouverture du document…</p>}
        {pages?.map((p, i) => (
          <div key={i} className="pf-page" style={{ width: p.width, height: p.height }}>
            <img src={p.img} alt={`Page ${i + 1}`} width={p.width} height={p.height} draggable={false} />
            <div className={`pf-layer${editable && tool !== 'fill' ? ' placing' : ''}`} onClick={(e) => onPageClick(e, i)}>
              {p.widgets.map((w, k) => {
                const style = { left: `${w.left * 100}%`, top: `${w.top * 100}%`, width: `${w.width * 100}%`, height: `${w.height * 100}%`, fontSize: Math.max(9, Math.min(14, w.height * p.height * 0.62)) };
                const disabled = !editable || w.readOnly;
                if (w.type === 'checkbox')
                  return (
                    <input key={k} type="checkbox" className="pf-widget pf-check" style={style} aria-label={w.name} disabled={disabled}
                      checked={fields[w.name] === true || fields[w.name] === 'true'} onChange={(e) => setField(w.name, e.target.checked)} />
                  );
                if (w.type === 'radio')
                  return (
                    <input key={k} type="radio" className="pf-widget pf-check" style={style} aria-label={`${w.name} : ${w.exportValue}`} disabled={disabled}
                      name={`pf-${documentId}-${w.name}`} checked={fields[w.name] === w.exportValue} onChange={() => setField(w.name, w.exportValue)} />
                  );
                if (w.type === 'select')
                  return (
                    <select key={k} className="pf-widget" style={style} aria-label={w.name} disabled={disabled} value={String(fields[w.name] ?? '')} onChange={(e) => setField(w.name, e.target.value)}>
                      <option value="" />
                      {w.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  );
                return w.multiline ? (
                  <textarea key={k} className="pf-widget" style={style} aria-label={w.name} disabled={disabled} value={String(fields[w.name] ?? '')} onChange={(e) => setField(w.name, e.target.value)} />
                ) : (
                  <input key={k} className="pf-widget" style={style} aria-label={w.name} disabled={disabled} value={String(fields[w.name] ?? '')} onChange={(e) => setField(w.name, e.target.value)} />
                );
              })}

              {marks.filter((m) => m.page === i).map((m) => {
                const base = { left: `${m.x * 100}%`, top: `${m.y * 100}%` };
                if (m.kind === 'text')
                  return (
                    <div key={m.id} className="pf-mark pf-text" style={base}>
                      {editable && <span className="pf-grip" onPointerDown={(e) => startDrag(e, m)} title="Déplacer" aria-hidden>⠿</span>}
                      <textarea
                        autoFocus={focusId === m.id}
                        aria-label="Texte"
                        readOnly={!editable}
                        rows={Math.max(1, m.text.split('\n').length)}
                        value={m.text}
                        style={{ fontSize: m.size * p.scale, width: `${Math.max(6, ...m.text.split('\n').map((l) => l.length + 1))}ch` }}
                        onChange={(e) => updateMark(m.id, { text: e.target.value })}
                        onBlur={() => !m.text.trim() && removeMark(m.id)}
                      />
                      {editable && <button type="button" className="pf-del" aria-label="Supprimer ce texte" onClick={() => removeMark(m.id)}><X size={11} /></button>}
                    </div>
                  );
                if (m.kind === 'check')
                  return (
                    <div key={m.id} className="pf-mark pf-tick" style={{ ...base, width: m.size * p.scale, height: m.size * p.scale }} onPointerDown={(e) => startDrag(e, m)}>
                      <Check size={m.size * p.scale} strokeWidth={3} aria-hidden />
                      {editable && <button type="button" className="pf-del" aria-label="Supprimer cette coche" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeMark(m.id)}><X size={11} /></button>}
                    </div>
                  );
                return (
                  <div key={m.id} className="pf-mark pf-sig" style={{ ...base, width: `${m.w * 100}%`, height: `${m.h * 100}%` }} onPointerDown={(e) => startDrag(e, m)}>
                    <img src={m.image} alt="Signature" draggable={false} />
                    {editable && <button type="button" className="pf-del" aria-label="Supprimer cette signature" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeMark(m.id)}><X size={11} /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <dialog ref={sigDialog} className="modal" aria-labelledby="pf-sig-title" onClose={() => setPendingSig(null)}>
        <div className="modal-head">
          <h2 id="pf-sig-title">Signature</h2>
          <button className="icon ghost" onClick={() => sigDialog.current?.close()} aria-label="Fermer"><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 12 }}>
          <SignaturePad ref={pad} height={180} />
        </div>
        <div className="modal-foot">
          <button type="button" onClick={() => sigDialog.current?.close()}>Annuler</button>
          <button type="button" className="primary" onClick={placeSignature}>Placer la signature</button>
        </div>
      </dialog>
    </div>
  );
}
