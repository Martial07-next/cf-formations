'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Trash2 } from 'lucide-react';
import { EventForm, EventIcon } from '@/components/planning-events';
import { deleteEvent } from '@/app/evenements/actions';
import { askConfirm } from '@/lib/confirm-dialog';
import { EVENT_KINDS, type PlanningEvent } from '@/lib/events';

type Trainer = { id: string; full_name: string; color: string | null; status?: string | null };

/**
 * Évènements d'un parcours (migration 49) : créés ici, ils restent des
 * évènements du planning et s'affichent aussi dans « Semaine par semaine ».
 */
function useEventDialog(programId: string, trainers: Trainer[], defaultDay: string) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [event, setEvent] = useState<PlanningEvent | null | undefined>(undefined);
  const open = (e: PlanningEvent | null) => {
    setEvent(e);
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const dialog = (
    <dialog ref={ref} className="modal" aria-label="Évènement du parcours" onClose={() => setEvent(undefined)}>
      {event !== undefined && (
        <EventForm
          key={event?.id || 'new'}
          event={event}
          defaultDay={defaultDay}
          trainers={trainers}
          poecId={programId}
          onDone={() => {
            ref.current?.close();
            router.refresh();
          }}
          onCancel={() => ref.current?.close()}
        />
      )}
    </dialog>
  );
  return { open, dialog };
}

export function ProgramEventButton({ programId, trainers, defaultDay }: { programId: string; trainers: Trainer[]; defaultDay: string }) {
  const { open, dialog } = useEventDialog(programId, trainers, defaultDay);
  return (
    <>
      <button type="button" className="small" onClick={() => open(null)}>
        <CalendarPlus size={14} aria-hidden /> Ajouter un évènement
      </button>
      {dialog}
    </>
  );
}

const hm = (t: string | null) => (t ? t.slice(0, 5).replace(':', 'h') : '');
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Évènement dans une semaine du parcours : cliquable pour le modifier. */
export function ProgramEventItem({ event, programId, trainers }: { event: PlanningEvent; programId: string; trainers: Trainer[] }) {
  const { open, dialog } = useEventDialog(programId, trainers, event.start_date);
  const router = useRouter();
  const [pending, start] = useTransition();
  const kind = EVENT_KINDS.find((k) => k.value === event.kind);
  return (
    <>
      <div className="poec-item event" style={{ ['--c' as any]: kind?.color || '#7b8797' }}>
        <EventIcon kind={event.kind} size={14} />
        <button type="button" className="poec-event-open" onClick={() => open(event)}>
          <strong>{event.title}</strong>
          <small>
            {kind?.label || 'Évènement'} · {event.start_date === event.end_date ? dm(event.start_date) : `du ${dm(event.start_date)} au ${dm(event.end_date)}`}
            {event.start_time ? ` · ${hm(event.start_time)}${event.end_time ? `–${hm(event.end_time)}` : ''}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </small>
        </button>
        <button
          type="button"
          className="icon ghost small"
          aria-label={`Supprimer ${event.title}`}
          disabled={pending}
          onClick={async () => {
            if (!(await askConfirm(`Supprimer l’évènement « ${event.title} » ? Il disparaît aussi du planning.`, { confirmLabel: 'Supprimer' }))) return;
            start(async () => {
              const res = await deleteEvent(event.id);
              if (res.ok) router.refresh();
            });
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
      {dialog}
    </>
  );
}
