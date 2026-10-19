/**
 * Chargement d'une page : rien si la page arrive vite ; au-delà de ~0,35 s,
 * l'éclair CF animé apparaît (avec la silhouette de la page derrière).
 */
export default function Loading() {
  return (
    <main className="page-loading" aria-busy="true" aria-live="polite">
      <section className="content page-loading-ghost" aria-hidden>
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-block" />
      </section>
      <div className="loader">
        <svg className="loader-bolt" viewBox="360 0 290 293" aria-hidden>
          <defs>
            <linearGradient id="loader-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff200" />
              <stop offset="1" stopColor="#08fa64" />
            </linearGradient>
            <linearGradient id="loader-shine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset=".5" stopColor="#fff" stopOpacity=".85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <clipPath id="loader-clip">
              <path d="M508.2,6.76l133.02.85c4.91.03,7.35,5.97,3.88,9.45l-137.59,137.59c-1.04,1.04-2.45,1.62-3.91,1.62h-133.87c-4.93,0-7.4-5.96-3.91-9.45L504.26,8.38c1.05-1.05,2.47-1.63,3.95-1.62ZM505.89,160.43v120.71c0,4.93,5.96,7.4,9.45,3.91l120.59-120.59c3.48-3.48,1.02-9.44-3.91-9.45l-120.59-.12c-3.06,0-5.54,2.48-5.54,5.53Z" />
            </clipPath>
          </defs>
          <path className="loader-bolt-base" d="M508.2,6.76l133.02.85c4.91.03,7.35,5.97,3.88,9.45l-137.59,137.59c-1.04,1.04-2.45,1.62-3.91,1.62h-133.87c-4.93,0-7.4-5.96-3.91-9.45L504.26,8.38c1.05-1.05,2.47-1.63,3.95-1.62ZM505.89,160.43v120.71c0,4.93,5.96,7.4,9.45,3.91l120.59-120.59c3.48-3.48,1.02-9.44-3.91-9.45l-120.59-.12c-3.06,0-5.54,2.48-5.54,5.53Z" fill="url(#loader-g)" />
          <g clipPath="url(#loader-clip)">
            <rect className="loader-shine" x="200" y="-40" width="140" height="380" fill="url(#loader-shine)" />
          </g>
        </svg>
        <p className="loader-text">
          Chargement<span className="loader-dots"><i>.</i><i>.</i><i>.</i></span>
        </p>
        <span className="loader-bar"><i /></span>
        <span className="sr-only">Chargement de la page…</span>
      </div>
    </main>
  );
}
