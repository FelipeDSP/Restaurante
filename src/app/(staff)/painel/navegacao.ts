import { type Papel, type Permissao, podeAcessar } from "@/lib/auth/papeis";

export type GrupoNavegacao = "Operação" | "Cadastros" | "Ajustes";

// Aba de um item; "acesso" restringe a aba a uma permissão.
export type Secao = { href: string; rotulo: string; acesso?: Permissao };

// "secoes": páginas que ficam dentro do mesmo item do menu, mostradas como abas no topo.
// "acesso": permissões que mostram o item (qualquer uma); "painel" = qualquer permissão do painel;
// "dono" = só o dono. "ocultarCom": some para quem tem esta permissão (vê a versão completa noutro item).
export type ItemNavegacao = {
  href: string;
  rotulo: string;
  grupo: GrupoNavegacao;
  acesso: Permissao[] | "painel" | "dono";
  ocultarCom?: Permissao;
  secoes?: Secao[];
};

export const GRUPOS: GrupoNavegacao[] = ["Operação", "Cadastros", "Ajustes"];

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", acesso: "painel" },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", acesso: ["delivery"] },
  // Mapa de mesas no próprio painel (abrir, lançar, cobrar, fechar), largo para o computador.
  { href: "/painel/comandas", rotulo: "Mesas", grupo: "Operação", acesso: ["comandas_painel", "garcom_app"] },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", acesso: ["caixa_operar"] },
  { href: "/painel/relatorios", rotulo: "Relatórios", grupo: "Operação", acesso: ["relatorios"] },
  { href: "/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", acesso: ["cozinha_tela"] },
  {
    href: "/painel/produtos",
    rotulo: "Cardápio",
    grupo: "Cadastros",
    acesso: ["cardapio"],
    secoes: [
      { href: "/painel/produtos", rotulo: "Produtos" },
      { href: "/painel/categorias", rotulo: "Categorias" },
      { href: "/painel/adicionais", rotulo: "Adicionais" },
    ],
  },
  { href: "/painel/mesas", rotulo: "Cadastro de mesas", grupo: "Cadastros", acesso: ["mesas"] },
  { href: "/painel/cupons", rotulo: "Cupons", grupo: "Cadastros", acesso: ["cupons"] },
  {
    href: "/painel/equipe",
    rotulo: "Equipe",
    grupo: "Cadastros",
    acesso: "dono",
    secoes: [
      { href: "/painel/equipe", rotulo: "Pessoas" },
      { href: "/painel/equipe/funcoes", rotulo: "Funções" },
    ],
  },
  {
    href: "/painel/restaurante",
    rotulo: "Restaurante",
    grupo: "Ajustes",
    acesso: ["restaurante", "entregadores"],
    secoes: [
      { href: "/painel/restaurante", rotulo: "Dados e delivery", acesso: "restaurante" },
      { href: "/painel/entregadores", rotulo: "Entregadores", acesso: "entregadores" },
    ],
  },
  {
    href: "/painel/pracas",
    rotulo: "Cozinha e impressão",
    grupo: "Ajustes",
    acesso: ["impressao"],
    secoes: [
      { href: "/painel/pracas", rotulo: "Setores" },
      { href: "/painel/impressoras", rotulo: "Impressoras" },
    ],
  },
  // Quem abre o caixa (sem cuidar dos setores) só vê e testa as impressoras.
  { href: "/painel/impressoras", rotulo: "Impressoras", grupo: "Ajustes", acesso: ["caixa_operar"], ocultarCom: "impressao" },
];

// Itens do menu que a pessoa vê (com as abas que ela pode abrir; o item leva à primeira).
export function itensDoMenu(papel: Papel, permissoes: readonly Permissao[]): ItemNavegacao[] {
  const tem = (p: Permissao) => permissoes.includes(p);
  return NAVEGACAO.flatMap((item): ItemNavegacao[] => {
    if (item.ocultarCom && tem(item.ocultarCom)) return [];
    const pode =
      item.acesso === "dono" ? papel === "dono" : item.acesso === "painel" ? podeAcessar(permissoes, "painel") : item.acesso.some(tem);
    if (!pode) return [];
    if (!item.secoes) return [item];
    const secoes = item.secoes.filter((s) => !s.acesso || tem(s.acesso));
    return secoes.length ? [{ ...item, href: secoes[0].href, secoes }] : [];
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
