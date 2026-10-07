// Adicionais e opções: tipos e regras usados no site, no app do garçom e no painel.
// A validação definitiva é a do banco (rest_privado.montar_adicionais); aqui é só para a interface.

export type OpcaoAdicional = { id: string; nome: string; preco: number };

export type GrupoAdicionais = {
  id: string;
  nome: string;
  minimo: number;
  maximo: number;
  opcoes: OpcaoAdicional[];
};

// Opção escolhida, como fica guardada no item do pedido (retrato do momento).
export type AdicionalEscolhido = { id: string; grupo: string; nome: string; preco: number };

export function precoDasOpcoes(escolhidos: { preco: number }[]): number {
  return escolhidos.reduce((soma, a) => soma + a.preco, 0);
}

// Mensagem do primeiro grupo fora do mínimo/máximo, ou null se a escolha vale.
export function validarEscolha(grupos: GrupoAdicionais[], ids: string[]): string | null {
  for (const grupo of grupos) {
    const qtd = grupo.opcoes.filter((o) => ids.includes(o.id)).length;
    if (qtd < grupo.minimo) {
      return grupo.minimo === 1 ? `Escolha 1 opção em "${grupo.nome}".` : `Escolha ${grupo.minimo} opções em "${grupo.nome}".`;
    }
    if (qtd > grupo.maximo) return `Escolha no máximo ${grupo.maximo} em "${grupo.nome}".`;
  }
  return null;
}

// "Escolha 1", "Escolha até 3", "Escolha de 1 a 2".
export function regraDoGrupo(grupo: { minimo: number; maximo: number }): string {
  if (grupo.minimo === grupo.maximo) return grupo.minimo === 1 ? "Escolha 1" : `Escolha ${grupo.minimo}`;
  if (grupo.minimo === 0) return grupo.maximo === 1 ? "Opcional" : `Escolha até ${grupo.maximo}`;
  return `Escolha de ${grupo.minimo} a ${grupo.maximo}`;
}

// "Ao ponto · Bacon extra · Cheddar" para mostrar abaixo do nome do item.
export function resumoAdicionais(escolhidos: { nome: string }[]): string {
  return escolhidos.map((a) => a.nome).join(" · ");
}

// Lê o retrato salvo no banco (jsonb) com segurança.
export function lerAdicionais(valor: unknown): AdicionalEscolhido[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((a): AdicionalEscolhido[] =>
    a && typeof a === "object" && typeof a.nome === "string"
      ? [{ id: String(a.id ?? ""), grupo: String(a.grupo ?? ""), nome: a.nome, preco: Number(a.preco) || 0 }]
      : [],
  );
}

// Mesma escolha = mesma linha no carrinho/lançamento (ordem dos ids não importa).
export function chaveDaEscolha(produtoId: string, ids: string[], observacao = ""): string {
  return [produtoId, [...ids].sort().join(","), observacao.trim().toLowerCase()].join("|");
}
