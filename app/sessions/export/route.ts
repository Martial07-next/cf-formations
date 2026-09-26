import { createClient } from '@/lib/supabase/server';
import Papa from 'papaparse';

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function GET() {
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from('sessions')
    .select(
      'title, reference, status, start_at, end_at, max_trainees, rooms(name), trainers(full_name), session_trainees(status)'
    )
    .order('start_at', { ascending: false });

  const rows = (sessions || []).map((s: any) => {
    const validated = (s.session_trainees || []).filter((t: any) => t.status === 'validee').length;
    const waiting = (s.session_trainees || []).filter((t: any) => t.status === 'en_attente').length;
    return {
      Titre: s.title,
      Référence: s.reference || '',
      Statut: s.status,
      Salle: one(s.rooms)?.name || '',
      Formateur: one(s.trainers)?.full_name || '',
      Début: s.start_at,
      Fin: s.end_at,
      'Max stagiaires': s.max_trainees ?? '',
      'Stagiaires validés': validated,
      'Stagiaires en attente': waiting,
    };
  });

  const csv = Papa.unparse(rows, { delimiter: ';' });
  const bom = '\uFEFF'; // pour qu'Excel affiche correctement les accents

  return new Response(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sessions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
