import { type Papel, type Permissao, PERMISSOES, PERMISSOES_INICIO } from "@/lib/auth/papeis";

// Duas listas, não um menu só: o que se usa no dia (NAVEGACAO) e o que se configura uma vez
// (CONFIGURACOES, atrás de uma porta só). Antes o menu tinha 14 itens de assuntos diferentes.
export type GrupoNavegacao = "Operação" | "Configurações";

// Aba de um item; "acesso" restringe a aba a uma permissão.
export type Secao = { href: string; rotulo: string; acesso?: Permissao };

// "secoes": páginas que ficam dentro do mesmo item, mostradas como abas no topo.
// "acesso": permissões que mostram o item (qualquer uma); "inicio" = quem tem o Início (não só mesas);
// "dono" = só o dono. "ocultarCom": some para quem tem esta permissão (vê a versão completa noutro item).
export type ItemNavegacao = {
  href: string;
  rotulo: string;
  grupo: GrupoNavegacao;
  acesso: Permissao[] | "inicio" | "dono";
  ocultarCom?: Permissao;
  secoes?: Secao[];
  // Só nos cartões de Configurações: uma linha dizendo o que tem ali dentro.
  descricao?: string;
};

export const CONFIGURACOES_HREF = "/painel/configuracoes";

export const NAVEGACAO: ItemNavegacao[] = [
  { href: "/painel", rotulo: "Início", grupo: "Operação", acesso: "inicio" },
  { href: "/painel/delivery", rotulo: "Delivery", grupo: "Operação", acesso: ["delivery"] },
  // Conversas com os clientes do delivery (página do pedido), com o pedido ao lado.
  { href: "/painel/conversas", rotulo: "Conversas", grupo: "Operação", acesso: ["delivery"] },
  // Mapa de mesas no próprio painel (abrir, lançar, cobrar, fechar), largo para o computador.
  {
    href: "/painel/comandas",
    rotulo: "Mesas",
    grupo: "Operação",
    acesso: ["comandas_painel", "garcom_app"],
    secoes: [
      { href: "/painel/comandas", rotulo: "Mesas" },
      // Praças sem tela: o garçom marca que retirou o prato.
      { href: "/painel/comandas/pracas", rotulo: "Praças", acesso: "garcom_app" },
    ],
  },
  { href: "/painel/caixa", rotulo: "Caixa", grupo: "Operação", acesso: ["caixa_operar"] },
  { href: "/painel/relatorios", rotulo: "Relatórios", grupo: "Operação", acesso: ["relatorios"] },
  // Contas encerradas e deliveries terminados, só leitura (o banco não deixa mudar).
  { href: "/painel/historico", rotulo: "Histórico", grupo: "Operação", acesso: ["caixa_operar", "relatorios"] },
  { href: "/cozinha", rotulo: "Tela da cozinha", grupo: "Operação", acesso: ["cozinha_tela"] },
];

// Cada cartão da tela de Configurações. Os endereços são os mesmos de sempre (nada quebra);
// o que mudou é que eles saíram do menu do dia a dia.
export const CONFIGURACOES: ItemNavegacao[] = [
  {
    href: "/painel/produtos",
    rotulo: "Cardápio",
    grupo: "Configurações",
    acesso: ["cardapio"],
    descricao: "Produtos, preços, categorias, adicionais e os cardápios de cada horário.",
    secoes: [
      { href: "/painel/produtos", rotulo: "Produtos" },
      { href: "/painel/categorias", rotulo: "Categorias" },
      { href: "/painel/adicionais", rotulo: "Adicionais" },
      // Um cardápio por horário (almoço e janta): o produto aparece só na janela do cardápio dele.
      { href: "/painel/cardapios", rotulo: "Cardápios" },
    ],
  },
  {
    href: "/painel/mesas",
    rotulo: "Mesas",
    grupo: "Configurações",
    acesso: ["mesas"],
    descricao: "Quais mesas existem e o QR code de cada uma.",
    secoes: [
      { href: "/painel/mesas", rotulo: "Cadastro" },
      { href: "/painel/mesas/qrcode", rotulo: "QR code" },
    ],
  },
  // Um cartão por assunto: cupom e entregador não têm nada a ver um com o outro.
  {
    href: "/painel/cupons",
    rotulo: "Cupons",
    grupo: "Configurações",
    acesso: ["cupons"],
    descricao: "Descontos do delivery: código, validade e limite de uso.",
  },
  {
    href: "/painel/entregadores",
    rotulo: "Entregadores",
    grupo: "Configurações",
    acesso: ["entregadores"],
    descricao: "Quem leva os pedidos e quanto recebe por entrega.",
  },
  {
    href: "/painel/restaurante",
    rotulo: "Restaurante",
    grupo: "Configurações",
    acesso: ["restaurante"],
    descricao: "Nome, contato, marca, horários, taxa de entrega, serviço e couvert.",
  },
  {
    href: "/painel/pracas",
    rotulo: "Setores da cozinha",
    grupo: "Configurações",
    acesso: ["impressao"],
    descricao: "Churrasqueira, chapa, bar: por onde cada produto passa.",
  },
  // Quem abre o caixa (sem cuidar dos setores) também vê e testa as impressoras.
  {
    href: "/painel/impressoras",
    rotulo: "Impressoras",
    grupo: "Configurações",
    acesso: ["impressao", "caixa_operar"],
    descricao: "Impressoras, teste de impressão e computadores pareados.",
  },
  {
    href: "/painel/equipe",
    rotulo: "Equipe",
    grupo: "Configurações",
    acesso: "dono",
    descricao: "Quem entra no sistema e o que cada função pode fazer.",
    secoes: [
      { href: "/painel/equipe", rotulo: "Pessoas" },
      { href: "/painel/equipe/funcoes", rotulo: "Funções" },
    ],
  },
  {
    href: "/painel/assinatura",
    rotulo: "Assinatura",
    grupo: "Configurações",
    acesso: "dono",
    descricao: "Seu plano, faturas e troca de plano.",
  },
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

// Itens do menu do dia a dia (com as abas que a pessoa pode abrir; o item leva à primeira).
// "Configurações" entra no fim, como porta única, para quem tem algo para configurar.
export function itensDoMenu(papel: Papel, permissoes: readonly Permissao[]): ItemNavegacao[] {
  const itens = filtrar(NAVEGACAO, papel, permissoes);
  if (itensDeConfiguracao(papel, permissoes).length > 0) {
    itens.push({ href: CONFIGURACOES_HREF, rotulo: "Configurações", grupo: "Configurações", acesso: "dono" });
  }
  return itens;
}

// Dono: o que o plano não tem (aparece com cadeado e leva aos planos).
// A chave inclui o grupo porque "Mesas" existe nos dois lados (o mapa e o cadastro).
export function itensBloqueadosPeloPlano(papel: Papel, itens: ItemNavegacao[]): ItemNavegacao[] {
  if (papel !== "dono") return [];
  const chave = (i: ItemNavegacao) => `${i.grupo}/${i.rotulo}`;
  const visiveis = new Set(itens.map(chave));
  const tudo = [...filtrar(NAVEGACAO, "dono", PERMISSOES), ...filtrar(CONFIGURACOES, "dono", PERMISSOES)];
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
