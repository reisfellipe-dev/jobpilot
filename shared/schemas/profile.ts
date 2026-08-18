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
import { WORK_MODES } from '../constants.js';

export const educationSchema = z.object({
  institution: text(160, 1),
  degree: optionalText(160),
  field: optionalText(160),
  startDate: monthSchema,
  endDate: monthSchema,
  status: z.enum(['concluido', 'cursando', 'trancado', 'incompleto']).default('concluido'),
});
export type Education = z.infer<typeof educationSchema>;

export const certificationSchema = z.object({
  name: text(160, 1),
  issuer: optionalText(160),
  year: optionalText(10),
  url: urlSchema,
});
export type Certification = z.infer<typeof certificationSchema>;

export const languageSchema = z.object({
  name: text(60, 1),
  level: z.enum(['basico', 'intermediario', 'avancado', 'fluente', 'nativo']).default('intermediario'),
});
export type LanguageEntry = z.infer<typeof languageSchema>;

/**
 * Perfil profissional: a fonte de verdade do produto (§13).
 * Curriculos sao apresentacoes derivadas deste perfil.
 */
export const profileInputSchema = z.object({
  fullName: optionalText(140),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'E-mail inválido')
    .nullish()
    .transform((v) => v ?? ''),
  phone: optionalText(40),
  location: optionalText(140),
  headline: optionalText(180),
  summary: optionalText(4000),
  education: z.array(educationSchema).max(30).default([]),
  certifications: z.array(certificationSchema).max(60).default([]),
  languages: z.array(languageSchema).max(20).default([]),
  links: z.array(linkSchema).max(20).default([]),
  desiredRoles: stringList(80, 20),
  seniority: seniaritySchema.nullish(),
  workModes: z.array(z.enum(WORK_MODES)).max(3).default([]),
  desiredLocation: optionalText(140),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const profileSchema = profileInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const experienceInputSchema = z.object({
  company: text(160, 1),
  role: text(160, 1),
  description: optionalText(4000),
  startDate: monthSchema,
  endDate: monthSchema,
  isCurrent: z.boolean().default(false),
  technologies: stringList(60, 60),
  achievements: stringList(400, 30),
  responsibilities: stringList(400, 30),
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type ExperienceInput = z.infer<typeof experienceInputSchema>;

export const experienceSchema = experienceInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Experience = z.infer<typeof experienceSchema>;

export const projectInputSchema = z.object({
  name: text(160, 1),
  description: optionalText(3000),
  technologies: stringList(60, 60),
  url: urlSchema,
  githubUrl: urlSchema,
  outcomes: stringList(400, 20),
  startDate: monthSchema,
  endDate: monthSchema,
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectSchema = projectInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const SKILL_CATEGORIES = [
  'linguagem',
  'framework',
  'banco',
  'cloud',
  'ferramenta',
  'metodologia',
  'soft',
  'outro',
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export const SKILL_CATEGORY_LABEL: Record<SkillCategory, string> = {
  linguagem: 'Linguagem',
  framework: 'Framework',
  banco: 'Banco de dados',
  cloud: 'Cloud / Infra',
  ferramenta: 'Ferramenta',
  metodologia: 'Metodologia',
  soft: 'Soft skill',
  outro: 'Outro',
};

export const skillInputSchema = z.object({
  name: text(80, 1),
  category: z.enum(SKILL_CATEGORIES).default('outro'),
  level: z.number().int().min(1).max(5).default(3),
  yearsExperience: z.number().min(0).max(60).nullish(),
});
export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillSchema = skillInputSchema.extend({
  id: uuidSchema,
  createdAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;

/** Agregado usado como contexto de IA e base do matching. */
export interface FullProfile {
  profile: Profile;
  experiences: Experience[];
  projects: Project[];
  skills: Skill[];
}
