-- -----------------------------------------------------------------------------
-- Foto de perfil (§13). Guardamos só a URL pública; o arquivo em si fica no
-- Storage, num bucket próprio, isolado por usuário via RLS (cada um só grava
-- dentro da própria pasta "<user_id>/...").
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text not null default ''
  check (char_length(avatar_url) <= 500);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatar_owner_write" on storage.objects;
create policy "avatar_owner_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update" on storage.objects
  for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar_owner_delete" on storage.objects;
create policy "avatar_owner_delete" on storage.objects
  for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
