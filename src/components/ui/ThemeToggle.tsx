import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Alterna claro/escuro. O rotulo diz para onde o clique leva, nao onde
 * estamos -- e o que o leitor de tela precisa anunciar.
 */
export function ThemeToggle({ className, compact }: { className?: string; compact?: boolean }) {
  const { theme, followsSystem, toggleTheme } = useTheme();
  const goingTo = theme === 'light' ? 'escuro' : 'claro';
  const Icon = theme === 'light' ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Mudar para o tema ${goingTo}`}
      title={followsSystem ? `Seguindo o sistema · mudar para o tema ${goingTo}` : `Mudar para o tema ${goingTo}`}
      className={cn(
        compact
          ? 'grid size-10 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-elevated hover:text-ink'
          : 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-elevated hover:text-ink',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {!compact && <span>Tema {theme === 'light' ? 'claro' : 'escuro'}</span>}
    </button>
  );
}
