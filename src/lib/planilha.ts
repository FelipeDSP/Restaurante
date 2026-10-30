// Leitura de planilha no navegador, sem biblioteca: Excel (.xlsx) e CSV (Excel em português salva
// com ";" e acentos do Windows). Devolve as linhas da primeira aba como texto.

export async function lerPlanilha(arquivo: File): Promise<string[][]> {
  const nome = arquivo.name.toLowerCase();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  // .xlsx é um zip (começa com "PK").
  if (nome.endsWith(".xlsx") || (bytes[0] === 0x50 && bytes[1] === 0x4b)) return lerXlsx(bytes);
  if (nome.endsWith(".xls")) throw new Error("Esse é o formato antigo do Excel. Salve como .xlsx ou .csv e tente de novo.");
  return lerCsv(decodificar(bytes));
}

function decodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder("windows-1252").decode(bytes);
  }
  return texto.replace(/^﻿/, "");
}

export function lerCsv(texto: string): string[][] {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const contar = (c: string) => primeira.split(c).length - 1;
  const separador = [";", "\t", ","].reduce((melhor, c) => (contar(c) > contar(melhor) ? c : melhor), ";");

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

// --- .xlsx: zip com XML dentro --------------------------------------------------------------

async function lerXlsx(bytes: Uint8Array): Promise<string[][]> {
  const arquivos = await descompactar(bytes);
  const texto = (caminho: string) => (arquivos.has(caminho) ? new TextDecoder().decode(arquivos.get(caminho)) : null);
  const xml = (conteudo: string) => new DOMParser().parseFromString(conteudo, "application/xml");

  // Textos repetidos ficam numa lista à parte; a célula guarda só a posição.
  const compartilhados: string[] = [];
  const ss = texto("xl/sharedStrings.xml");
  if (ss) {
    for (const si of Array.from(xml(ss).getElementsByTagName("si"))) {
      compartilhados.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
    }
  }

  // Primeira aba, pela ordem do arquivo.
  let caminhoAba = "xl/worksheets/sheet1.xml";
  const wb = texto("xl/workbook.xml");
  const rels = texto("xl/_rels/workbook.xml.rels");
  if (wb && rels) {
    const aba = xml(wb).getElementsByTagName("sheet")[0];
    const rid = aba?.getAttribute("r:id") ?? aba?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = Array.from(xml(rels).getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
    const alvo = rel?.getAttribute("Target");
    if (alvo) caminhoAba = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
  }
  const folha = texto(caminhoAba);
  if (!folha) throw new Error("Não encontramos a planilha dentro do arquivo.");

  const linhas: string[][] = [];
  for (const row of Array.from(xml(folha).getElementsByTagName("row"))) {
    const n = Number(row.getAttribute("r") ?? linhas.length + 1) - 1;
    const linha: string[] = [];
    for (const c of Array.from(row.getElementsByTagName("c"))) {
      const coluna = indiceColuna(c.getAttribute("r") ?? "");
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let valor: string;
      if (tipo === "s") valor = compartilhados[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = Array.from(c.getElementsByTagName("t")).map((t) => t.textContent ?? "").join("");
      else valor = v;
      linha[coluna >= 0 ? coluna : linha.length] = valor;
    }
    linhas[n] = Array.from(linha, (v) => v ?? "");
  }
  return Array.from(linhas, (l) => l ?? []);
}

function indiceColuna(referencia: string): number {
  const letras = referencia.match(/^[A-Z]+/)?.[0];
  if (!letras) return -1;
  return [...letras].reduce((soma, l) => soma * 26 + (l.charCodeAt(0) - 64), 0) - 1;
}

// Zip mínimo: diretório central + arquivos guardados ou comprimidos (deflate).
async function descompactar(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error("Arquivo .xlsx inválido.");
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);

  const arquivos = new Map<string, Uint8Array>();
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Arquivo .xlsx inválido.");
    const metodo = dv.getUint16(p + 10, true);
    const tamanho = dv.getUint32(p + 20, true);
    const nomeLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const comentarioLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nomeLen));
    p += 46 + nomeLen + extraLen + comentarioLen;

    // Só o que interessa (o resto pode ser imagem grande).
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(nome)) continue;
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const dados = bytes.slice(inicio, inicio + tamanho);
    if (metodo === 0) arquivos.set(nome, dados);
    else if (metodo === 8) {
      const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      arquivos.set(nome, new Uint8Array(await new Response(fluxo).arrayBuffer()));
    }
  }
  return arquivos;
}

// --- Dinheiro e CSV de saída ------------------------------------------------------------------

// "25,90", "R$ 1.234,56", "25.9" (número do Excel) -> centavos. null = não é preço.
export function centavosDaPlanilha(valor: string): number | null {
  let t = valor.replace(/R\$|\s/gi, "").trim();
  if (!t) return null;
  const virgula = t.lastIndexOf(",");
  const ponto = t.lastIndexOf(".");
  if (virgula >= 0 && ponto >= 0) {
    // O último separador é o decimal.
    t = virgula > ponto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (virgula >= 0) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (ponto >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const centavos = Math.round(Number(t) * 100);
  return Number.isFinite(centavos) && centavos <= 100_000_000 ? centavos : null;
}

// CSV que o Excel em português abre direto (";", vírgula decimal, BOM para os acentos).
export function gerarCsv(linhas: (string | number)[][]): Blob {
  const celula = (v: string | number) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return new Blob(["﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
}
