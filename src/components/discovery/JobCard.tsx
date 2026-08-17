/**
 * Card de vaga descoberta (§12, §38).
 *
 * Regra visual: nada que não exista na fonte aparece como se existisse.
 * Salário ausente é exibido como "Não informado"; dado deduzido pelo sistema
 * recebe marcação própria para o usuário saber a diferença.
 */
import { useState } from 'react';
import { Building2, ChevronDown, ExternalLink, MapPin, Sparkles, Star, X } from 'lucide-react';
import type { DiscoveredJob } from '@shared/discovery/schemas';
import { SOURCE_LABEL } from '@shared/discovery/types';
import { SENIORITY_LABEL, type Seniority } from '@shared/constants';
import { recencyInfo } from '@shared/discovery/ranking';
import { Badge } from '@/components/ui/Primitives';
import { Button } from '@/components/ui/Button';
import { ScoreRing } from '@/components/ui/Score';
import { cn } from '@/lib/cn';

/** Marca visual de dado deduzido pelo JobPilot, não informado pela fonte (§4). */
function InferredMark({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-ink-faint"
      title="Deduzido pelo JobPilot a partir do texto da vaga — confirme no anúncio original."
    >
      {label}
      <span aria-hidden>≈</span>
    </span>
  );
}

export function JobCard({
  job,
  onPrepare,
  onSave,
  onDiscard,
  busy,
}: {
  job: DiscoveredJob;
  onPrepare: () => void;
  onSave: () => void;
  onDiscard: () => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const recency = recencyInfo(job.publishedAt);
  const recommended = job.matches.find((match) => match.isRecommended) ?? job.matches[0] ?? null;
  const seniorityInferred = job.fieldOrigins.seniority === 'inferred';
  const workModeInferred = job.fieldOrigins.isRemote === 'inferred';

  return (
    <article className="panel flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        {job.matchScore !== null && <ScoreRing score={job.matchScore} size={52} label={job.title} />}

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug text-ink">{job.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Building2 className="size-3" aria-hidden />
              {job.company}
            </span>
            <span aria-hidden>·</span>
            <span>{recency.label}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="shrink-0 rounded-md p-1.5 text-ink-faint transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          aria-label={`Descartar ${job.title}`}
          title="Não tenho interesse"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      {/* Local, modalidade e senioridade — omitidos quando a fonte não informa */}
      <div className="flex flex-wrap items-center gap-1.5">
        {job.location && (
          <Badge>
            <MapPin className="size-3" aria-hidden />
            {job.location}
          </Badge>
        )}
        {job.isRemote === true && (
          <Badge tone="success">{workModeInferred ? <InferredMark label="Remoto" /> : 'Remoto'}</Badge>
        )}
        {job.isHybrid === true && (
          <Badge tone="info">{workModeInferred ? <InferredMark label="Híbrido" /> : 'Híbrido'}</Badge>
        )}
        {job.seniority && (
          <Badge tone="accent">
            {seniorityInferred ? (
              <InferredMark label={SENIORITY_LABEL[job.seniority as Seniority] ?? job.seniority} />
            ) : (
              (SENIORITY_LABEL[job.seniority as Seniority] ?? job.seniority)
            )}
          </Badge>
        )}
        <Badge>{SOURCE_LABEL[job.source] ?? job.source}</Badge>
        {job.sourceCount > 1 && <Badge tone="info">Encontrada em {job.sourceCount} fontes</Badge>}
      </div>

      {job.technologies.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {job.technologies.slice(0, 8).map((tech) => (
            <span key={tech} className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-ink-muted">
              {tech}
            </span>
          ))}
          {job.technologies.length > 8 && (
            <span className="rounded bg-elevated px-1.5 py-0.5 text-[11px] text-ink-faint">
              +{job.technologies.length - 8}
            </span>
          )}
        </div>
      )}

      {/* Explicação do match — nunca só o número (§25) */}
      {recommended && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex items-center justify-between gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-left transition hover:border-line-strong"
        >
          <span className="min-w-0 text-xs text-ink-muted">
            Melhor currículo: <span className="text-ink">{recommended.resumeName}</span> ({recommended.score}%)
          </span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-ink-faint transition', expanded && 'rotate-180')} aria-hidden />
        </button>
      )}

      {expanded && recommended && (
        <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-xs">
          {recommended.matchedSkills.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-success">Atende</p>
              <p className="text-ink-muted">
                {recommended.matchedSkills.map((skill) => `✓ ${skill}`).join('   ')}
              </p>
            </div>
          )}
          {recommended.missingSkills.length > 0 && (
            <div>
              <p className="mb-1 font-medium text-warning">Lacunas</p>
              <p className="text-ink-muted">
                {recommended.missingSkills.map((skill) => `! ${skill}`).join('   ')}
              </p>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-[11px] text-ink-faint">
            <span>
              Salário:{' '}
              {job.salary ? (
                <span className="text-ink">{job.salary}</span>
              ) : (
                <span title="A fonte não publicou faixa salarial. O JobPilot não estima valores.">Não informado</span>
              )}
            </span>
            {job.publishedAt && <span>Publicada em {new Date(job.publishedAt).toLocaleDateString('pt-BR')}</span>}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
        <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
          <Button size="sm" icon={<ExternalLink />} fullWidth>
            Ver vaga
          </Button>
        </a>
        <Button size="sm" variant="primary" icon={<Sparkles />} onClick={onPrepare} disabled={busy} className="flex-1 sm:flex-none">
          Preparar
        </Button>
        <Button size="sm" icon={<Star />} onClick={onSave} disabled={busy} title="Salvar em Vagas">
          Salvar
        </Button>
      </div>
    </article>
  );
}
