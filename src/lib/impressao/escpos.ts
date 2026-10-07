// Documento de impressão neutro (linhas com estilo) e conversão para comandos ESC/POS,
// o padrão das impressoras térmicas (Elgin, Epson, Bematech...).
// O servidor monta os bytes; o app do computador do caixa só os entrega à impressora.

export type Linha =
  | { tipo: "texto"; texto: string; alinhar?: "esquerda" | "centro" | "direita"; negrito?: boolean; grande?: boolean }
  | { tipo: "colunas"; esquerda: string; direita: string; negrito?: boolean; grande?: boolean }
  | { tipo: "separador"; caractere?: string }
  | { tipo: "espaco"; linhas?: number };

export type Documento = { linhas: Linha[] };

export type Codificacao = "cp850" | "cp1252" | "sem_acentos";

const ESC = 0x1b;
const GS = 0x1d;

// Letras do português nas tabelas de caracteres mais comuns das térmicas.
const CP850: Record<string, number> = {
  á: 0xa0, à: 0x85, â: 0x83, ã: 0xc6, é: 0x82, ê: 0x88, í: 0xa1, ó: 0xa2, ô: 0x93, õ: 0xe4, ú: 0xa3, ü: 0x81, ç: 0x87,
  Á: 0xb5, À: 0xb7, Â: 0xb6, Ã: 0xc7, É: 0x90, Ê: 0xd2, Í: 0xd6, Ó: 0xe0, Ô: 0xe2, Õ: 0xe5, Ú: 0xe9, Ü: 0x9a, Ç: 0x80,
  º: 0xa7, ª: 0xa6, "°": 0xf8, "·": 0xfa,
};

function semAcento(c: string): string {
  return c.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Texto -> bytes na tabela escolhida; o que não existir vira a letra sem acento (ou "?").
function codificar(texto: string, codificacao: Codificacao): number[] {
  const bytes: number[] = [];
  const normalizado = texto
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
  for (const c of normalizado) {
    const codigo = c.charCodeAt(0);
    if (codigo < 0x80) {
      bytes.push(codigo);
    } else if (codificacao === "cp850" && CP850[c] !== undefined) {
      bytes.push(CP850[c]);
    } else if (codificacao === "cp1252" && codigo <= 0xff) {
      bytes.push(codigo); // Latin-1 = CP1252 nessa faixa
    } else {
      const base = semAcento(c);
      bytes.push(base.length === 1 && base.charCodeAt(0) < 0x80 ? base.charCodeAt(0) : 0x3f);
    }
  }
  return bytes;
}

// Quebra em linhas de até `largura` caracteres, sem cortar palavras quando dá.
export function quebrar(texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split("\n")) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      if (!atual) atual = palavra;
      else if (atual.length + 1 + palavra.length <= largura) atual += ` ${palavra}`;
      else {
        linhas.push(atual);
        atual = palavra;
      }
      while (atual.length > largura) {
        linhas.push(atual.slice(0, largura));
        atual = atual.slice(largura);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

export function colunasDoPapel(larguraMm: 58 | 80): number {
  return larguraMm === 58 ? 32 : 48;
}

// Documento -> bytes ESC/POS (inicia, escreve, avança e corta).
export function paraEscPos(doc: Documento, opcoes: { largura: 58 | 80; codificacao: Codificacao }): Uint8Array {
  const total = colunasDoPapel(opcoes.largura);
  const saida: number[] = [ESC, 0x40]; // inicializa
  if (opcoes.codificacao === "cp850") saida.push(ESC, 0x74, 2);
  if (opcoes.codificacao === "cp1252") saida.push(ESC, 0x74, 16);

  const alinhar = (a: "esquerda" | "centro" | "direita" = "esquerda") =>
    saida.push(ESC, 0x61, a === "centro" ? 1 : a === "direita" ? 2 : 0);
  const estilo = (negrito = false, grande = false) => {
    saida.push(ESC, 0x45, negrito ? 1 : 0);
    saida.push(GS, 0x21, grande ? 0x11 : 0x00); // altura e largura dobradas
  };
  const escrever = (texto: string) => saida.push(...codificar(texto, opcoes.codificacao), 0x0a);

  for (const linha of doc.linhas) {
    if (linha.tipo === "texto") {
      const largura = linha.grande ? Math.floor(total / 2) : total;
      alinhar(linha.alinhar);
      estilo(linha.negrito, linha.grande);
      for (const parte of quebrar(linha.texto, largura)) escrever(parte);
    } else if (linha.tipo === "colunas") {
      const largura = linha.grande ? Math.floor(total / 2) : total;
      alinhar("esquerda");
      estilo(linha.negrito, linha.grande);
      const direita = linha.direita.slice(0, largura);
      const espaco = largura - direita.length - 1;
      const partes = quebrar(linha.esquerda, Math.max(1, espaco));
      partes.forEach((parte, i) => {
        if (i === partes.length - 1) escrever(parte.padEnd(espaco) + " " + direita);
        else escrever(parte);
      });
    } else if (linha.tipo === "separador") {
      alinhar("esquerda");
      estilo();
      escrever((linha.caractere ?? "-").repeat(total));
    } else {
      saida.push(ESC, 0x64, Math.min(10, linha.linhas ?? 1)); // avança n linhas
    }
  }

  estilo();
  alinhar("esquerda");
  saida.push(ESC, 0x64, 4); // margem para o corte
  saida.push(GS, 0x56, 0x42, 0x00); // corte parcial
  return Uint8Array.from(saida);
}

// Versão em texto puro (prévia no painel e testes).
export function paraTexto(doc: Documento, larguraMm: 58 | 80): string {
  const total = colunasDoPapel(larguraMm);
  const linhas: string[] = [];
  for (const l of doc.linhas) {
    if (l.tipo === "texto") {
      const largura = l.grande ? Math.floor(total / 2) : total;
      for (const parte of quebrar(l.texto, largura)) {
        const texto = l.grande ? parte.split("").join(" ") : parte;
        linhas.push(l.alinhar === "centro" ? texto.padStart(Math.floor((total + texto.length) / 2)) : l.alinhar === "direita" ? texto.padStart(total) : texto);
      }
    } else if (l.tipo === "colunas") {
      const espaco = total - l.direita.length - 1;
      linhas.push(l.esquerda.slice(0, espaco).padEnd(espaco) + " " + l.direita);
    } else if (l.tipo === "separador") {
      linhas.push((l.caractere ?? "-").repeat(total));
    } else {
      for (let i = 0; i < (l.linhas ?? 1); i++) linhas.push("");
    }
  }
  return linhas.join("\n");
}
