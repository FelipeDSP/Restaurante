// Impressora térmica de mentira para testar sem hardware: escuta na porta 9100 (como as
// impressoras de rede), mostra no terminal o texto que sairia no papel e salva os bytes.
//
// Uso: node scripts/impressora-falsa.mjs [--porta 9100] [--pasta tmp/impressoes] [--falhar]
//   --falhar  recusa as conexões (simula impressora desligada / sem papel)
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({
  options: {
    porta: { type: "string", default: "9100" },
    pasta: { type: "string", default: "tmp/impressoes" },
    falhar: { type: "boolean", default: false },
  },
});

// Tabela PC850 -> letras do português (o resto do ASCII passa direto).
const CP850 = {
  0xa0: "á", 0x85: "à", 0x83: "â", 0xc6: "ã", 0x82: "é", 0x88: "ê", 0xa1: "í", 0xa2: "ó", 0x93: "ô", 0xe4: "õ", 0xa3: "ú", 0x81: "ü", 0x87: "ç",
  0xb5: "Á", 0xb7: "À", 0xb6: "Â", 0xc7: "Ã", 0x90: "É", 0xd2: "Ê", 0xd6: "Í", 0xe0: "Ó", 0xe2: "Ô", 0xe5: "Õ", 0xe9: "Ú", 0x9a: "Ü", 0x80: "Ç",
  0xa7: "º", 0xa6: "ª", 0xf8: "°", 0xfa: "·",
};

// Remove os comandos ESC/POS e converte o texto.
function paraTexto(bytes) {
  let saida = "";
  let corte = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x1b) {
      const cmd = bytes[i + 1];
      if (cmd === 0x40) i += 1; // ESC @
      else if (cmd === 0x64) i += 2; // ESC d n (avança)
      else i += 2; // ESC a/E/t n
      continue;
    }
    if (b === 0x1d) {
      const cmd = bytes[i + 1];
      if (cmd === 0x56) {
        corte = true;
        i += 3; // GS V 66 n
      } else i += 2; // GS ! n
      continue;
    }
    if (b === 0x0a) saida += "\n";
    else if (b >= 0x20 && b < 0x80) saida += String.fromCharCode(b);
    else saida += CP850[b] ?? "?";
  }
  return { texto: saida, corte };
}

mkdirSync(a.pasta, { recursive: true });
let contador = 0;

const servidor = createServer((socket) => {
  if (a.falhar) {
    socket.destroy();
    return;
  }
  const partes = [];
  socket.on("data", (d) => partes.push(d));
  socket.on("end", () => {
    const bytes = Buffer.concat(partes);
    contador += 1;
    const arquivo = join(a.pasta, `ticket-${Date.now()}-${contador}.bin`);
    writeFileSync(arquivo, bytes);
    const { texto, corte } = paraTexto(bytes);
    console.log(`\n========== papel nº ${contador} (${bytes.length} bytes${corte ? ", cortado" : ""}) ==========`);
    console.log(texto.replace(/\n+$/, ""));
    console.log("=".repeat(60));
  });
});

servidor.listen(Number(a.porta), () => {
  console.log(`Impressora falsa ouvindo na porta ${a.porta}${a.falhar ? " (recusando tudo)" : ""}. Bytes em ${a.pasta}/`);
});
