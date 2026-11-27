import { Maximize2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { AvisoImpressao } from "@/components/staff/aviso-impressao";
import { exigirPermissao, temPermissao } from "@/lib/auth/dal";
import { contarImpressoesComErro } from "@/lib/impressao/avisos";

import { carregarPracasAtivas, carregarTickets } from "../../cozinha/dados";
import { TelaCozinha } from "../../cozinha/tela-cozinha";

export const metadata: Metadata = { title: "Tela da cozinha" };

// A mesma fila da cozinha, mas dentro do painel: o dono dá uma olhada sem o app virar outra coisa.
// A tela cheia (`/cozinha`) continua existindo e é a do tablet que fica no setor — lá o menu do
// painel só atrapalharia, e o aviso de som precisa mesmo tomar a tela.
export default async function CozinhaNoPainelPage(props: PageProps<"/painel/cozinha">) {
  const acesso = await exigirPermissao("painel", "cozinha_tela");
  const { praca } = await props.searchParams;
  const [{ pendentes, prontos, geradoEm }, pracas, impressoesComErro] = await Promise.all([
    carregarTickets(acesso.restaurante.id),
    carregarPracasAtivas(acesso.restaurante.id),
    contarImpressoesComErro(acesso.restaurante.id),
  ]);
  const pracaAtiva = typeof praca === "string" && pracas.some((p) => p.id === praca) ? praca : null;

  return (
    <>
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["tarefas_producao", "itens_pedido", "pedidos"]} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
        <h1 className="text-2xl font-semibold">Tela da cozinha</h1>
        {/* O caminho para montar o aparelho do setor: abre a versão de tela cheia. */}
        <Link
          href={pracaAtiva ? `/cozinha?praca=${pracaAtiva}` : "/cozinha"}
          className="flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium hover:bg-muted"
        >
          <Maximize2 className="size-4" aria-hidden />
          Abrir em tela cheia
        </Link>
      </div>
      {impressoesComErro > 0 ? (
        <div className="px-4 pt-4 md:px-6">
          <AvisoImpressao quantos={impressoesComErro} podeReimprimir={temPermissao(acesso, "caixa_operar", "impressao")} />
        </div>
      ) : null}
      <TelaCozinha
        restauranteId={acesso.restaurante.id}
        restauranteNome={acesso.restaurante.nome}
        fuso={acesso.restaurante.fusoHorario}
        pracas={pracas}
        pracaAtiva={pracaAtiva}
        pendentes={pendentes}
        prontos={prontos}
        geradoEm={geradoEm}
        base="/painel/cozinha"
        embutida
      />
    </>
  );
}
