import { NavLink } from 'react-router-dom';
import { LogOut, Settings, User } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  email: string;
  avatarUrl: string;
  onSignOut: () => void;
  signingOut: boolean;
}

/**
 * Menu-hambúrguer do mobile: reúne conta, tema e sair num só lugar, em vez
 * de espalhar ícones soltos no cabeçalho (§32).
 */
export function MobileMenu({ open, onClose, displayName, email, avatarUrl, onSignOut, signingOut }: MobileMenuProps) {
  return (
    <Modal open={open} onClose={onClose} title="Menu" size="sm">
      <div className="space-y-1">
        <div className="mb-2 flex items-center gap-3 rounded-lg bg-elevated p-3">
          <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-surface text-sm font-semibold text-ink-muted">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              initials(displayName)
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{displayName}</p>
            {email && email !== displayName && (
              <p className="truncate text-xs text-ink-muted">{email}</p>
            )}
          </div>
        </div>

        <NavLink
          to="/perfil"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
              isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-elevated hover:text-ink',
            )
          }
        >
          <User className="size-4 shrink-0" aria-hidden />
          Perfil
        </NavLink>

        <NavLink
          to="/configuracoes"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
              isActive ? 'bg-accent-soft font-medium text-accent-ink' : 'text-ink-muted hover:bg-elevated hover:text-ink',
            )
          }
        >
          <Settings className="size-4 shrink-0" aria-hidden />
          Configurações
        </NavLink>

        <ThemeToggle />

        <div className="my-1 border-t border-line" />

        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
        >
          <LogOut className="size-4 shrink-0" aria-hidden />
          {signingOut ? 'Saindo…' : 'Sair da conta'}
        </button>
      </div>
    </Modal>
  );
}
