import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { AvisoImpressao } from "@/components/staff/aviso-impressao";
import { exigirAcesso, temPermissao } from "@/lib/auth/dal";
import { contarImpressoesComErro } from "@/lib/impressao/avisos";

import { carregarPracasAtivas, carregarTickets } from "@/modulos/cozinha/dados";
import { TelaCozinha } from "@/modulos/cozinha/tela-cozinha";

export default async function CozinhaPage(props: PageProps<"/cozinha">) {
  const acesso = await exigirAcesso("cozinha");
  const { praca } = await props.searchParams;
  const [{ pendentes, prontos, geradoEm }, pracas, impressoesComErro] = await Promise.all([
    carregarTickets(acesso.restaurante.id),
    carregarPracasAtivas(acesso.restaurante.id),
    contarImpressoesComErro(acesso.restaurante.id),
  ]);
  // Setor escolhido na URL (cada tela pode ficar fixa num setor: /cozinha?praca=...).
  const pracaAtiva = typeof praca === "string" && pracas.some((p) => p.id === praca) ? praca : null;

  return (
    <>
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["tarefas_producao", "itens_pedido", "pedidos"]} />
      {impressoesComErro > 0 ? (
        <div className="px-4 pt-4">
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
      />
    </>
  );
}
