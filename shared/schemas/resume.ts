import { z } from 'zod';
import {
  linkSchema,
  monthSchema,
  optionalText,
  seniaritySchema,
  stringList,
  text,
  urlSchema,
  uuidSchema,
} from './common.js';
import { certificationSchema, educationSchema, languageSchema } from './profile.js';

/**
 * Conteudo estruturado de um curriculo.
 * Todos os blocos sao opcionais: extracao automatica pode nao encontrar tudo,
 * e informacao ausente deve permanecer ausente (§18) - nunca inventada.
 */
export const resumeContentSchema = z.object({
  fullName: optionalText(140),
  headline: optionalText(180),
  summary: optionalText(4000),
  contact: z
    .object({
      email: optionalText(200),
      phone: optionalText(40),
      location: optionalText(140),
      links: z.array(linkSchema).max(20).default([]),
    })
    .default({ email: '', phone: '', location: '', links: [] }),
  experiences: z
    .array(
      z.object({
        company: optionalText(160),
        role: optionalText(160),
        description: optionalText(4000),
        startDate: monthSchema,
        endDate: monthSchema,
        isCurrent: z.boolean().default(false),
        technologies: stringList(60, 60),
        achievements: stringList(400, 30),
        responsibilities: stringList(400, 30),
      }),
    )
    .max(40)
    .default([]),
  education: z.array(educationSchema.partial({ institution: true })).max(30).default([]),
  projects: z
    .array(
      z.object({
        name: optionalText(160),
        description: optionalText(3000),
        technologies: stringList(60, 60),
        url: urlSchema,
        githubUrl: urlSchema,
        outcomes: stringList(400, 20),
      }),
    )
    .max(30)
    .default([]),
  skills: stringList(80, 200),
  certifications: z.array(certificationSchema.partial({ name: true })).max(60).default([]),
  languages: z.array(languageSchema.partial({ name: true })).max(20).default([]),
});
export type ResumeContent = z.infer<typeof resumeContentSchema>;

export const emptyResumeContent = (): ResumeContent => resumeContentSchema.parse({});

export const resumeInputSchema = z.object({
  name: text(120, 1),
  objective: optionalText(300),
  seniority: seniaritySchema.nullish(),
  description: optionalText(1000),
  skills: stringList(80, 200),
  targetRoles: stringList(80, 20),
  content: resumeContentSchema.default(() => emptyResumeContent()),
  priority: z.number().int().min(0).max(100).default(50),
  isDefault: z.boolean().default(false),
  filePath: optionalText(400),
  fileName: optionalText(240),
  fileMime: optionalText(120),
});
export type ResumeInput = z.infer<typeof resumeInputSchema>;

export const resumeSchema = resumeInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Resume = z.infer<typeof resumeSchema>;

/** Versao adaptada de um curriculo para uma vaga especifica (§24). */
export const resumeVersionSchema = z.object({
  id: uuidSchema,
  resumeId: uuidSchema,
  jobId: uuidSchema.nullable(),
  label: z.string(),
  content: resumeContentSchema,
  changes: z
    .array(z.object({ section: z.string(), before: z.string(), after: z.string(), reason: z.string() }))
    .default([]),
  keywordsAdded: z.array(z.string()).default([]),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  createdAt: z.string(),
});
export type ResumeVersion = z.infer<typeof resumeVersionSchema>;
