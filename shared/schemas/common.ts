import { z } from 'zod';
import { SENIORITY_LEVELS, WORK_MODES } from '../constants';

export const uuidSchema = z.string().uuid('Identificador inválido');

/** Data em formato AAAA-MM (ou AAAA). Currículos raramente têm dia. */
export const monthSchema = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, 'Use o formato AAAA-MM')
  .or(z.literal(''))
  .nullable()
  .optional();

/**
 * Data completa AAAA-MM-DD.
 * O regex sozinho aceitaria "2025-13-40"; a checagem de calendário evita que um
 * valor impossível chegue ao Postgres e vire erro 500 em vez de 422.
 */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number];
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    );
  }, 'Data inexistente no calendário');

export const seniaritySchema = z.enum(SENIORITY_LEVELS);
export const workModeSchema = z.enum(WORK_MODES);

/** String limpa: remove espacos nas bordas e limita tamanho. */
export const text = (max: number, min = 0) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(min).max(max));

export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .nullish()
    .transform((v) => v ?? '');

/** Lista de strings curtas, deduplicada, sem vazios. */
export const stringList = (max = 60, maxItems = 80) =>
  z
    .array(z.string())
    .max(maxItems)
    .default([])
    .transform((arr) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const raw of arr) {
        const v = raw.trim().slice(0, max);
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
      }
      return out;
    });

export const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'URL deve começar com http:// ou https://')
  .nullish()
  .transform((v) => v ?? '');

export const linkSchema = z.object({
  label: text(40, 1),
  url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/i, 'URL inválida'),
});
export type Link = z.infer<typeof linkSchema>;

export const scoreSchema = z.number().int().min(0).max(100);

/** Paginacao padrao das listagens. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
