/** Mutations de IA. Todas passam pelo backend — o navegador nunca vê chaves (§4). */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from './queries';
import type { ResumeContent } from '@shared/schemas/resume';
import type { AnswerKind, Seniority, WorkMode } from '@shared/constants';

export interface AIMeta {
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean;
  inputTokens: number;
  outputTokens: number;
}

export interface ResumeExtractionResult {
  extraction: {
    content: ResumeContent;
    suggestedName: string;
    suggestedObjective: string;
    suggestedSeniority: Seniority | null;
    suggestedTargetRoles: string[];
    detectedLanguage: string;
    missingInfo: string[];
    confidence: number;
  };
  meta: AIMeta;
}

export interface JobExtractionResult {
  extraction: {
    company: string;
    title: string;
    location: string;
    workMode: WorkMode | 'indefinido';
    seniority: Seniority | 'indefinido';
    requirements: string[];
    niceToHave: string[];
    technologies: string[];
    benefits: string[];
    salaryRange: string;
    missingInfo: string[];
  };
  meta: AIMeta;
}

export interface AdaptationResult {
  original: ResumeContent;
  adapted: ResumeContent;
  changes: Array<{ section: string; before: string; after: string; reason: string }>;
  keywordsAdded: string[];
  missingInfo: string[];
  atsNotes: string[];
  violations: Array<{ type: string; detail: string }>;
  meta: AIMeta;
}

export interface AnswerResult {
  answer: string;
  missingInfo: string[];
  notes: string;
  meta: AIMeta;
}

function useAIMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => {
      // Toda operação de IA consome quota: mantém o painel de uso atualizado.
      void client.invalidateQueries({ queryKey: keys.usage });
    },
  });
}

export const useExtractResumeAI = () =>
  useAIMutation((text: string) => api.post<ResumeExtractionResult>('ai/extract-resume', { text }));

export const useExtractJobAI = () =>
  useAIMutation((text: string) => api.post<JobExtractionResult>('ai/extract-job', { text }));

export const useAdaptResumeAI = () =>
  useAIMutation((input: { jobId: string; resumeId: string }) =>
    api.post<AdaptationResult>('ai/adapt-resume', input),
  );

export const useGenerateAnswerAI = () =>
  useAIMutation((input: { kind: AnswerKind; jobId: string; resumeId?: string | null; question?: string }) =>
    api.post<AnswerResult>('ai/generate-answer', input),
  );
