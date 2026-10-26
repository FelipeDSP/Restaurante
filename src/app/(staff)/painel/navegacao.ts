import type { Modulo, Papel } from "@/lib/auth/papeis";

export type GrupoNavegacao = "Operação" | "Cadastros" | "Ajustes";

export type Secao = { href: string; rotulo: string };

// "secoes": páginas que ficam dentro do mesmo item do menu, mostradas como abas no topo.
// "acesso": o módulo que mostra o item ("painel" = qualquer módulo do painel; "dono" = só o dono).
// "soEquipe": some para o dono (que vê a versão completa em outro item).
export type ItemNavegacao = {
  href: string;
  rotulo: string;
  grupo: GrupoNavegacao;
  acesso: Modulo | "painel" | "dono";
  soEquipe?: boolean;
  secoes?: Secao[];
};

export const GRUPOS: GrupoNavegacao[] = ["Operação", "Cadastros", "Ajustes"];

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", acesso: "painel" },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", acesso: "delivery" },
  { href: "/painel/comandas", rotulo: "Comandas", grupo: "Operação", acesso: "comandas" },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", acesso: "caixa" },
  { href: "/painel/relatorios", rotulo: "Relatórios", grupo: "Operação", acesso: "dono" },
  // O dono e o caixa também atendem mesas: o mesmo app do garçom (abrir mesa, lançar, cobrar, fechar).
  { href: "/garcom", rotulo: "App do garçom", grupo: "Operação", acesso: "garcom" },
  { href: "/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", acesso: "cozinha" },
  {
    href: "/painel/produtos",
    rotulo: "Cardápio",
    grupo: "Cadastros",
    acesso: "dono",
    secoes: [
      { href: "/painel/produtos", rotulo: "Produtos" },
      { href: "/painel/categorias", rotulo: "Categorias" },
      { href: "/painel/adicionais", rotulo: "Adicionais" },
    ],
  },
  { href: "/painel/mesas", rotulo: "Mesas", grupo: "Cadastros", acesso: "dono" },
  { href: "/painel/cupons", rotulo: "Cupons", grupo: "Cadastros", acesso: "dono" },
  { href: "/painel/equipe", rotulo: "Equipe", grupo: "Cadastros", acesso: "dono" },
  {
    href: "/painel/restaurante",
    rotulo: "Restaurante",
    grupo: "Ajustes",
    acesso: "dono",
    secoes: [
      { href: "/painel/restaurante", rotulo: "Dados e delivery" },
      { href: "/painel/entregadores", rotulo: "Entregadores" },
    ],
  },
  {
    href: "/painel/pracas",
    rotulo: "Cozinha e impressão",
    grupo: "Ajustes",
    acesso: "dono",
    secoes: [
      { href: "/painel/pracas", rotulo: "Setores" },
      { href: "/painel/impressoras", rotulo: "Impressoras" },
    ],
  },
  // Quem tem o caixa (sem ser dono) só cuida das impressoras (sem os setores).
  { href: "/painel/impressoras", rotulo: "Impressoras", grupo: "Ajustes", acesso: "caixa", soEquipe: true },
];

const MODULOS_PAINEL: readonly Modulo[] = ["caixa", "delivery", "comandas"];

// Itens do menu que a pessoa vê.
export function itensDoMenu(papel: Papel, modulos: readonly Modulo[]): ItemNavegacao[] {
  const dono = papel === "dono";
  return NAVEGACAO.filter((item) => {
    if (dono) return !item.soEquipe;
    if (item.acesso === "dono") return false;
    if (item.acesso === "painel") return MODULOS_PAINEL.some((m) => modulos.includes(m));
    return modulos.includes(item.acesso);
  });
}

function casa(href: string, caminho: string) {
  return href === "/painel" ? caminho === "/painel" : caminho === href || caminho.startsWith(`${href}/`);
}

// Item do menu que contém a página atual (pelo próprio endereço ou por uma das abas).
export function itemDaPagina(itens: ItemNavegacao[], caminho: string): ItemNavegacao | null {
  let melhor: { item: ItemNavegacao; tamanho: number } | null = null;
  for (const item of itens) {
    for (const href of [item.href, ...(item.secoes?.map((s) => s.href) ?? [])]) {
      if (casa(href, caminho) && (!melhor || href.length > melhor.tamanho)) melhor = { item, tamanho: href.length };
    }
  }
  return melhor?.item ?? null;
}

export function itemAtivo(itens: ItemNavegacao[], caminho: string): string | null {
  return itemDaPagina(itens, caminho)?.href ?? null;
}
