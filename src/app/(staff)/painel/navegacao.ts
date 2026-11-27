import {
  Bike,
  BookOpen,
  Boxes,
  ChartColumn,
  ChefHat,
  CookingPot,
  CreditCard,
  Grid2x2,
  History,
  House,
  LayoutGrid,
  type LucideIcon,
  MessageCircle,
  Printer,
  Settings,
  Store,
  TicketPercent,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

import { type Papel, type Permissao, PERMISSOES, PERMISSOES_INICIO } from "@/lib/auth/papeis";

// Três listas, não um menu só, porque as três coisas têm ritmos diferentes:
// * Operação: o que se abre durante o serviço (toda noite, com o salão cheio).
// * Gestão: o que se faz fora do serviço, mas toda semana (cardápio, estoque, números).
// * Configurações: o que se ajusta uma vez e quase nunca mais, atrás de uma porta só.
// Antes havia só Operação e Configurações, e funções do dia a dia (cardápio, estoque, cupons)
// tinham caído junto das impressoras.
export type GrupoNavegacao = "Operação" | "Gestão" | "Configurações";

// Aba de um item; "acesso" restringe a aba a uma permissão.
export type Secao = { href: string; rotulo: string; icone?: LucideIcon; acesso?: Permissao };

// "secoes": páginas que ficam dentro do mesmo item, mostradas como abas no topo.
// "acesso": permissões que mostram o item (qualquer uma); "inicio" = quem tem o Início (não só mesas);
// "dono" = só o dono. "ocultarCom": some para quem tem esta permissão (vê a versão completa noutro item).
// "icone": o desenho do item, usado no menu, nas abas do rodapé e nos cartões de Configurações
// (antes cada tela tinha a sua lista, uma pelo rótulo e outra pelo endereço).
export type ItemNavegacao = {
  href: string;
  rotulo: string;
  grupo: GrupoNavegacao;
  icone: LucideIcon;
  acesso: Permissao[] | "inicio" | "dono";
  ocultarCom?: Permissao;
  secoes?: Secao[];
  // Nos cartões de Configurações: uma linha dizendo o que tem ali dentro.
  descricao?: string;
};

export const CONFIGURACOES_HREF = "/painel/configuracoes";

// Operação: durante o serviço. É o que fica nas abas do rodapé no celular.
export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", icone: House, acesso: "inicio" },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", icone: Bike, acesso: ["delivery"] },
  // Conversas com os clientes do delivery (página do pedido), com o pedido ao lado.
  { href: "/painel/conversas", rotulo: "Conversas", grupo: "Operação", icone: MessageCircle, acesso: ["delivery"] },
  // Mapa de mesas no próprio painel (abrir, lançar, cobrar, fechar), largo para o computador.
  {
    href: "/painel/comandas",
    rotulo: "Mesas",
    grupo: "Operação",
    icone: LayoutGrid,
    acesso: ["comandas_painel", "garcom_app"],
    secoes: [
      { href: "/painel/comandas", rotulo: "Mesas", icone: LayoutGrid },
      // Praças sem tela: o garçom marca que retirou o prato.
      { href: "/painel/comandas/pracas", rotulo: "Praças", icone: ChefHat, acesso: "garcom_app" },
    ],
  },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", icone: Wallet, acesso: ["caixa_operar"] },
  // Dentro do painel: quem está no painel só quer dar uma olhada na fila, não virar a tela do
  // tablet da praça. A tela cheia continua em /cozinha, com o link "Abrir em tela cheia" lá
  // dentro, e é para lá que `rotaInicial` manda quem só tem a cozinha.
  { href: "/painel/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", icone: CookingPot, acesso: ["cozinha_tela"] },
];

// Gestão: fora do serviço, mas no dia a dia da casa. O Cardápio mora aqui porque produto é
// ligado e desligado no meio do serviço (decisão do dono em 27/11) — se ele preferir, volta
// para CONFIGURACOES mudando só de lista.
export const GESTAO: ItemNavegacao[] = [
  {
    href: "/painel/produtos",
    rotulo: "Cardápio",
    grupo: "Gestão",
    icone: BookOpen,
    acesso: ["cardapio"],
    descricao: "Produtos, preços e adicionais.",
    secoes: [
      { href: "/painel/produtos", rotulo: "Produtos" },
      { href: "/painel/categorias", rotulo: "Categorias" },
      { href: "/painel/adicionais", rotulo: "Adicionais" },
      // Um cardápio por horário (almoço e janta): o produto aparece só na janela do cardápio dele.
      { href: "/painel/cardapios", rotulo: "Cardápios" },
    ],
  },
  {
    href: "/painel/estoque",
    rotulo: "Estoque",
    grupo: "Gestão",
    icone: Boxes,
    acesso: ["estoque"],
    descricao: "O que tem, o que acabou e o que cada produto gasta.",
  },
  { href: "/painel/cupons", rotulo: "Cupons", grupo: "Gestão", icone: TicketPercent, acesso: ["cupons"], descricao: "Descontos do delivery." },
  {
    href: "/painel/entregadores",
    rotulo: "Entregadores",
    grupo: "Gestão",
    icone: Truck,
    acesso: ["entregadores"],
    descricao: "Quem leva e quanto recebe.",
  },
  { href: "/painel/relatorios", rotulo: "Relatórios", grupo: "Gestão", icone: ChartColumn, acesso: ["relatorios"] },
  // Contas encerradas e deliveries terminados, só leitura (o banco não deixa mudar).
  { href: "/painel/historico", rotulo: "Histórico", grupo: "Gestão", icone: History, acesso: ["caixa_operar", "relatorios"] },
];

// Cada cartão da tela de Configurações: o que se ajusta uma vez. Os endereços são os mesmos de
// sempre (nada quebra); o que mudou é que eles saíram do menu do dia a dia.
export const CONFIGURACOES: ItemNavegacao[] = [
  {
    href: "/painel/restaurante",
    rotulo: "Restaurante",
    grupo: "Configurações",
    icone: Store,
    acesso: ["restaurante"],
    descricao: "Dados, marca, horários e taxa.",
  },
  {
    href: "/painel/mesas",
    rotulo: "Mesas",
    grupo: "Configurações",
    icone: Grid2x2,
    acesso: ["mesas"],
    descricao: "Mesas e QR code.",
    secoes: [
      { href: "/painel/mesas", rotulo: "Cadastro" },
      { href: "/painel/mesas/qrcode", rotulo: "QR code" },
    ],
  },
  {
    href: "/painel/pracas",
    rotulo: "Setores da cozinha",
    grupo: "Configurações",
    icone: ChefHat,
    acesso: ["impressao"],
    descricao: "Por onde cada produto passa.",
  },
  // Quem abre o caixa (sem cuidar dos setores) também vê e testa as impressoras.
  {
    href: "/painel/impressoras",
    rotulo: "Impressoras",
    grupo: "Configurações",
    icone: Printer,
    acesso: ["impressao", "caixa_operar"],
    descricao: "Impressoras e computadores.",
  },
  {
    href: "/painel/equipe",
    rotulo: "Equipe",
    grupo: "Configurações",
    icone: Users,
    acesso: "dono",
    descricao: "Pessoas e funções.",
    secoes: [
      { href: "/painel/equipe", rotulo: "Pessoas" },
      { href: "/painel/equipe/funcoes", rotulo: "Funções" },
    ],
  },
  { href: "/painel/assinatura", rotulo: "Assinatura", grupo: "Configurações", icone: CreditCard, acesso: "dono", descricao: "Plano e faturas." },
];

function filtrar(lista: ItemNavegacao[], papel: Papel, permissoes: readonly Permissao[]): ItemNavegacao[] {
  const tem = (p: Permissao) => permissoes.includes(p);
  return lista.flatMap((item): ItemNavegacao[] => {
    if (item.ocultarCom && tem(item.ocultarCom)) return [];
    const pode =
      item.acesso === "dono" ? papel === "dono" : item.acesso === "inicio" ? PERMISSOES_INICIO.some(tem) : item.acesso.some(tem);
    if (!pode) return [];
    if (!item.secoes) return [item];
    const secoes = item.secoes.filter((s) => !s.acesso || tem(s.acesso));
    return secoes.length ? [{ ...item, href: secoes[0].href, secoes }] : [];
  });
}

// Cartões de Configurações que a pessoa pode abrir.
export function itensDeConfiguracao(papel: Papel, permissoes: readonly Permissao[]): ItemNavegacao[] {
  return filtrar(CONFIGURACOES, papel, permissoes);
}

// Itens do menu: Operação, Gestão e, no fim, a porta única de "Configurações" para quem tem
// algo para configurar.
export function itensDoMenu(papel: Papel, permissoes: readonly Permissao[]): ItemNavegacao[] {
  const itens = [...filtrar(NAVEGACAO, papel, permissoes), ...filtrar(GESTAO, papel, permissoes)];
  if (itensDeConfiguracao(papel, permissoes).length > 0) {
    itens.push({ href: CONFIGURACOES_HREF, rotulo: "Configurações", grupo: "Configurações", icone: Settings, acesso: "dono" });
  }
  return itens;
}

// Dono: o que o plano não tem (aparece com cadeado e leva aos planos).
// A chave inclui o grupo porque "Mesas" existe nos dois lados (o mapa e o cadastro).
export function itensBloqueadosPeloPlano(papel: Papel, itens: ItemNavegacao[]): ItemNavegacao[] {
  if (papel !== "dono") return [];
  const chave = (i: ItemNavegacao) => `${i.grupo}/${i.rotulo}`;
  const visiveis = new Set(itens.map(chave));
  const tudo = [
    ...filtrar(NAVEGACAO, "dono", PERMISSOES),
    ...filtrar(GESTAO, "dono", PERMISSOES),
    ...filtrar(CONFIGURACOES, "dono", PERMISSOES),
  ];
  return tudo.filter((i) => !visiveis.has(chave(i)));
}

function casa(href: string, caminho: string) {
  return href === "/painel" ? caminho === "/painel" : caminho === href || caminho.startsWith(`${href}/`);
}

// Item (do menu ou de Configurações) que contém a página atual, pelo endereço ou por uma das abas.
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
