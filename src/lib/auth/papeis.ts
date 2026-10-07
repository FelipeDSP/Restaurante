export const PAPEIS = ["dono", "caixa", "garcom", "cozinha"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Area = "painel" | "garcom" | "cozinha";

// Quem pode entrar em cada área da equipe.
export const PAPEIS_POR_AREA: Record<Area, readonly Papel[]> = {
  painel: ["dono", "caixa"],
  garcom: ["garcom", "dono", "caixa"],
  cozinha: ["cozinha", "dono", "caixa"],
};

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  caixa: "Caixa",
  garcom: "Garçom",
  cozinha: "Cozinha",
};

export function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export function rotaInicial(papel: Papel): "/painel" | "/garcom" | "/cozinha" {
  if (papel === "garcom") return "/garcom";
  if (papel === "cozinha") return "/cozinha";
  return "/painel";
}

export function podeAcessar(papel: Papel, area: Area): boolean {
  return PAPEIS_POR_AREA[area].includes(papel);
}
