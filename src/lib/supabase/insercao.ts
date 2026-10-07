import type { Database } from "@/types/database";

type Tabelas = Database["public"]["Tables"];
type Insert<T extends keyof Tabelas> = Tabelas[T]["Insert"];

// Colunas `not null` que os triggers sempre preenchem (o banco ignora o que o cliente mandar).
// Os tipos gerados as marcam como obrigatórias; aqui ficam de fora do que o app envia.
type PreenchidasPeloBanco = {
  comandas: "caixa_sessao_id";
  pedidos: "caixa_sessao_id" | "numero";
  pagamentos: "caixa_sessao_id" | "registrado_por";
  caixa_sessoes: "aberta_por";
  movimentos_caixa: "caixa_sessao_id" | "registrado_por";
};

type TabelaComTrigger = keyof PreenchidasPeloBanco;
type Preenchidas<T extends TabelaComTrigger> = PreenchidasPeloBanco[T];

export type NovoRegistro<T extends TabelaComTrigger> = Omit<Insert<T>, Preenchidas<T>>;

// Tipa o insert sem as colunas do trigger; o cast é seguro porque o trigger BEFORE INSERT as define.
export function novoRegistro<T extends TabelaComTrigger>(_tabela: T, valores: NovoRegistro<T>): Insert<T> {
  return valores as Insert<T>;
}
