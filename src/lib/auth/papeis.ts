export const PAPEIS = ["dono", "caixa", "garcom"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Area = "painel" | "garcom";

// Quem pode entrar em cada área da equipe.
export const PAPEIS_POR_AREA: Record<Area, readonly Papel[]> = {
  painel: ["dono", "caixa"],
  garcom: ["garcom", "dono", "caixa"],
};

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  caixa: "Caixa",
  garcom: "Garçom",
};

export function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export function rotaInicial(papel: Papel): "/painel" | "/garcom" {
  return papel === "garcom" ? "/garcom" : "/painel";
}

export function podeAcessar(papel: Papel, area: Area): boolean {
  return PAPEIS_POR_AREA[area].includes(papel);
}
