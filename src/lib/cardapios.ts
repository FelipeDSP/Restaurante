// Cardápios por horário (almoço e janta) e dia da semana do produto.
// A conta de "qual cardápio vale agora" é do banco (rest_privado.cardapios_agora); aqui só ficam
// os tipos e os rótulos das telas.

import { DIAS, type Dia, NOME_DIA } from "@/lib/horarios";

export type Cardapio = {
  id: string;
  nome: string;
  // 0 = domingo, igual ao banco.
  dias: number[];
  abre: string;
  fecha: string;
  ativo: boolean;
};

export const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export const ABREV_DIA: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };

// "11:00:00" -> "11:00".
export function horaCurta(hora: string): string {
  return hora.slice(0, 5);
}

export function diasValidos(dias: number[]): number[] {
  return [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
}

// "todos os dias", "seg a sex", "qua" ou "sáb e dom".
export function rotuloDias(dias: number[]): string {
  const lista = diasValidos(dias);
  if (lista.length === 0 || lista.length === 7) return "todos os dias";
  const seguidos = lista.every((d, i) => i === 0 || d === lista[i - 1] + 1);
  const nomes = lista.map((d) => ABREV_DIA[d].toLowerCase());
  if (seguidos && lista.length > 2) return `${nomes[0]} a ${nomes[nomes.length - 1]}`;
  return nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : nomes.join(", ");
}

// "11:00 às 15:00" (com aviso quando a janela passa da meia-noite).
export function rotuloJanela(abre: string, fecha: string): string {
  const a = horaCurta(abre);
  const f = horaCurta(fecha);
  if (a === f) return "24 horas";
  return fecha <= abre ? `${a} às ${f} do dia seguinte` : `${a} às ${f}`;
}

// "Almoço · todos os dias, 11:00 às 15:00".
export function resumoCardapio(cardapio: Pick<Cardapio, "nome" | "dias" | "abre" | "fecha">): string {
  return `${cardapio.nome} · ${rotuloDias(cardapio.dias)}, ${rotuloJanela(cardapio.abre, cardapio.fecha)}`;
}

// Por que este produto não está no cardápio de agora (null = está). Só para a tela da equipe
// avisar; quem decide de verdade é o banco.
export function foraDoCardapio(
  produto: { dias: number[] | null; cardapios: string[] },
  agora: { cardapios: string[]; dia: number },
  nomesDeCardapio: Map<string, string>,
): string | null {
  if (produto.dias && produto.dias.length > 0 && !produto.dias.includes(agora.dia)) {
    return `Só ${rotuloDias(produto.dias)}`;
  }
  if (produto.cardapios.length === 0) return null;
  if (produto.cardapios.some((id) => agora.cardapios.includes(id))) return null;
  const nomes = produto.cardapios.map((id) => nomesDeCardapio.get(id)).filter(Boolean);
  return nomes.length > 0 ? `Só no cardápio ${nomes.join(" / ")}` : "Fora do cardápio de agora";
}

// Dias da semana para os botões da tela, começando no domingo (igual ao banco).
export const DIAS_SEMANA: { valor: number; nome: string; abrev: string }[] = DIAS.map((dia: Dia, i) => ({
  valor: i,
  nome: NOME_DIA[dia],
  abrev: ABREV_DIA[i],
}));
