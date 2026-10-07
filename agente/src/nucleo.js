// Núcleo do app de impressão, sem Electron (testável no Node):
// pareia com o servidor, busca a fila a cada 2 s, entrega cada trabalho à impressora
// e avisa o resultado. A forma de imprimir no Windows (RAW ou driver) é injetada.
const { EventEmitter } = require("node:events");
const { Socket } = require("node:net");

const INTERVALO_MS = 2000;
const INTERVALO_ESTADO_MS = 60_000;
const MAX_REGISTRO = 30;

class Nucleo extends EventEmitter {
  /**
   * @param {object} o
   * @param {string} o.versao
   * @param {() => {servidor?: string, chave?: string}} o.lerConfig
   * @param {(c: {servidor?: string, chave?: string|null}) => void} o.salvarConfig
   * @param {(impressora: string, bytes: Buffer) => Promise<void>} o.imprimirRaw   impressora USB, comandos ESC/POS
   * @param {(impressora: string, documento: object, largura: number) => Promise<void>} o.imprimirDriver
   * @param {() => Promise<string[]>} o.listarImpressoras  impressoras instaladas no Windows
   */
  constructor(o) {
    super();
    this.o = o;
    this.temporizador = null;
    this.ultimoEstadoEnviado = 0;
    this.rodando = false;
    this.estado = {
      situacao: "desconectado", // desconectado | conectado | sem_conexao | problema
      mensagem: "",
      restaurante: null,
      computador: null,
      impressoras: [],
      registro: [],
    };
  }

  config() {
    return this.o.lerConfig() ?? {};
  }

  atualizar(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.emit("estado", this.estado);
  }

  registrar(item) {
    const completo = { quando: new Date().toISOString(), ...item };
    this.atualizar({ registro: [completo, ...this.estado.registro].slice(0, MAX_REGISTRO) });
    this.emit("registro", completo);
  }

  async api(caminho, opcoes = {}, chave = this.config().chave) {
    const servidor = (this.config().servidor ?? "").replace(/\/+$/, "");
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 15_000);
    try {
      const resposta = await fetch(`${servidor}${caminho}`, {
        ...opcoes,
        signal: controle.signal,
        headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}) },
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        const erro = new Error(corpo.erro ?? `Erro ${resposta.status}`);
        erro.status = resposta.status;
        throw erro;
      }
      return corpo;
    } finally {
      clearTimeout(limite);
    }
  }

  // Troca o código de 6 dígitos do painel pela chave deste computador.
  async parear(servidor, codigo) {
    const endereco = servidor.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/\S+$/.test(endereco)) throw new Error("Endereço do sistema inválido (ex.: https://seusistema.com.br).");
    if (!/^\d{6}$/.test(codigo.replace(/\s/g, ""))) throw new Error("O código tem 6 números.");
    this.o.salvarConfig({ servidor: endereco, chave: null });
    const r = await this.api(
      "/api/agente/parear",
      { method: "POST", body: JSON.stringify({ codigo: codigo.replace(/\s/g, ""), versao: this.o.versao }) },
      null,
    );
    this.o.salvarConfig({ servidor: endereco, chave: r.chave });
    this.atualizar({ restaurante: r.restaurante.nome, computador: r.agente.nome, mensagem: "" });
    this.ultimoEstadoEnviado = 0;
    this.iniciar();
    return r;
  }

  desconectar() {
    this.parar();
    this.o.salvarConfig({ ...this.config(), chave: null });
    this.atualizar({ situacao: "desconectado", restaurante: null, computador: null, impressoras: [], mensagem: "" });
  }

  iniciar() {
    if (this.rodando || !this.config().chave) {
      if (!this.config().chave) this.atualizar({ situacao: "desconectado" });
      return;
    }
    this.rodando = true;
    const laco = async () => {
      if (!this.rodando) return;
      await this.ciclo();
      if (this.rodando) this.temporizador = setTimeout(laco, INTERVALO_MS);
    };
    laco();
  }

  parar() {
    this.rodando = false;
    clearTimeout(this.temporizador);
  }

  async enviarEstado() {
    let impressorasWindows = [];
    try {
      impressorasWindows = await this.o.listarImpressoras();
    } catch {
      // Sem a lista, o painel só não sugere os nomes.
    }
    await this.api("/api/agente/estado", { method: "POST", body: JSON.stringify({ versao: this.o.versao, impressorasWindows }) });
    this.ultimoEstadoEnviado = Date.now();
  }

  async ciclo() {
    try {
      if (Date.now() - this.ultimoEstadoEnviado > INTERVALO_ESTADO_MS) await this.enviarEstado();
      const r = await this.api("/api/agente/trabalhos");
      const comErro = this.estado.situacao === "problema" && this.estado.mensagem;
      this.atualizar({
        situacao: comErro ? "problema" : "conectado",
        restaurante: r.restaurante.nome,
        computador: r.agente.nome,
        impressoras: r.impressoras,
      });
      let falhou = null;
      for (const t of r.trabalhos) {
        const resultado = await this.imprimir(t);
        if (!resultado.ok) falhou = `${t.impressora.nome}: ${resultado.erro}`;
        await this.api(`/api/agente/trabalhos/${t.id}`, { method: "POST", body: JSON.stringify(resultado) }).catch(() => {});
      }
      if (r.trabalhos.length > 0) this.atualizar({ situacao: falhou ? "problema" : "conectado", mensagem: falhou ?? "" });
    } catch (e) {
      if (e.status === 401) {
        // Chave revogada no painel ("Desconectar") ou restaurante fora do ar.
        this.parar();
        this.o.salvarConfig({ ...this.config(), chave: null });
        this.atualizar({ situacao: "desconectado", mensagem: "Este computador foi desconectado no painel. Pareie de novo." });
        return;
      }
      this.atualizar({ situacao: "sem_conexao", mensagem: "Sem conexão com o sistema. Confira a internet." });
    }
  }

  // Entrega um trabalho à impressora e devolve { ok, erro? }.
  async imprimir(t) {
    const imp = t.impressora;
    try {
      if (imp.conexao === "rede") {
        await enviarRede(imp.endereco, imp.porta, Buffer.from(t.dados, "base64"));
      } else if (imp.modo === "driver") {
        await this.o.imprimirDriver(imp.endereco, t.documento, imp.largura);
      } else {
        await this.o.imprimirRaw(imp.endereco, Buffer.from(t.dados, "base64"));
      }
      this.registrar({ tipo: t.tipo, impressora: imp.nome, ok: true });
      return { ok: true };
    } catch (e) {
      const erro = String(e?.message ?? e).slice(0, 280);
      this.registrar({ tipo: t.tipo, impressora: imp.nome, ok: false, erro });
      return { ok: false, erro };
    }
  }
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
      falhar(
        new Error(
          e.code === "ECONNREFUSED"
            ? "A impressora recusou a conexão."
            : e.code === "EHOSTUNREACH" || e.code === "ENETUNREACH"
              ? "Impressora fora da rede (confira o cabo/Wi-Fi e o IP)."
              : `Erro de rede: ${e.code ?? e.message}`,
        ),
      ),
    );
    socket.connect(porta, endereco, () => socket.end(bytes, () => resolver()));
  });
}

module.exports = { Nucleo, enviarRede };
