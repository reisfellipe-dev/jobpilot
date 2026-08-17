/**
 * Rede de seguranca deterministica contra alucinacao (§18).
 *
 * Prompt e instrucao, nao garantia. Depois que a IA adapta um curriculo, este
 * modulo compara o resultado com o original e REMOVE qualquer fato que nao
 * exista na fonte de verdade: empresas, cargos, datas, skills, certificacoes,
 * formacao e idiomas. As violacoes sao devolvidas para exibicao ao usuario.
 */
import type { ResumeContent } from '../schemas/resume';
import { canonicalSkill, normalizeText } from '../matching/normalize';

export interface IntegrityViolation {
  type: 'experiencia' | 'skill' | 'certificacao' | 'formacao' | 'idioma' | 'data' | 'projeto';
  detail: string;
}

export interface IntegrityResult {
  content: ResumeContent;
  violations: IntegrityViolation[];
}

/** Universo de fatos aceitos: tudo que ja existia no original ou no perfil. */
export interface FactSource {
  content: ResumeContent;
  /** Skills adicionais conhecidas (cadastro do perfil). */
  extraSkills?: string[];
}

function keyOf(value: string): string {
  return normalizeText(value);
}

function collectSkillUniverse(source: FactSource): Set<string> {
  const universe = new Set<string>();
  const add = (value: string) => {
    const canonical = canonicalSkill(value);
    if (canonical) universe.add(canonical);
  };
  source.content.skills.forEach(add);
  source.extraSkills?.forEach(add);
  for (const exp of source.content.experiences) exp.technologies.forEach(add);
  for (const project of source.content.projects) project.technologies.forEach(add);
  return universe;
}

/**
 * Valida o conteudo adaptado contra o original.
 * Retorna uma versao saneada - nunca lanca excecao.
 */
export function enforceResumeIntegrity(adapted: ResumeContent, source: FactSource): IntegrityResult {
  const violations: IntegrityViolation[] = [];
  const original = source.content;

  const originalCompanies = new Map<string, (typeof original.experiences)[number]>();
  for (const exp of original.experiences) {
    if (exp.company) originalCompanies.set(keyOf(exp.company), exp);
  }
  const originalRoles = new Set(original.experiences.map((exp) => keyOf(exp.role)).filter(Boolean));

  // --- Experiencias -----------------------------------------------------------
  const experiences: ResumeContent['experiences'] = [];
  for (const exp of adapted.experiences) {
    const companyKey = keyOf(exp.company);
    if (!companyKey) {
      violations.push({ type: 'experiencia', detail: 'Experiência sem empresa foi descartada.' });
      continue;
    }
    const match = originalCompanies.get(companyKey);
    if (!match) {
      violations.push({
        type: 'experiencia',
        detail: `Empresa "${exp.company}" não existe no currículo original e foi removida.`,
      });
      continue;
    }

    let role = exp.role;
    if (role && !originalRoles.has(keyOf(role))) {
      violations.push({
        type: 'experiencia',
        detail: `Cargo "${exp.role}" em ${exp.company} não constava no original; restaurado para "${match.role}".`,
      });
      role = match.role;
    }

    // Datas nunca podem ser reescritas.
    const startDate = match.startDate ?? null;
    const endDate = match.endDate ?? null;
    if ((exp.startDate ?? null) !== startDate || (exp.endDate ?? null) !== endDate) {
      violations.push({ type: 'data', detail: `Datas de ${exp.company} foram restauradas ao original.` });
    }

    const allowedTech = new Set(match.technologies.map(canonicalSkill));
    const technologies = exp.technologies.filter((tech) => {
      const canonical = canonicalSkill(tech);
      if (allowedTech.has(canonical)) return true;
      violations.push({
        type: 'skill',
        detail: `Tecnologia "${tech}" foi removida de ${exp.company}: não constava nessa experiência.`,
      });
      return false;
    });

    experiences.push({
      ...exp,
      role,
      startDate,
      endDate,
      isCurrent: match.isCurrent,
      technologies,
    });
  }

  // Nenhuma experiencia pode desaparecer do historico.
  const keptCompanies = new Set(experiences.map((exp) => keyOf(exp.company)));
  for (const [companyKey, exp] of originalCompanies) {
    if (!keptCompanies.has(companyKey)) {
      violations.push({
        type: 'experiencia',
        detail: `A experiência em ${exp.company} havia sido omitida e foi reinserida.`,
      });
      experiences.push(exp);
    }
  }

  // --- Skills -----------------------------------------------------------------
  const skillUniverse = collectSkillUniverse(source);
  const skills = adapted.skills.filter((skill) => {
    if (skillUniverse.has(canonicalSkill(skill))) return true;
    violations.push({ type: 'skill', detail: `Skill "${skill}" foi removida: não existe no perfil original.` });
    return false;
  });

  // --- Certificacoes ----------------------------------------------------------
  const originalCerts = new Set(original.certifications.map((cert) => keyOf(cert.name ?? '')).filter(Boolean));
  const certifications = adapted.certifications.filter((cert) => {
    if (originalCerts.has(keyOf(cert.name ?? ''))) return true;
    violations.push({
      type: 'certificacao',
      detail: `Certificação "${cert.name ?? ''}" foi removida: não existe no original.`,
    });
    return false;
  });

  // --- Formacao ---------------------------------------------------------------
  const originalEducation = new Set(original.education.map((edu) => keyOf(edu.institution ?? '')).filter(Boolean));
  const education = adapted.education.filter((edu) => {
    if (originalEducation.has(keyOf(edu.institution ?? ''))) return true;
    violations.push({
      type: 'formacao',
      detail: `Formação em "${edu.institution ?? ''}" foi removida: não existe no original.`,
    });
    return false;
  });

  // --- Idiomas ----------------------------------------------------------------
  const originalLanguages = new Set(original.languages.map((lang) => keyOf(lang.name ?? '')).filter(Boolean));
  const languages = adapted.languages.filter((lang) => {
    if (originalLanguages.has(keyOf(lang.name ?? ''))) return true;
    violations.push({ type: 'idioma', detail: `Idioma "${lang.name ?? ''}" foi removido: não existe no original.` });
    return false;
  });

  // --- Projetos ---------------------------------------------------------------
  const originalProjects = new Set(original.projects.map((project) => keyOf(project.name)).filter(Boolean));
  const projects = adapted.projects.filter((project) => {
    if (originalProjects.has(keyOf(project.name))) return true;
    violations.push({ type: 'projeto', detail: `Projeto "${project.name}" foi removido: não existe no original.` });
    return false;
  });

  return {
    content: {
      ...adapted,
      // Dados de identidade e contato nunca vêm da IA.
      fullName: original.fullName,
      contact: original.contact,
      experiences,
      skills,
      certifications,
      education,
      languages,
      projects,
    },
    violations,
  };
}
