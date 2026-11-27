// Confere que as listas do TypeScript e as do banco são as mesmas.
//
// Três listas vivem nos dois lados, e cada vez que uma cresce é fácil esquecer a outra (foi o
// que aconteceu com o módulo `estoque`, que entrou no banco e na navegação mas ficou de fora da
// tela de módulos do super admin):
//
//   permissões -> src/lib/auth/papeis.ts            x rest_privado.permissoes_validas()
//   módulos    -> src/app/(site)/admin/modulos.ts   x rest_privado.modulos_validos()
//   planos     -> src/lib/planos.ts                 x constraint assinaturas_plano_check
//
// Lê os dois lados do próprio repositório (sem banco nenhum), então roda na CI:
//
//   node scripts/conferir-listas.mjs
//
// Sai com 1 e diz o que divergiu. Do lado do banco vale a ÚLTIMA definição de cada função nas
// migrações, na ordem dos nomes dos arquivos (é a que o `supabase db push` deixa no ar).

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const MIGRACOES = join(RAIZ, "supabase", "migrations");

const falhas = [];

async function sql() {
  const arquivos = (await readdir(MIGRACOES)).filter((a) => a.endsWith(".sql")).sort();
  const partes = await Promise.all(arquivos.map((a) => readFile(join(MIGRACOES, a), "utf8")));
  return partes.join("\n");
}

// Itens de um `array[...]` (ou de um `in (...)`) em SQL: só os textos entre apóstrofos.
function textosSql(trecho) {
  return [...trecho.matchAll(/'([^']*)'/g)].map((m) => m[1]);
}

// Última definição de uma função que devolve um array fixo (permissoes_validas, modulos_validos).
function arrayDaFuncao(todoSql, nome) {
  const definicoes = [...todoSql.matchAll(new RegExp(`function\\s+rest_privado\\.${nome}\\s*\\(\\)([\\s\\S]*?)\\$\\$;`, "g"))];
  if (definicoes.length === 0) return null;
  const ultima = definicoes[definicoes.length - 1][1];
  const array = ultima.match(/array\s*\[([\s\S]*?)\]/i);
  return array ? textosSql(array[1]) : null;
}

// Lista literal de um `const NOME = [...]` do TypeScript.
function arrayDoTs(fonte, nome) {
  const m = fonte.match(new RegExp(`const\\s+${nome}\\s*(?::[^=]+)?=\\s*\\[([\\s\\S]*?)\\]\\s*as const`, "m"));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

function comparar(assunto, doTs, doBanco) {
  if (!doTs) return falhas.push(`${assunto}: não consegui ler a lista do TypeScript.`);
  if (!doBanco) return falhas.push(`${assunto}: não consegui ler a lista do banco.`);
  const soNoTs = doTs.filter((x) => !doBanco.includes(x));
  const soNoBanco = doBanco.filter((x) => !doTs.includes(x));
  if (soNoTs.length) falhas.push(`${assunto}: só no TypeScript -> ${soNoTs.join(", ")}`);
  if (soNoBanco.length) falhas.push(`${assunto}: só no banco -> ${soNoBanco.join(", ")}`);
  if (!soNoTs.length && !soNoBanco.length) console.log(`ok  ${assunto} (${doTs.length})`);
}

const todoSql = await sql();

// ------------------------------------------------------------------ permissões
const papeis = await readFile(join(RAIZ, "src", "lib", "auth", "papeis.ts"), "utf8");
const permissoesTs = arrayDoTs(papeis, "PERMISSOES");
const permissoesBanco = arrayDaFuncao(todoSql, "permissoes_validas");
comparar("permissões", permissoesTs, permissoesBanco);

// Toda permissão precisa de um nome na interface e de um grupo na tela de Funções.
if (permissoesTs) {
  const semNome = permissoesTs.filter((p) => !new RegExp(`^\\s*${p}:`, "m").test(papeis));
  if (semNome.length) falhas.push(`permissões sem nome em NOME_PERMISSAO -> ${semNome.join(", ")}`);
  const grupos = papeis.match(/GRUPOS_PERMISSOES[\s\S]*?\n\];/);
  const nosGrupos = grupos ? [...grupos[0].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : [];
  const foraDosGrupos = permissoesTs.filter((p) => !nosGrupos.includes(p));
  if (foraDosGrupos.length) falhas.push(`permissões fora de GRUPOS_PERMISSOES -> ${foraDosGrupos.join(", ")}`);
}

// ------------------------------------------------------------------ módulos
const modulosFonte = await readFile(join(RAIZ, "src", "app", "(site)", "admin", "modulos.ts"), "utf8");
const modulosTs = [...modulosFonte.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);
const modulosBanco = arrayDaFuncao(todoSql, "modulos_validos");
comparar("módulos", modulosTs.length ? modulosTs : null, modulosBanco);

// O que cada módulo libera tem de ser permissão válida, e o módulo, módulo válido.
const doModulo = [...todoSql.matchAll(/function\s+rest_privado\.permissoes_do_modulo[\s\S]*?\$\$;/g)];
if (doModulo.length === 0) {
  falhas.push("módulos: não achei rest_privado.permissoes_do_modulo.");
} else if (permissoesBanco && modulosBanco) {
  const corpo = doModulo[doModulo.length - 1][0];
  for (const linha of corpo.split("\n")) {
    const caso = linha.match(/when\s+'([^']+)'\s+then\s+array\s*\[([^\]]*)\]/i);
    if (!caso) continue;
    if (!modulosBanco.includes(caso[1])) falhas.push(`permissoes_do_modulo: módulo desconhecido -> ${caso[1]}`);
    for (const p of textosSql(caso[2])) {
      if (!permissoesBanco.includes(p)) falhas.push(`permissoes_do_modulo (${caso[1]}): permissão desconhecida -> ${p}`);
    }
  }
}

// ------------------------------------------------------------------ planos
const planos = await readFile(join(RAIZ, "src", "lib", "planos.ts"), "utf8");
const planosTs = [...(planos.match(/export type IdPlano = ([^;]+);/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const constraints = [...todoSql.matchAll(/assinaturas_plano_check\s+check\s*\(\s*plano\s+in\s*\(([^)]*)\)/g)];
const planosBanco = constraints.length ? textosSql(constraints[constraints.length - 1][1]) : null;
comparar("planos", planosTs.length ? planosTs : null, planosBanco);

// Todo plano citado em modulos_do_restaurante existe.
if (planosBanco) {
  const doRestaurante = [...todoSql.matchAll(/function\s+rest_privado\.modulos_do_restaurante[\s\S]*?\$\$;/g)];
  if (doRestaurante.length > 0) {
    for (const trecho of doRestaurante[doRestaurante.length - 1][0].matchAll(/a\.plano\s+in\s*\(([^)]*)\)/g)) {
      for (const p of textosSql(trecho[1])) {
        if (!planosBanco.includes(p)) falhas.push(`modulos_do_restaurante: plano desconhecido -> ${p}`);
      }
    }
  }
}

// ------------------------------------------------------------------ resultado
if (falhas.length > 0) {
  console.error("\nAs listas do código e as do banco não batem:\n");
  for (const f of falhas) console.error(" - " + f);
  console.error("\nAcerte os dois lados (a do banco entra por migração) e rode de novo.");
  process.exit(1);
}
console.log("\nTudo batendo.");
