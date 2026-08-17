/** Opções de select derivadas das constantes de domínio. */
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABEL,
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  SENIORITY_LABEL,
  SENIORITY_LEVELS,
  WORK_MODES,
  WORK_MODE_LABEL,
} from '@shared/constants';
import { SKILL_CATEGORIES, SKILL_CATEGORY_LABEL } from '@shared/schemas/profile';

export const seniorityOptions = SENIORITY_LEVELS.map((value) => ({ value, label: SENIORITY_LABEL[value] }));
export const workModeOptions = WORK_MODES.map((value) => ({ value, label: WORK_MODE_LABEL[value] }));
export const jobStatusOptions = JOB_STATUSES.map((value) => ({ value, label: JOB_STATUS_LABEL[value] }));
export const applicationStatusOptions = APPLICATION_STATUSES.map((value) => ({
  value,
  label: APPLICATION_STATUS_LABEL[value],
}));
export const skillCategoryOptions = SKILL_CATEGORIES.map((value) => ({
  value,
  label: SKILL_CATEGORY_LABEL[value],
}));

export const educationStatusOptions = [
  { value: 'concluido', label: 'Concluído' },
  { value: 'cursando', label: 'Cursando' },
  { value: 'trancado', label: 'Trancado' },
  { value: 'incompleto', label: 'Incompleto' },
];

export const languageLevelOptions = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
  { value: 'fluente', label: 'Fluente' },
  { value: 'nativo', label: 'Nativo' },
];

export const toneOptions = [
  { value: 'profissional', label: 'Profissional' },
  { value: 'direto', label: 'Direto' },
  { value: 'entusiasmado', label: 'Entusiasmado' },
  { value: 'tecnico', label: 'Técnico' },
];
