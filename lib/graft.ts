import { dayHours, formatHours, weekdaysBetween } from '@/lib/week';

/**
 * Greffe sur une session de parcours (POEC, GEIQ, parcours personnalisé…).
 *
 * Dans un parcours, une session peut durer plus longtemps que la formation du
 * catalogue. Une personne extérieure au groupe qui s'y greffe ne suit que les
 * heures prévues au catalogue : elle est inscrite sur les premiers jours
 * (modules) jusqu'à atteindre cette durée. Le groupe du parcours garde toute
 * la session. Le bureau peut ajuster ensuite les jours suivis (modules du stagiaire).
 *
 * Renvoie un message à afficher, ou null si rien n'a été restreint.
 */
export async function graftOnCatalogHours(supabase: any, sessionId: string, traineeIds: string[]): Promise<string | null> {
  if (!traineeIds.length) return null;
  const { data: s } = await supabase
    .from('sessions')
    .select('id, poec_id, start_at, end_at, template_id, templates(duration_hours)')
    .eq('id', sessionId)
    .maybeSingle();
  const tpl = Array.isArray(s?.templates) ? s.templates[0] : s?.templates;
  const catalog = Number(tpl?.duration_hours) || 0;
  if (!s?.poec_id || !catalog) return null;

  // Personnes hors du groupe du parcours.
  const { data: members } = await supabase.from('poec_trainees').select('trainee_id').eq('program_id', s.poec_id);
  const inGroup = new Set(((members as any[]) || []).map((m) => m.trainee_id));
  const grafted = traineeIds.filter((id) => !inGroup.has(id));
  if (!grafted.length) return null;

  // Heures réelles de la session, jour par jour.
  const { data: overrides } = await supabase.from('session_days').select('day, start_time, end_time').eq('session_id', sessionId);
  const perDay = dayHours(s.start_at, s.end_at, (overrides as any[]) || []);
  const total = perDay.reduce((n, d) => n + d.minutes, 0) / 60;
  if (total <= catalog + 0.01) return null;

  // Modules de la session ; sans module, un module par jour (comme « Découper par jour »).
  let { data: mods } = await supabase.from('session_modules').select('id, name, start_day, end_day, duration_hours, position').eq('session_id', sessionId);
  if (!((mods as any[]) || []).length) {
    const days = weekdaysBetween(s.start_at, s.end_at);
    if (days.length < 2) return null;
    const { data: created, error } = await supabase
      .from('session_modules')
      .insert(days.map((day, position) => ({ session_id: sessionId, position, name: `Jour ${position + 1}`, start_day: day, end_day: day })))
      .select('id, name, start_day, end_day, duration_hours, position');
    if (error) return null;
    mods = created;
  }
  const minutesOn = (a: string, b: string) => perDay.filter((d) => d.day >= a && d.day <= b).reduce((n, d) => n + d.minutes, 0) / 60;
  const ordered = [...((mods as any[]) || [])].sort((a, b) => String(a.start_day).localeCompare(String(b.start_day)) || a.position - b.position);
  const chosen: any[] = [];
  let acc = 0;
  for (const m of ordered) {
    if (acc >= catalog - 0.01) break;
    chosen.push(m);
    acc += Number(m.duration_hours) || minutesOn(String(m.start_day).slice(0, 10), String(m.end_day).slice(0, 10));
  }
  if (!chosen.length || chosen.length >= ordered.length) return null;

  await supabase.from('session_trainee_modules').delete().eq('session_id', sessionId).in('trainee_id', grafted);
  const { error } = await supabase
    .from('session_trainee_modules')
    .insert(grafted.flatMap((trainee_id) => chosen.map((m) => ({ session_id: sessionId, trainee_id, module_id: m.id }))));
  if (error) return null;
  return `Greffe hors parcours : ${grafted.length > 1 ? `${grafted.length} stagiaires inscrits` : 'stagiaire inscrit'} sur ${formatHours(catalog)} (durée du catalogue) au lieu de ${formatHours(Math.round(total * 10) / 10)} : ${chosen.map((m) => m.name).join(', ')}. Ajustable dans les modules du stagiaire.`;
}
