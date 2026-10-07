// Gera os ícones do app (PNG) sem dependências: um recibo branco sobre fundo escuro,
// neutro (o app é white label), e a versão da bandeja com a bolinha de situação.
const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const zlib = require("node:zlib");

const TABELA_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
function png(lado, pixel) {
  const linhas = [];
  for (let y = 0; y < lado; y++) {
    const linha = Buffer.alloc(1 + lado * 4);
    for (let x = 0; x < lado; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      linha.set([r, g, b, a], 1 + x * 4);
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", zlib.deflateSync(Buffer.concat(linhas))),
    bloco("IEND", Buffer.alloc(0)),
  ]);
}

const FUNDO = [31, 41, 55];
const PAPEL = [255, 255, 255];
const TINTA = [156, 163, 175];
const TRANSPARENTE = [0, 0, 0, 0];

// Desenho em coordenadas 0..1.
function recibo(u, v, raio = 0.2) {
  // Fundo arredondado
  const dx = Math.max(raio - u, 0, u - (1 - raio));
  const dy = Math.max(raio - v, 0, v - (1 - raio));
  if (dx * dx + dy * dy > raio * raio) return TRANSPARENTE;
  // Recibo com borda serrilhada embaixo
  if (u > 0.27 && u < 0.73 && v > 0.16) {
    const dente = 0.06;
    const fase = ((u - 0.27) % dente) / dente;
    const base = 0.82 + (fase < 0.5 ? fase : 1 - fase) * dente;
    if (v < base) {
      const linha = [0.32, 0.42, 0.52, 0.62].some((l) => Math.abs(v - l) < 0.025) && u > 0.34 && u < (v > 0.6 ? 0.55 : 0.66);
      return [...(linha ? TINTA : PAPEL), 255];
    }
  }
  return [...FUNDO, 255];
}

const pasta = join(__dirname, "..", "build");
mkdirSync(pasta, { recursive: true });
writeFileSync(join(pasta, "icone.png"), png(256, (x, y) => recibo(x / 256, y / 256)));

const SITUACOES = { verde: [22, 163, 74], amarelo: [234, 179, 8], vermelho: [220, 38, 38], cinza: [107, 114, 128] };
for (const [nome, cor] of Object.entries(SITUACOES)) {
  writeFileSync(
    join(pasta, `bandeja-${nome}.png`),
    png(32, (x, y) => {
      const u = x / 32;
      const v = y / 32;
      // Bolinha de situação no canto inferior direito, com contorno escuro.
      const d = Math.hypot(u - 0.76, v - 0.76);
      if (d < 0.2) return [...cor, 255];
      if (d < 0.26) return [...FUNDO, 255];
      return recibo(u, v, 0.18);
    }),
  );
}
console.log(`Ícones gerados em ${pasta}`);
