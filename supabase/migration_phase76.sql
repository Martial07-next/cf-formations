-- ============================================================
-- CF Réseaux · Migration Phase 76 : actualisation automatique des pages
-- Les pages ouvertes se mettent à jour seules quand une session, un
-- stagiaire, un évènement… change (par toi ou un collègue) : ces tables
-- sont diffusées en temps réel (Supabase Realtime). Les droits d'accès
-- (RLS) s'appliquent : chacun ne reçoit que ce qu'il peut voir.
-- Peut être relancée sans risque.
-- À exécuter dans Supabase > SQL Editor : nouvelle requête, coller, Ctrl+A, Run.
-- ============================================================

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'sessions', 'session_trainees', 'session_days', 'session_modules', 'session_trainee_modules',
    'session_day_trainers', 'session_reservations', 'planning_events', 'clothing_loans', 'trainees',
    'session_invoices', 'trainer_absences'
  ]
  loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t)
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
