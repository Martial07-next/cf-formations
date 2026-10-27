'use client';

import { useEffect, useState } from 'react';

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);

/** Heure de Paris en direct (mise à jour chaque seconde). */
export function LiveClock({ className = 'live-clock' }: { className?: string }) {
  // Rien au rendu serveur : l'heure s'affiche dès l'ouverture, sans décalage.
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNow(fmt(new Date()));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);
  const [h, m, s] = (now || '--:--:--').split(':');
  return (
    <time className={className} aria-label={now ? `Il est ${h} h ${m}` : undefined} suppressHydrationWarning>
      <span className="live-clock-dot" aria-hidden />
      <span className="live-clock-hm">{h}<span className="live-clock-sep">:</span>{m}</span>
      <span className="live-clock-s">{s}</span>
    </time>
  );
}
