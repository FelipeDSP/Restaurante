export const PAPEIS = ["dono", "caixa", "garcom", "cozinha"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Area = "painel" | "garcom" | "cozinha";

// Módulos que o dono libera por pessoa (o dono tem todos). O banco confere os mesmos
// (rest_privado.tem_modulo); aqui decidem só o que aparece e para onde a pessoa vai.
export const MODULOS = ["caixa", "delivery", "comandas", "garcom", "cozinha"] as const;
export type Modulo = (typeof MODULOS)[number];

export const NOME_MODULO: Record<Modulo, string> = {
  caixa: "Caixa",
  delivery: "Delivery",
  comandas: "Comandas",
  garcom: "App do garçom",
  cozinha: "Tela da cozinha",
};

// Módulos de costume de cada papel: o papel é o atalho do cadastro.
export const MODULOS_DO_PAPEL: Record<Papel, readonly Modulo[]> = {
  dono: MODULOS,
  caixa: MODULOS,
  garcom: ["garcom"],
  cozinha: ["cozinha"],
};

// Módulos que abrem cada área.
const MODULOS_DA_AREA: Record<Area, readonly Modulo[]> = {
  painel: ["caixa", "delivery", "comandas"],
  garcom: ["garcom"],
  cozinha: ["cozinha"],
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

export function ehModulo(valor: string): valor is Modulo {
  return (MODULOS as readonly string[]).includes(valor);
}

// Módulos que valem para a pessoa (dono: todos; lista vazia antiga: os do papel).
export function modulosEfetivos(papel: Papel, modulos: readonly string[] | null | undefined): Modulo[] {
  if (papel === "dono") return [...MODULOS];
  const validos = (modulos ?? []).filter(ehModulo);
  return validos.length > 0 ? validos : [...MODULOS_DO_PAPEL[papel]];
}

export function podeAcessar(modulos: readonly Modulo[], area: Area): boolean {
  return MODULOS_DA_AREA[area].some((m) => modulos.includes(m));
}

export function rotaInicial(modulos: readonly Modulo[]): "/painel" | "/garcom" | "/cozinha" | "/sem-acesso" {
  if (podeAcessar(modulos, "painel")) return "/painel";
  if (podeAcessar(modulos, "garcom")) return "/garcom";
  if (podeAcessar(modulos, "cozinha")) return "/cozinha";
  return "/sem-acesso";
}
