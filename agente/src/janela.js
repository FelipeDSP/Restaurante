// Tela do app: conectar com o código do painel ou acompanhar as impressões.
const $ = (id) => document.getElementById(id);

const TIPO = { producao: "Pedido da praça", conta: "Conta", delivery: "Via do delivery", cancelamento: "Cancelamento", teste: "Teste" };
const SITUACAO = {
  conectado: "Imprimindo normalmente",
  sem_conexao: "Sem conexão com o sistema",
  problema: "Problema numa impressora",
  desconectado: "Não conectado",
};

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function item(conteudo) {
  const li = document.createElement("li");
  for (const [texto, classe] of conteudo) {
    const span = document.createElement("span");
    span.textContent = texto;
    if (classe) span.className = classe;
    li.appendChild(span);
  }
  return li;
}

let primeira = true;
function desenhar(estado) {
  const conectado = estado.situacao !== "desconectado";
  $("tela-parear").classList.toggle("oculto", conectado);
  $("tela-servico").classList.toggle("oculto", !conectado);
  $("versao").textContent = `Versão ${estado.versao}`;

  if (!conectado) {
    $("titulo").textContent = "Impressão de pedidos";
    $("subtitulo").textContent = "Imprime os pedidos nas impressoras da cozinha e do caixa";
    if (primeira && estado.servidor) $("servidor").value = estado.servidor;
    if (estado.mensagem) {
      $("erro-parear").textContent = estado.mensagem;
      $("erro-parear").classList.remove("oculto");
    }
  } else {
    $("titulo").textContent = estado.restaurante ? `Impressão · ${estado.restaurante}` : "Impressão";
    $("subtitulo").textContent = estado.computador ? `Este computador: ${estado.computador}` : "";
    $("situacao").className = `situacao ${estado.situacao}`;
    $("situacao-texto").textContent = SITUACAO[estado.situacao] ?? "";
    $("situacao-mensagem").textContent = estado.mensagem ?? "";

    const ultimos = new Map();
    for (const r of estado.registro) if (!ultimos.has(r.impressora)) ultimos.set(r.impressora, r);
    $("impressoras").replaceChildren(
      ...(estado.impressoras.length
        ? estado.impressoras.map((i) => {
            const r = ultimos.get(i.nome);
            const onde = i.conexao === "rede" ? `rede ${i.endereco}` : `USB ${i.endereco}${i.modo === "driver" ? " (driver)" : ""}`;
            return item([
              [i.nome, ""],
              [onde, "dica"],
              r ? (r.ok ? ["ok", "ok"] : ["erro", "falha"]) : ["", ""],
            ]);
          })
        : [item([["Nenhuma impressora cadastrada no painel.", "dica"]])]),
    );
    $("registro").replaceChildren(
      ...(estado.registro.length
        ? estado.registro.slice(0, 12).map((r) =>
            item([
              [hora(r.quando), "hora"],
              [`${TIPO[r.tipo] ?? r.tipo} → ${r.impressora}`, ""],
              r.ok ? ["impresso", "ok"] : [r.erro, "falha"],
            ]),
          )
        : [item([["Nada impresso desde que o app abriu.", "dica"]])]),
    );
    $("inicio").checked = estado.iniciarComWindows;
  }
  primeira = false;
}

$("codigo").addEventListener("input", (e) => {
  const digitos = e.target.value.replace(/\D/g, "").slice(0, 6);
  e.target.value = digitos.length > 3 ? `${digitos.slice(0, 3)} ${digitos.slice(3)}` : digitos;
});

$("form-parear").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erro-parear").classList.add("oculto");
  $("botao-parear").disabled = true;
  $("botao-parear").textContent = "Conectando...";
  const r = await window.agente.parear($("servidor").value, $("codigo").value);
  $("botao-parear").disabled = false;
  $("botao-parear").textContent = "Conectar";
  if (!r.ok) {
    $("erro-parear").textContent = r.erro;
    $("erro-parear").classList.remove("oculto");
  } else {
    $("codigo").value = "";
  }
});

$("botao-desconectar").addEventListener("click", async () => {
  if (!window.confirm("Desconectar este computador? Ele para de imprimir até ser conectado de novo.")) return;
  await window.agente.desconectar();
});

$("inicio").addEventListener("change", (e) => window.agente.definirInicioAutomatico(e.target.checked));

window.agente.aoMudar(desenhar);
window.agente.estado().then(desenhar);
