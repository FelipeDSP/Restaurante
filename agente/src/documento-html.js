// Desenha o documento do servidor (linhas com estilo) como HTML do tamanho do papel,
// para imprimir pelo driver do Windows (modo "driver").
const escapar = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function documentoParaHtml(documento, largura = 80) {
  const util = largura === 58 ? 48 : 72; // área imprimível em mm
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
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${largura}mm auto; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { width: ${util}mm; padding: 2mm ${(largura - util) / 2}mm 6mm; font: 11pt/1.3 "Consolas", "Courier New", monospace; }
    .b { font-weight: 700; }
    .g { font-size: 17pt; line-height: 1.2; }
    .sep { border-top: 1px dashed #000; margin: 1.5mm 0; }
    .col { display: flex; justify-content: space-between; gap: 2mm; }
    .col span:first-child { overflow-wrap: anywhere; }
    .col span:last-child { white-space: nowrap; }
    div { overflow-wrap: anywhere; }
  </style></head><body>${linhas}</body></html>`;
}

module.exports = { documentoParaHtml };
