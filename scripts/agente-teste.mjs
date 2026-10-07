// Agente de impressão de linha de comando: faz o mesmo que o app do computador do caixa
// (parear, buscar a fila, mandar para a impressora de rede e confirmar). Serve para testar
// sem o app e é a base do núcleo do app.
//
// Uso:
//   node scripts/agente-teste.mjs --servidor http://localhost:3000 --codigo 123456   (pareia e guarda a chave)
//   node scripts/agente-teste.mjs --servidor http://localhost:3000                   (só imprime)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Socket } from "node:net";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    servidor: { type: "string", default: "http://localhost:3000" },
    codigo: { type: "string" },
    arquivo: { type: "string", default: ".agente-teste.json" },
    intervalo: { type: "string", default: "2000" },
  },
});
const VERSAO = "teste-0.1";

async function api(caminho, opcoes = {}, chave) {
  const resposta = await fetch(`${a.servidor}${caminho}`, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}) },
  });
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? `HTTP ${resposta.status}`);
  return corpo;
}

// Bytes ESC/POS direto para a impressora de rede (porta 9100), com tempo limite.
function enviarRede(endereco, porta, bytes) {
  return new Promise((resolver, rejeitar) => {
    const socket = new Socket();
    const falhar = (erro) => {
      socket.destroy();
      rejeitar(erro);
    };
    socket.setTimeout(8000, () => falhar(new Error("A impressora não respondeu (desligada ou IP errado).")));
    socket.once("error", (e) =>
      falhar(new Error(e.code === "ECONNREFUSED" ? "A impressora recusou a conexão." : `Erro de rede: ${e.code ?? e.message}`)),
    );
    socket.connect(porta, endereco, () => socket.end(bytes, () => resolver()));
  });
}

async function principal() {
  let chave = existsSync(a.arquivo) ? JSON.parse(readFileSync(a.arquivo, "utf8")).chave : null;

  if (a.codigo) {
    const r = await api("/api/agente/parear", { method: "POST", body: JSON.stringify({ codigo: a.codigo, versao: VERSAO }) });
    chave = r.chave;
    writeFileSync(a.arquivo, JSON.stringify({ chave, servidor: a.servidor }, null, 2));
    console.log(`Pareado com "${r.restaurante.nome}" como "${r.agente.nome}".`);
  }
  if (!chave) {
    console.error("Sem chave: rode com --codigo <6 dígitos> gerado no painel (Impressoras > Conectar computador).");
    process.exitCode = 1;
    return;
  }

  await api("/api/agente/estado", { method: "POST", body: JSON.stringify({ versao: VERSAO, impressorasWindows: [] }) }, chave);
  console.log(`Buscando a fila em ${a.servidor} a cada ${a.intervalo} ms. Ctrl+C para sair.`);

  for (;;) {
    try {
      const { trabalhos } = await api("/api/agente/trabalhos", {}, chave);
      for (const t of trabalhos) {
        let resultado = { ok: true };
        try {
          if (t.impressora.conexao !== "rede") throw new Error("Impressora USB só pelo app do Windows.");
          await enviarRede(t.impressora.endereco, t.impressora.porta, Buffer.from(t.dados, "base64"));
          console.log(`ok  ${t.tipo} -> ${t.impressora.nome}`);
        } catch (e) {
          resultado = { ok: false, erro: e.message };
          console.log(`ERRO ${t.tipo} -> ${t.impressora.nome}: ${e.message}`);
        }
        await api(`/api/agente/trabalhos/${t.id}`, { method: "POST", body: JSON.stringify(resultado) }, chave);
      }
    } catch (e) {
      console.log(`Sem conexão com o servidor: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, Number(a.intervalo)));
  }
}

principal();
