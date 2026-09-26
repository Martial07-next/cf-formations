import { createClient } from '@/lib/supabase/server';
import Papa from 'papaparse';

export async function GET() {
  const supabase = await createClient();
  const { data: trainees } = await supabase
    .from('trainees')
    .select('full_name, email, company, session_trainees(status, sessions(title, start_at))')
    .order('full_name');

  const rows = (trainees || []).map((t: any) => ({
    Nom: t.full_name,
    Email: t.email || '',
    Entreprise: t.company || '',
    'Nb sessions': (t.session_trainees || []).length,
    Sessions: (t.session_trainees || [])
      .map((l: any) => `${l.sessions?.title ?? '?'} (${l.status === 'validee' ? 'validé' : 'en attente'})`)
      .join(' | '),
  }));

  const csv = Papa.unparse(rows, { delimiter: ';' });
  const bom = '\uFEFF';

  return new Response(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stagiaires-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
