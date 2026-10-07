// Teste do núcleo sem Electron: servidor e impressora de rede falsos na própria máquina.
// Uso: npm run teste
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const { Nucleo } = require("../src/nucleo");

const ouvir = (servidor) => new Promise((r) => servidor.listen(0, "127.0.0.1", () => r(servidor.address().port)));
const esperar = (cond, ms = 5000) =>
  new Promise((resolver, rejeitar) => {
    const inicio = Date.now();
    const t = setInterval(() => {
      if (cond()) {
        clearInterval(t);
        resolver();
      } else if (Date.now() - inicio > ms) {
        clearInterval(t);
        rejeitar(new Error("tempo esgotado"));
      }
    }, 20);
  });

async function main() {
  // Impressora de rede falsa: guarda o que recebe.
  const recebidos = [];
  const impressora = net.createServer((s) => {
    const partes = [];
    s.on("data", (d) => partes.push(d));
    s.on("end", () => recebidos.push(Buffer.concat(partes).toString("latin1")));
  });
  const portaImpressora = await ouvir(impressora);

  // Servidor falso com a mesma API do sistema.
  const resultados = {};
  let fila = [];
  let revogado = false;
  const servidor = http.createServer((req, res) => {
    let corpo = "";
    req.on("data", (d) => (corpo += d));
    req.on("end", () => {
      const json = (status, dados) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(dados));
      };
      const autorizado = req.headers.authorization === "Bearer chave-teste" && !revogado;
      if (req.url === "/api/agente/parear") {
        const { codigo } = JSON.parse(corpo);
        return codigo === "123456"
          ? json(200, { chave: "chave-teste", agente: { nome: "Caixa" }, restaurante: { nome: "Restaurante Teste" } })
          : json(400, { erro: "Código inválido ou vencido." });
      }
      if (!autorizado) return json(401, { erro: "Não autorizado" });
      if (req.url === "/api/agente/estado") return json(200, { ok: true });
      if (req.url === "/api/agente/trabalhos") {
        const trabalhos = fila;
        fila = [];
        return json(200, { agente: { nome: "Caixa" }, restaurante: { nome: "Restaurante Teste" }, impressoras: [], trabalhos });
      }
      const m = req.url.match(/^\/api\/agente\/trabalhos\/(.+)$/);
      if (m) {
        resultados[m[1]] = JSON.parse(corpo);
        return json(200, { ok: true });
      }
      json(404, {});
    });
  });
  const portaServidor = await ouvir(servidor);
  const endereco = `http://127.0.0.1:${portaServidor}`;

  let config = {};
  const driver = [];
  const nucleo = new Nucleo({
    versao: "teste",
    lerConfig: () => config,
    salvarConfig: (c) => (config = { ...config, ...c }),
    imprimirRaw: async (nome) => {
      throw new Error(`Impressora nao encontrada no Windows: ${nome}`);
    },
    imprimirDriver: async (nome, documento, largura) => driver.push({ nome, documento, largura }),
    listarImpressoras: async () => ["Termica USB"],
  });

  // Pareamento
  await assert.rejects(nucleo.parear(endereco, "000000"), /Código inválido/);
  await assert.rejects(nucleo.parear("sem-endereco", "123456"), /Endereço/);
  await nucleo.parear(endereco, "123 456");
  assert.equal(config.chave, "chave-teste");
  await esperar(() => nucleo.estado.situacao === "conectado");
  assert.equal(nucleo.estado.restaurante, "Restaurante Teste");
  console.log("ok  pareamento");

  // Rede, driver e USB com erro
  const rede = { nome: "Chapa", conexao: "rede", endereco: "127.0.0.1", porta: portaImpressora, modo: "escpos", largura: 80 };
  const usbDriver = { nome: "Caixa", conexao: "windows", endereco: "Termica USB", modo: "driver", largura: 58 };
  const usbRaw = { nome: "Cozinha", conexao: "windows", endereco: "Sumiu", modo: "escpos", largura: 80 };
  fila = [
    { id: "t1", tipo: "producao", impressora: rede, dados: Buffer.from("MESA 8\n", "latin1").toString("base64") },
    { id: "t2", tipo: "conta", impressora: usbDriver, documento: { linhas: [{ tipo: "texto", texto: "CONTA" }] } },
    { id: "t3", tipo: "teste", impressora: usbRaw, dados: Buffer.from("x").toString("base64") },
  ];
  await esperar(() => Object.keys(resultados).length === 3);
  assert.deepEqual(resultados.t1, { ok: true });
  assert.deepEqual(resultados.t2, { ok: true });
  assert.equal(resultados.t3.ok, false);
  assert.match(resultados.t3.erro, /Sumiu/);
  await esperar(() => recebidos.length === 1);
  assert.equal(recebidos[0], "MESA 8\n");
  assert.equal(driver[0].nome, "Termica USB");
  assert.equal(driver[0].largura, 58);
  assert.equal(nucleo.estado.situacao, "problema");
  console.log("ok  impressão por rede, driver e erro no USB");

  // Impressora de rede desligada
  const temporario = net.createServer();
  const portaFechada = await ouvir(temporario);
  await new Promise((r) => temporario.close(r));
  fila = [{ id: "t4", tipo: "teste", impressora: { ...rede, porta: portaFechada }, dados: "eA==" }];
  await esperar(() => resultados.t4);
  assert.equal(resultados.t4.ok, false);
  console.log("ok  impressora de rede fora do ar:", resultados.t4.erro);

  // Chave revogada no painel
  revogado = true;
  await esperar(() => nucleo.estado.situacao === "desconectado");
  assert.equal(config.chave, null);
  console.log("ok  desconectado quando o painel revoga a chave");

  nucleo.parar();
  servidor.close();
  impressora.close();
  console.log("\ntudo certo");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
