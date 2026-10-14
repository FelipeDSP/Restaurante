// Desenha o documento do servidor (linhas com estilo) como HTML do tamanho do papel,
// para imprimir pelo driver do Windows (modo "driver").
// largura: 58 ou 80 = bobina (mm); 210 = folha A4 (impressora comum).
const escapar = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const A4 = 210;

function estiloDoPapel(largura) {
  if (largura === A4) {
    // Folha A4: o ticket numa coluna centralizada e com letra maior (fica legível de longe
    // e não espalha o preço até a outra ponta da folha). Folhas seguintes se precisar.
    return `
    @page { size: A4; margin: 0; }
    body { width: 120mm; margin: 0 auto; padding: 15mm 0; font: 14pt/1.35 "Consolas", "Courier New", monospace; }
    .g { font-size: 24pt; line-height: 1.2; }
    .sep { margin: 2.5mm 0; }`;
  }
  const util = largura === 58 ? 48 : 72; // área imprimível em mm
  return `
    @page { size: ${largura}mm auto; margin: 0; }
    body { width: ${util}mm; padding: 2mm ${(largura - util) / 2}mm 6mm; font: 11pt/1.3 "Consolas", "Courier New", monospace; }
    .g { font-size: 17pt; line-height: 1.2; }
    .sep { margin: 1.5mm 0; }`;
}

function documentoParaHtml(documento, largura = 80) {
  const linhas = (documento?.linhas ?? [])
    .map((l) => {
      if (l.tipo === "separador") return '<div class="sep"></div>';
      if (l.tipo === "espaco") return `<div style="height:${(l.linhas ?? 1) * 1.2}em"></div>`;
      const classes = [l.negrito ? "b" : "", l.grande ? "g" : ""].join(" ");
      if (l.tipo === "colunas") {
        return `<div class="col ${classes}"><span>${escapar(l.esquerda)}</span><span>${escapar(l.direita)}</span></div>`;
      }
      return `<div class="${classes}" style="text-align:${l.alinhar === "centro" ? "center" : l.alinhar === "direita" ? "right" : "left"}">${escapar(l.texto)}</div>`;
    })
    .join("\n");
  // Nome do trabalho na fila do Windows: a linha em destaque ("DELIVERY nº 12", "CONTA · MESA 5").
  const destaque = (documento?.linhas ?? []).find((l) => l.grande && (l.texto || l.esquerda));
  const titulo = destaque ? destaque.texto || destaque.esquerda : "Impressão";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    ${estiloDoPapel(largura)}
    .b { font-weight: 700; }
    .sep { border-top: 1px dashed #000; }
    .col { display: flex; justify-content: space-between; gap: 2mm; }
    .col span:first-child { overflow-wrap: anywhere; }
    .col span:last-child { white-space: nowrap; }
    div { overflow-wrap: anywhere; }
  </style></head><body>${linhas}</body></html>`;
}

module.exports = { documentoParaHtml, A4 };
