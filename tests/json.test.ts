import { describe, expect, it } from 'vitest';
import { describeIssues, extractJsonSlice, parseLooseJson, repairJson, stripCodeFences } from '../api/_services/ai/json';

describe('stripCodeFences', () => {
  it('remove cerca com linguagem', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('remove cerca sem fechamento (resposta truncada)', () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });

  it('mantém texto sem cerca', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe('extractJsonSlice', () => {
  it('recorta objeto no meio de texto solto', () => {
    const result = extractJsonSlice('Claro! Aqui está: {"nome":"Ana"} Espero ter ajudado.');
    expect(result?.slice).toBe('{"nome":"Ana"}');
    expect(result?.autoClosed).toBe(false);
  });

  it('ignora chaves dentro de strings', () => {
    const result = extractJsonSlice('{"texto":"um } aqui dentro","ok":true}');
    expect(result?.slice).toBe('{"texto":"um } aqui dentro","ok":true}');
  });

  it('lida com escapes dentro de strings', () => {
    const result = extractJsonSlice('{"texto":"aspas \\" e chave }","ok":true}');
    expect(JSON.parse(result!.slice)).toEqual({ texto: 'aspas " e chave }', ok: true });
  });

  it('fecha JSON truncado por limite de tokens', () => {
    const result = extractJsonSlice('{"itens":["a","b"');
    expect(result?.autoClosed).toBe(true);
    expect(JSON.parse(result!.slice)).toEqual({ itens: ['a', 'b'] });
  });

  it('devolve null quando não há JSON', () => {
    expect(extractJsonSlice('sem json aqui')).toBeNull();
    expect(extractJsonSlice('')).toBeNull();
  });
});

describe('repairJson', () => {
  it('remove vírgulas sobrando', () => {
    expect(JSON.parse(repairJson('{"a":1,}'))).toEqual({ a: 1 });
    expect(JSON.parse(repairJson('["a","b",]'))).toEqual(['a', 'b']);
  });

  it('converte aspas tipográficas', () => {
    expect(JSON.parse(repairJson('{“a”:1}'))).toEqual({ a: 1 });
  });

  it('remove comentários', () => {
    expect(JSON.parse(repairJson('{\n// comentário\n"a":1}'))).toEqual({ a: 1 });
  });

  it('converte literais de outras linguagens', () => {
    expect(JSON.parse(repairJson('{"a": None, "b": True}'))).toEqual({ a: null, b: true });
  });
});

describe('parseLooseJson', () => {
  it('lê JSON limpo', () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ value: { a: 1 }, repaired: false });
  });

  it('lê JSON com cerca e texto ao redor', () => {
    const result = parseLooseJson('Segue:\n```json\n{"a":1}\n```\nQualquer coisa');
    expect(result?.value).toEqual({ a: 1 });
  });

  it('repara e marca como reparado', () => {
    const result = parseLooseJson('{"a":1,}');
    expect(result?.value).toEqual({ a: 1 });
    expect(result?.repaired).toBe(true);
  });

  it('recupera resposta truncada', () => {
    const result = parseLooseJson('{"requiredSkills":["React","TypeScript"');
    expect(result?.value).toEqual({ requiredSkills: ['React', 'TypeScript'] });
    expect(result?.repaired).toBe(true);
  });

  it('devolve null para conteúdo irrecuperável', () => {
    expect(parseLooseJson('desculpe, não posso ajudar com isso')).toBeNull();
    expect(parseLooseJson('')).toBeNull();
    expect(parseLooseJson('   ')).toBeNull();
  });

  it('aceita array na raiz', () => {
    expect(parseLooseJson('[1,2,3]')?.value).toEqual([1, 2, 3]);
  });
});

describe('describeIssues', () => {
  it('formata caminhos e mensagens', () => {
    const text = describeIssues([
      { path: ['content', 'experiences', 0, 'company'], message: 'Obrigatório' },
      { path: [], message: 'Raiz inválida' },
    ]);
    expect(text).toContain('content.experiences.0.company: Obrigatório');
    expect(text).toContain('(raiz): Raiz inválida');
  });
});
