import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import type { Profile } from '@shared/schemas/profile';
import { supabase } from '@/lib/supabase';
import { useUpdateProfile } from '@/hooks/queries';
import { useToast } from '@/providers/ToastProvider';
import { initials } from '@/lib/format';
import { cn } from '@/lib/cn';

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Foto de perfil. Salva direto no Storage do Supabase (bucket `avatars`,
 * isolado por usuário via RLS) e grava a URL pública no perfil.
 * Sem `capture` no input: o navegador mobile oferece câmera, galeria e
 * arquivos — decisão do usuário, não nossa (§32).
 */
export function AvatarUploader({ profile }: { profile: Profile }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const update = useUpdateProfile();
  const toast = useToast();

  const displayName = profile.fullName || profile.email;
  const avatarSrc = preview ?? profile.avatarUrl;

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!file) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error('Formato não suportado', 'Use JPG, PNG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Arquivo muito grande', 'O limite é 5 MB.');
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);

    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust: o caminho é sempre o mesmo (upsert), sem isso o navegador
      // continuaria mostrando a foto antiga por causa do cache da URL.
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = profile;
      await new Promise<void>((resolve, reject) => {
        update.mutate(
          { ...rest, avatarUrl: publicUrl },
          { onSuccess: () => resolve(), onError: (err) => reject(err) },
        );
      });

      toast.success('Foto atualizada');
    } catch (err) {
      toast.error('Não foi possível enviar a foto', err instanceof Error ? err.message : undefined);
      setPreview(null);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div
          className={cn(
            'grid size-16 place-items-center overflow-hidden rounded-full bg-elevated text-lg font-semibold text-ink-muted',
            uploading && 'opacity-60',
          )}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt={displayName} className="size-full object-cover" />
          ) : (
            initials(displayName)
          )}
        </div>
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          aria-label="Alterar foto de perfil"
          title="Escolher da galeria ou tirar foto"
          className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full border-2 border-surface bg-accent text-white shadow-sm transition hover:bg-accent-hover disabled:opacity-70"
        >
          {uploading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Camera className="size-3.5" aria-hidden />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="sr-only"
          onChange={handleFile}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{displayName}</p>
        <button
          type="button"
          onClick={handlePick}
          disabled={uploading}
          className="text-xs text-accent-ink hover:underline disabled:opacity-70"
        >
          {uploading ? 'Enviando…' : 'Alterar foto'}
        </button>
      </div>
    </div>
  );
}
