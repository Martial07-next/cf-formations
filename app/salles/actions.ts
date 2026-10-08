'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { requireManager, FORBIDDEN } from '@/lib/auth';

export async function createRoom(formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = String(formData.get('name') || '').trim();
  const capacity = Number(formData.get('capacity') || 0);
  const location = String(formData.get('location') || '').trim() || null;
  const equipment = String(formData.get('equipment') || '').trim() || null;
  const status = String(formData.get('status') || 'disponible');
  if (!name || capacity <= 0) return { ok: false, error: 'Nom et capacité (> 0) requis.' };
  const { error } = await supabase.from('rooms').insert({ name, capacity, location, equipment, status });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteRoom(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('rooms').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  revalidatePath('/');
  return { ok: true };
}

export async function updateRoom(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const name = String(formData.get('name') || '').trim();
  const capacity = Number(formData.get('capacity') || 0);
  const location = String(formData.get('location') || '').trim() || null;
  const equipment = String(formData.get('equipment') || '').trim() || null;
  if (!name || capacity <= 0) return { ok: false, error: 'Nom et capacité (> 0) requis.' };
  const { error } = await supabase.from('rooms').update({ name, capacity, location, equipment }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  revalidatePath('/');
  return { ok: true };
}

export async function updateRoomStatus(id: string, status: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('rooms').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/salles');
  return { ok: true };
}

function readWorkshop(formData: FormData) {
  const get = (k: string) => String(formData.get(k) ?? '').trim();
  return { name: get('name'), equipment: get('equipment') || null, modules: get('modules') || null };
}

function refreshWorkshops() {
  revalidatePath('/salles');
  revalidatePath('/');
}

export async function createWorkshop(roomId: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const w = readWorkshop(formData);
  if (!w.name) return { ok: false, error: "Le nom de l'atelier est requis." };
  const supabase = await createClient();
  const { error } = await supabase.from('room_workshops').insert({ ...w, room_id: roomId });
  if (error) return { ok: false, error: error.message };
  refreshWorkshops();
  return { ok: true };
}

export async function updateWorkshop(id: string, formData: FormData) {
  if (!(await requireManager())) return FORBIDDEN;
  const w = readWorkshop(formData);
  if (!w.name) return { ok: false, error: "Le nom de l'atelier est requis." };
  const supabase = await createClient();
  const { error } = await supabase.from('room_workshops').update(w).eq('id', id);
  if (error) return { ok: false, error: error.message };
  refreshWorkshops();
  return { ok: true };
}

export async function deleteWorkshop(id: string) {
  if (!(await requireManager())) return FORBIDDEN;
  const supabase = await createClient();
  const { error } = await supabase.from('room_workshops').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  refreshWorkshops();
  return { ok: true };
}
