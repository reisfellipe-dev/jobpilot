import { z } from 'zod';
import {
  isoDateSchema,
  optionalText,
  scoreSchema,
  seniaritySchema,
  stringList,
  text,
  urlSchema,
  uuidSchema,
  workModeSchema,
} from './common.js';
import { JOB_STATUSES } from '../constants.js';

export const jobInputSchema = z.object({
  company: optionalText(160),
  title: text(180, 1),
  description: optionalText(40_000),
  url: urlSchema,
  location: optionalText(160),
  workMode: workModeSchema.nullish(),
  seniority: seniaritySchema.nullish(),
  requirements: stringList(400, 60),
  niceToHave: stringList(400, 40),
  technologies: stringList(60, 80),
  benefits: stringList(200, 40),
  salaryRange: optionalText(120),
  postedAt: isoDateSchema.nullish(),
  status: z.enum(JOB_STATUSES).default('nova'),
  source: z.enum(['manual', 'texto', 'url']).default('manual'),
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const jobSchema = jobInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof jobSchema>;

/** Saida estruturada da analise de vaga feita pela IA (§21). */
export const jobAnalysisSchema = z.object({
  summary: z.string().max(2000).default(''),
  normalizedTitle: z.string().max(180).default(''),
  seniority: z
    .enum(['estagio', 'trainee', 'junior', 'pleno', 'senior', 'especialista', 'lead', 'gerente', 'indefinido'])
    .default('indefinido'),
  workMode: z.enum(['remoto', 'hibrido', 'presencial', 'indefinido']).default('indefinido'),
  location: z.string().max(160).default(''),
  responsibilities: z.array(z.string().max(400)).max(30).default([]),
  requiredSkills: z.array(z.string().max(80)).max(50).default([]),
  preferredSkills: z.array(z.string().max(80)).max(50).default([]),
  technologies: z.array(z.string().max(60)).max(60).default([]),
  softSkills: z.array(z.string().max(80)).max(20).default([]),
  keywords: z.array(z.string().max(60)).max(60).default([]),
  benefits: z.array(z.string().max(200)).max(30).default([]),
  minYearsExperience: z.number().min(0).max(40).nullable().default(null),
  atsNotes: z.array(z.string().max(400)).max(15).default([]),
  redFlags: z.array(z.string().max(400)).max(15).default([]),
});
export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

/** Ajuste semantico opcional produzido pela IA sobre um match (§22/§23). */
export const semanticAssessmentSchema = z.object({
  adjustment: z.number().min(-10).max(10).default(0),
  rationale: z.string().max(1200).default(''),
  strengths: z.array(z.string().max(400)).max(12).default([]),
  gaps: z.array(z.string().max(400)).max(12).default([]),
  risks: z.array(z.string().max(400)).max(12).default([]),
  recommendation: z.enum(['aplicar', 'aplicar_com_ajustes', 'avaliar', 'nao_recomendado']).default('avaliar'),
  recommendationReason: z.string().max(800).default(''),
});
export type SemanticAssessment = z.infer<typeof semanticAssessmentSchema>;

export const requirementStatusSchema = z.enum(['atendido', 'parcial', 'ausente']);
export type RequirementStatus = z.infer<typeof requirementStatusSchema>;

export const scoreBreakdownItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  ratio: z.number(),
  points: z.number(),
  detail: z.string(),
  matched: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
});
export type ScoreBreakdownItem = z.infer<typeof scoreBreakdownItemSchema>;

export const resumeMatchSchema = z.object({
  resumeId: uuidSchema,
  resumeName: z.string(),
  score: scoreSchema,
  baseScore: scoreSchema,
  semanticAdjustment: z.number().min(-10).max(10).default(0),
  breakdown: z.array(scoreBreakdownItemSchema).default([]),
  requirements: z
    .array(z.object({ requirement: z.string(), status: requirementStatusSchema, evidence: z.string().default('') }))
    .default([]),
  matchedSkills: z.array(z.string()).default([]),
  partialSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  semantic: semanticAssessmentSchema.nullable().default(null),
});
export type ResumeMatch = z.infer<typeof resumeMatchSchema>;

/** Registro persistido de uma analise completa (cacheavel por fingerprint, §30). */
export const jobAnalysisRecordSchema = z.object({
  id: uuidSchema,
  jobId: uuidSchema,
  fingerprint: z.string(),
  analysis: jobAnalysisSchema,
  matches: z.array(resumeMatchSchema).default([]),
  recommendedResumeId: uuidSchema.nullable().default(null),
  recommendationReason: z.string().default(''),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type JobAnalysisRecord = z.infer<typeof jobAnalysisRecordSchema>;
