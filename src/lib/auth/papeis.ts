export const PAPEIS = ["dono", "caixa", "garcom", "cozinha", "equipe"] as const;
export type Papel = (typeof PAPEIS)[number];

export type Area = "painel" | "garcom" | "cozinha";

// Permissões que o dono dá por função (Caixa, Garçom, Cozinha ou as que ele criar) e ajusta por pessoa.
// O banco confere as mesmas (rest_privado.tem_permissao); aqui decidem o que aparece e para onde ir.
export const PERMISSOES = [
  "caixa_operar",
  "caixa_estornar",
  "delivery",
  "comandas_painel",
  "comandas_gerenciar",
  "garcom_app",
  "cozinha_tela",
  "relatorios",
  "cardapio",
  "mesas",
  "cupons",
  "entregadores",
  "impressao",
  "restaurante",
] as const;
export type Permissao = (typeof PERMISSOES)[number];

export const NOME_PERMISSAO: Record<Permissao, string> = {
  caixa_operar: "Abrir e fechar o caixa",
  caixa_estornar: "Estornar pagamento",
  delivery: "Delivery",
  comandas_painel: "Comandas no painel",
  comandas_gerenciar: "Trocar garçom e cancelar mesa",
  garcom_app: "App do garçom",
  cozinha_tela: "Tela da cozinha",
  relatorios: "Relatórios",
  cardapio: "Cardápio",
  mesas: "Cadastro de mesas",
  cupons: "Cupons",
  entregadores: "Entregadores",
  impressao: "Setores e impressoras",
  restaurante: "Dados do restaurante",
};

export const GRUPOS_PERMISSOES: { titulo: string; itens: Permissao[] }[] = [
  {
    titulo: "Operação",
    itens: ["caixa_operar", "caixa_estornar", "delivery", "comandas_painel", "comandas_gerenciar", "garcom_app", "cozinha_tela"],
  },
  { titulo: "Gestão", itens: ["relatorios", "cardapio", "mesas", "cupons", "entregadores", "impressao", "restaurante"] },
];

// Permissões que abrem cada área.
const PERMISSOES_DA_AREA: Record<Area, readonly Permissao[]> = {
  painel: PERMISSOES.filter((p) => !["garcom_app", "cozinha_tela", "comandas_gerenciar"].includes(p)),
  garcom: ["garcom_app"],
  cozinha: ["cozinha_tela"],
};

export const NOME_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  caixa: "Caixa",
  garcom: "Garçom",
  cozinha: "Cozinha",
  equipe: "Equipe",
};

export function ehPapel(valor: string): valor is Papel {
  return (PAPEIS as readonly string[]).includes(valor);
}

export function ehPermissao(valor: string): valor is Permissao {
  return (PERMISSOES as readonly string[]).includes(valor);
}

// Mesma conta do banco (rest_privado.permissoes_membro): dono tem todas; equipe tem
// (as da função + as dadas a ela) − as tiradas dela.
export function permissoesEfetivas(
  papel: Papel,
  daFuncao: readonly string[] | null | undefined,
  extras: readonly string[] | null | undefined,
  removidas: readonly string[] | null | undefined,
): Permissao[] {
  if (papel === "dono") return [...PERMISSOES];
  const tiradas = new Set(removidas ?? []);
  const todas = new Set([...(daFuncao ?? []), ...(extras ?? [])]);
  return PERMISSOES.filter((p) => todas.has(p) && !tiradas.has(p));
}

export function podeAcessar(permissoes: readonly Permissao[], area: Area): boolean {
  return PERMISSOES_DA_AREA[area].some((p) => permissoes.includes(p));
}

export function rotaInicial(permissoes: readonly Permissao[]): "/painel" | "/garcom" | "/cozinha" | "/sem-acesso" {
  if (podeAcessar(permissoes, "painel")) return "/painel";
  if (podeAcessar(permissoes, "garcom")) return "/garcom";
  if (podeAcessar(permissoes, "cozinha")) return "/cozinha";
  return "/sem-acesso";
}
