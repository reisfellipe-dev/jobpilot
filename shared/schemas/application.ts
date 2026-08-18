import { z } from 'zod';
import { isoDateSchema, optionalText, scoreSchema, uuidSchema } from './common.js';
import { ANSWER_KINDS, APPLICATION_STATUSES } from '../constants.js';

export const applicationInputSchema = z.object({
  jobId: uuidSchema,
  resumeId: uuidSchema.nullish(),
  resumeVersionId: uuidSchema.nullish(),
  score: scoreSchema.nullish(),
  status: z.enum(APPLICATION_STATUSES).default('salva'),
  appliedAt: isoDateSchema.nullish(),
  notes: optionalText(8000),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export const applicationSchema = applicationInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof applicationSchema>;

export const applicationAnswerSchema = z.object({
  id: uuidSchema,
  applicationId: uuidSchema,
  kind: z.enum(ANSWER_KINDS),
  question: z.string(),
  answer: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type ApplicationAnswer = z.infer<typeof applicationAnswerSchema>;

export const applicationAnswerInputSchema = z.object({
  applicationId: uuidSchema,
  kind: z.enum(ANSWER_KINDS),
  question: optionalText(2000),
  answer: z.string().max(20_000),
});

/** Saida estruturada da geracao de textos de candidatura (§26). */
export const generatedAnswerSchema = z.object({
  answer: z.string().max(20_000),
  /** Itens do perfil que a IA nao encontrou e por isso marcou como AUSENTE (§18). */
  missingInfo: z.array(z.string().max(200)).max(20).default([]),
  notes: z.string().max(1000).default(''),
});
export type GeneratedAnswer = z.infer<typeof generatedAnswerSchema>;

/** Candidatura com os dados mínimos da vaga e do currículo, usada no Kanban. */
export interface ApplicationListItem extends Application {
  job: { id: string; title: string; company: string; url: string } | null;
  resume: { id: string; name: string } | null;
}

export const APPLICATION_STATUS_TONE: Record<(typeof APPLICATION_STATUSES)[number], string> = {
  salva: 'slate',
  analisada: 'blue',
  preparada: 'violet',
  enviada: 'amber',
  entrevista: 'cyan',
  oferta: 'emerald',
  recusada: 'rose',
};
