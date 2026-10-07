// App de impressão (Windows): fica perto do relógio, busca os pedidos no sistema e imprime.
// White label: nenhuma marca da plataforma; depois de pareado mostra o nome do restaurante.
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, safeStorage } = require("electron");
const { appendFileSync, existsSync, readFileSync, statSync, writeFileSync, renameSync } = require("node:fs");
const { join } = require("node:path");

const { documentoParaHtml } = require("./documento-html");
const { Nucleo } = require("./nucleo");
const { imprimirRaw } = require("./windows");

const ARGS = process.argv.slice(1);
// Aceita --nome=valor (preferível: o Chromium não confunde com outros argumentos) e --nome valor.
const arg = (nome) => {
  const comIgual = ARGS.find((a) => a.startsWith(`${nome}=`));
  if (comIgual) return comIgual.slice(nome.length + 1);
  const i = ARGS.indexOf(nome);
  return i >= 0 ? ARGS[i + 1] : undefined;
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId("app.impressao.restaurante");

const pastaDados = () => app.getPath("userData");
const arquivoConfig = () => join(pastaDados(), "config.json");
const arquivoLog = () => join(pastaDados(), "impressao.log");
const icone = (nome) => join(__dirname, "..", "build", `${nome}.png`);

// Registro simples para suporte (no máximo ~200 KB, depois guarda o anterior).
function log(mensagem) {
  try {
    if (existsSync(arquivoLog()) && statSync(arquivoLog()).size > 200_000) renameSync(arquivoLog(), `${arquivoLog()}.anterior`);
    appendFileSync(arquivoLog(), `${new Date().toISOString()} ${mensagem}\n`);
  } catch {
    // Sem log não impede de imprimir.
  }
}

// ---------------------------------------------------------------------------
// Configuração (a chave do computador fica cifrada pelo Windows)
// ---------------------------------------------------------------------------

function lerArquivoConfig() {
  try {
    return JSON.parse(readFileSync(arquivoConfig(), "utf8"));
  } catch {
    return {};
  }
}

function lerConfig() {
  const c = lerArquivoConfig();
  let chave = null;
  if (c.chaveCifrada) {
    try {
      const bytes = Buffer.from(c.chaveCifrada, "base64");
      chave = c.cifrada && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(bytes) : bytes.toString("utf8");
    } catch {
      chave = null;
    }
  }
  return { servidor: c.servidor ?? process.env.SERVIDOR_PADRAO ?? "", chave, iniciarComWindows: c.iniciarComWindows !== false };
}

function salvarConfig(novo) {
  const atual = lerArquivoConfig();
  const proximo = { ...atual };
  if ("servidor" in novo) proximo.servidor = novo.servidor;
  if ("iniciarComWindows" in novo) proximo.iniciarComWindows = novo.iniciarComWindows;
  if ("chave" in novo) {
    if (!novo.chave) {
      delete proximo.chaveCifrada;
      delete proximo.cifrada;
    } else if (safeStorage.isEncryptionAvailable()) {
      proximo.chaveCifrada = safeStorage.encryptString(novo.chave).toString("base64");
      proximo.cifrada = true;
    } else {
      proximo.chaveCifrada = Buffer.from(novo.chave, "utf8").toString("base64");
      proximo.cifrada = false;
    }
  }
  writeFileSync(arquivoConfig(), JSON.stringify(proximo, null, 2));
}

// ---------------------------------------------------------------------------
// Impressão pelo driver do Windows: desenha o ticket numa janela invisível e imprime
// ---------------------------------------------------------------------------

async function listarImpressoras() {
  const janela = new BrowserWindow({ show: false });
  try {
    return (await janela.webContents.getPrintersAsync()).map((p) => p.name);
  } finally {
    janela.destroy();
  }
}

async function imprimirDriver(impressora, documento, largura) {
  const nomes = await listarImpressoras();
  if (!nomes.includes(impressora)) throw new Error(`Impressora não encontrada no Windows: ${impressora}`);
  const janela = new BrowserWindow({ show: false, webPreferences: { javascript: true } });
  try {
    await janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentoParaHtml(documento, largura))}`);
    const alturaPx = await janela.webContents.executeJavaScript("document.body.scrollHeight");
    const alturaMicrons = Math.max(50_000, Math.ceil((alturaPx * 25_400) / 96));
    await new Promise((resolver, rejeitar) =>
      janela.webContents.print(
        {
          silent: true,
          deviceName: impressora,
          printBackground: false,
          margins: { marginType: "none" },
          pageSize: { width: largura * 1000, height: alturaMicrons },
        },
        (ok, motivo) => (ok ? resolver() : rejeitar(new Error(`O Windows não imprimiu: ${motivo || "erro desconhecido"}`))),
      ),
    );
  } finally {
    janela.destroy();
  }
}

// ---------------------------------------------------------------------------
// Janela, bandeja e núcleo
// ---------------------------------------------------------------------------

let janela = null;
let bandeja = null;
let saindo = false;

const nucleo = new Nucleo({
  versao: app.getVersion(),
  lerConfig,
  salvarConfig,
  imprimirRaw,
  imprimirDriver,
  listarImpressoras,
});

const ICONE_DA_SITUACAO = { conectado: "bandeja-verde", sem_conexao: "bandeja-amarelo", problema: "bandeja-vermelho", desconectado: "bandeja-cinza" };
const TEXTO_DA_SITUACAO = {
  conectado: "Imprimindo normalmente",
  sem_conexao: "Sem conexão com o sistema",
  problema: "Problema numa impressora",
  desconectado: "Não conectado a um restaurante",
};

let situacaoAnterior = null;
nucleo.on("estado", (estado) => {
  if (bandeja) {
    bandeja.setImage(nativeImage.createFromPath(icone(ICONE_DA_SITUACAO[estado.situacao] ?? "bandeja-cinza")));
    bandeja.setToolTip(`${estado.restaurante ? `${estado.restaurante} · ` : ""}${TEXTO_DA_SITUACAO[estado.situacao] ?? ""}`);
  }
  if (estado.situacao !== situacaoAnterior) {
    log(`situação: ${estado.situacao}${estado.mensagem ? ` (${estado.mensagem})` : ""}`);
    situacaoAnterior = estado.situacao;
  }
  janela?.webContents.send("estado", estadoParaJanela());
});
nucleo.on("registro", (item) => {
  if (!item.ok) log(`falha: ${item.tipo} -> ${item.impressora}: ${item.erro}`);
});

function estadoParaJanela() {
  const c = lerConfig();
  return { ...nucleo.estado, servidor: c.servidor, iniciarComWindows: c.iniciarComWindows, versao: app.getVersion() };
}

function abrirJanela() {
  if (janela) {
    janela.show();
    janela.focus();
    return;
  }
  janela = new BrowserWindow({
    width: 480,
    height: 680,
    minWidth: 400,
    title: "Impressão",
    icon: icone("icone"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.loadFile(join(__dirname, "janela.html"));
  janela.once("ready-to-show", () => janela.show());
  // Fechar a janela não para a impressão: o app continua perto do relógio.
  janela.on("close", (e) => {
    if (!saindo) {
      e.preventDefault();
      janela.hide();
    }
  });
  janela.on("closed", () => {
    janela = null;
  });
}

function criarBandeja() {
  bandeja = new Tray(nativeImage.createFromPath(icone("bandeja-cinza")));
  bandeja.setToolTip("Impressão");
  bandeja.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir", click: abrirJanela },
      { type: "separator" },
      {
        label: "Sair (para de imprimir)",
        click: () => {
          saindo = true;
          app.quit();
        },
      },
    ]),
  );
  bandeja.on("click", abrirJanela);
}

function aplicarInicioAutomatico(ligado) {
  if (!app.isPackaged) return; // em desenvolvimento não registra
  app.setLoginItemSettings({ openAtLogin: ligado, args: ["--oculto"] });
}

// ---------------------------------------------------------------------------
// Atualização automática (arquivos publicados no próprio sistema)
// ---------------------------------------------------------------------------

function configurarAtualizacao() {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return;
  }
  const verificar = () => {
    const { servidor } = lerConfig();
    if (!servidor) return;
    autoUpdater.setFeedURL({ provider: "generic", url: `${servidor.replace(/\/+$/, "")}/downloads/impressao` });
    autoUpdater.checkForUpdates().catch((e) => log(`atualização: ${String(e.message).split("\n")[0]}`));
  };
  autoUpdater.autoDownload = true;
  autoUpdater.on("update-downloaded", (info) => {
    log(`atualização ${info.version} baixada; instalando quando não houver impressão em andamento`);
    const instalar = setInterval(() => {
      const ultimo = nucleo.estado.registro[0];
      const parado = !ultimo || Date.now() - new Date(ultimo.quando).getTime() > 60_000;
      if (parado) {
        clearInterval(instalar);
        saindo = true;
        autoUpdater.quitAndInstall(true, true);
      }
    }, 30_000);
  });
  verificar();
  setInterval(verificar, 6 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Comunicação com a janela
// ---------------------------------------------------------------------------

ipcMain.handle("estado", () => estadoParaJanela());
ipcMain.handle("parear", async (_e, servidor, codigo) => {
  try {
    const r = await nucleo.parear(String(servidor ?? ""), String(codigo ?? ""));
    log(`pareado com ${r.restaurante.nome} como ${r.agente.nome}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
});
ipcMain.handle("desconectar", () => {
  nucleo.desconectar();
  log("desconectado pelo usuário");
  return { ok: true };
});
ipcMain.handle("inicio-automatico", (_e, ligado) => {
  salvarConfig({ iniciarComWindows: Boolean(ligado) });
  aplicarInicioAutomatico(Boolean(ligado));
  return { ok: true };
});

app.on("second-instance", abrirJanela);
app.on("window-all-closed", () => {
  // Continua na bandeja.
});
app.on("before-quit", () => {
  saindo = true;
  nucleo.parar();
});

app.whenReady().then(async () => {
  criarBandeja();
  aplicarInicioAutomatico(lerConfig().iniciarComWindows);
  log(`iniciado v${app.getVersion()}`);

  // Pareamento direto pela linha de comando (suporte/testes): --servidor=URL --parear=123456
  const codigo = arg("--parear");
  if (codigo) {
    try {
      await nucleo.parear(arg("--servidor") ?? lerConfig().servidor, codigo);
    } catch (e) {
      log(`pareamento pela linha de comando falhou: ${e.message}`);
    }
  }

  nucleo.iniciar();
  if (!ARGS.includes("--oculto") || !lerConfig().chave) abrirJanela();
  configurarAtualizacao();
});
