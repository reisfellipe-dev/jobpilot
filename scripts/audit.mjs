/**
 * Auditoria automatizada do projeto (§56).
 *
 * Verifica, de forma repetível, aquilo que uma revisão manual esquece:
 *  - nenhuma dependência ou referência de runtime à Anthropic/Claude;
 *  - nenhuma chave de IA exposta ao navegador;
 *  - nenhum segredo hardcoded no código;
 *  - nenhum segredo no bundle publicado.
 *
 * Uso: npm run audit:secrets   (roda também depois do build)
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'api', 'shared', 'public', 'supabase', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.jsx', '.json', '.sql', '.css', '.html', '.webmanifest']);

const failures = [];
const warnings = [];

function walk(dir) {
  const entries = [];
  if (!existsSync(dir)) return entries;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) entries.push(...walk(full));
    else if (SOURCE_EXTENSIONS.has(extname(name))) entries.push(full);
  }
  return entries;
}

const sourceFiles = SOURCE_DIRS.flatMap((dir) => walk(resolve(ROOT, dir)));
sourceFiles.push(resolve(ROOT, 'index.html'), resolve(ROOT, 'package.json'), resolve(ROOT, 'vercel.json'));

/** Padrões proibidos no código da aplicação. */
const FORBIDDEN = [
  {
    id: 'anthropic-sdk',
    pattern: /@anthropic-ai|anthropic\.com|ANTHROPIC_API_KEY/i,
    message: 'Referência à Anthropic no runtime da aplicação.',
  },
  {
    id: 'claude-runtime',
    pattern: /\bclaude-[a-z0-9.-]*\b|api\.anthropic\.com/i,
    message: 'Referência a modelo/endpoint Claude no runtime.',
  },
  {
    id: 'ai-key-no-browser',
    pattern: /VITE_(GROQ|NVIDIA|OPENAI)_API_KEY/,
    message: 'Chave de IA prefixada com VITE_ — vazaria para o navegador.',
  },
  {
    id: 'service-role',
    pattern: /SUPABASE_SERVICE_ROLE|service_role_key/i,
    message: 'Uso de service_role: burlaria a RLS.',
  },
  {
    id: 'hardcoded-key',
    pattern: /(gsk_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,})/,
    message: 'Possível chave de API hardcoded.',
  },
  {
    id: 'jwt-hardcoded',
    pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/,
    message: 'Possível JWT real commitado.',
  },
];

/** Arquivos onde a menção é legítima (documentação da própria regra). */
const ALLOWLIST = new Set([
  relative(ROOT, resolve(ROOT, 'scripts/audit.mjs')),
  relative(ROOT, resolve(ROOT, '.env.example')),
]);

for (const file of sourceFiles) {
  if (!existsSync(file)) continue;
  const relativePath = relative(ROOT, file).replace(/\\/g, '/');
  if (ALLOWLIST.has(relativePath.replace(/\//g, '\\')) || relativePath === 'scripts/audit.mjs') continue;

  const content = readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    const match = rule.pattern.exec(content);
    if (match) {
      failures.push(`[${rule.id}] ${relativePath}: ${rule.message} (encontrado: "${match[0].slice(0, 40)}")`);
    }
  }
}

// --- Dependências --------------------------------------------------------------
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const name of Object.keys(allDeps)) {
  if (/anthropic|claude/i.test(name)) {
    failures.push(`[dependency] package.json depende de "${name}".`);
  }
}

// --- Bundle publicado ----------------------------------------------------------
const distDir = resolve(ROOT, 'dist');
if (existsSync(distDir)) {
  const bundleFiles = walk(distDir);
  const BUNDLE_FORBIDDEN = [
    // Mencionar o nome da variável em um texto de ajuda é inofensivo;
    // o que não pode existir é código do navegador LENDO a chave.
    {
      pattern: /(process\.env|import\.meta\.env)\s*(\.|\[["'])\s*[A-Z_]*(GROQ|NVIDIA|OPENAI)[A-Z_]*(API_?KEY)/,
      message: 'código do navegador tentando ler uma chave de IA',
    },
    { pattern: /gsk_[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,}/, message: 'chave de IA presente no bundle' },
    { pattern: /api\.groq\.com|integrate\.api\.nvidia\.com/, message: 'endpoint de provider de IA no bundle do navegador' },
    { pattern: /@anthropic-ai|api\.anthropic\.com/, message: 'referência à Anthropic no bundle' },
  ];

  for (const file of bundleFiles) {
    const content = readFileSync(file, 'utf8');
    for (const rule of BUNDLE_FORBIDDEN) {
      if (rule.pattern.test(content)) {
        failures.push(`[bundle] ${relative(ROOT, file)}: ${rule.message}.`);
      }
    }
  }
} else {
  warnings.push('dist/ não existe — rode `npm run build` para auditar o bundle publicado.');
}

// --- Arquivos que nunca devem ser versionados ----------------------------------
for (const name of ['.env', '.env.local', '.env.production']) {
  if (existsSync(resolve(ROOT, name))) {
    warnings.push(`${name} existe localmente. Confirme que está no .gitignore antes de publicar.`);
  }
}

// --- Saída ---------------------------------------------------------------------
console.log(`Auditoria: ${sourceFiles.length} arquivos de código verificados.\n`);

for (const warning of warnings) console.log(`AVISO  ${warning}`);
if (warnings.length > 0) console.log('');

if (failures.length === 0) {
  console.log('OK  Nenhum problema encontrado:');
  console.log('    · sem dependência ou referência à Anthropic/Claude no runtime');
  console.log('    · sem chave de IA exposta ao navegador');
  console.log('    · sem segredo hardcoded');
  console.log('    · sem service_role (a RLS vale também no servidor)');
  process.exit(0);
}

console.error(`FALHA  ${failures.length} problema(s):\n`);
for (const failure of failures) console.error(`  ✗ ${failure}`);
process.exit(1);
