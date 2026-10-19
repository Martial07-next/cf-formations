/** Affiché instantanément pendant le chargement d'une page (navigation plus réactive). */
export default function Loading() {
  return (
    <main className="page-loading" aria-busy="true" aria-live="polite">
      <section className="content">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-block" />
        <span className="sr-only">Chargement…</span>
      </section>
    </main>
  );
}
