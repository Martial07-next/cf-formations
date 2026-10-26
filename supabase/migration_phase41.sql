-- Phase 41 : fichiers des supports de cours (PDF, PowerPoint, Word…),
-- déposés dans Formations › Modifier › Supports de cours.
--   Bucket privé « supports » (50 Mo par fichier, tous formats) :
--   lecture par l'équipe (comptes avec accès), dépôt et suppression par
--   l'administration (administrateur, bureau, référent cadre).
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supports', 'supports', false, 52428800, null)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = null;

drop policy if exists "supports: read" on storage.objects;
drop policy if exists "supports: manage insert" on storage.objects;
drop policy if exists "supports: manage update" on storage.objects;
drop policy if exists "supports: manage delete" on storage.objects;
create policy "supports: read" on storage.objects for select using (bucket_id = 'supports' and public.is_member());
create policy "supports: manage insert" on storage.objects for insert with check (bucket_id = 'supports' and public.can_manage());
create policy "supports: manage update" on storage.objects for update using (bucket_id = 'supports' and public.can_manage());
create policy "supports: manage delete" on storage.objects for delete using (bucket_id = 'supports' and public.can_manage());
