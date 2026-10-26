import type { Papel } from "@/lib/auth/papeis";

export type GrupoNavegacao = "Operação" | "Cadastros" | "Ajustes";

export type Secao = { href: string; rotulo: string };

// "secoes": páginas que ficam dentro do mesmo item do menu, mostradas como abas no topo.
export type ItemNavegacao = { href: string; rotulo: string; grupo: GrupoNavegacao; papeis: Papel[]; secoes?: Secao[] };

export const GRUPOS: GrupoNavegacao[] = ["Operação", "Cadastros", "Ajustes"];

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/comandas", rotulo: "Comandas", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/painel/relatorios", rotulo: "Relatórios", grupo: "Operação", papeis: ["dono"] },
  // O dono e o caixa também atendem mesas: o mesmo app do garçom (abrir mesa, lançar, cobrar, fechar).
  { href: "/garcom", rotulo: "App do garçom", grupo: "Operação", papeis: ["dono", "caixa"] },
  { href: "/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", papeis: ["dono", "caixa"] },
  {
    href: "/painel/produtos",
    rotulo: "Cardápio",
    grupo: "Cadastros",
    papeis: ["dono"],
    secoes: [
      { href: "/painel/produtos", rotulo: "Produtos" },
      { href: "/painel/categorias", rotulo: "Categorias" },
      { href: "/painel/adicionais", rotulo: "Adicionais" },
    ],
  },
  { href: "/painel/mesas", rotulo: "Mesas", grupo: "Cadastros", papeis: ["dono"] },
  { href: "/painel/cupons", rotulo: "Cupons", grupo: "Cadastros", papeis: ["dono"] },
  { href: "/painel/equipe", rotulo: "Equipe", grupo: "Cadastros", papeis: ["dono"] },
  {
    href: "/painel/restaurante",
    rotulo: "Restaurante",
    grupo: "Ajustes",
    papeis: ["dono"],
    secoes: [
      { href: "/painel/restaurante", rotulo: "Dados e delivery" },
      { href: "/painel/bairros", rotulo: "Bairros" },
      { href: "/painel/entregadores", rotulo: "Entregadores" },
    ],
  },
  {
    href: "/painel/pracas",
    rotulo: "Cozinha e impressão",
    grupo: "Ajustes",
    papeis: ["dono"],
    secoes: [
      { href: "/painel/pracas", rotulo: "Setores" },
      { href: "/painel/impressoras", rotulo: "Impressoras" },
    ],
  },
  // O caixa só cuida das impressoras (sem os setores).
  { href: "/painel/impressoras", rotulo: "Impressoras", grupo: "Ajustes", papeis: ["caixa"] },
];

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
