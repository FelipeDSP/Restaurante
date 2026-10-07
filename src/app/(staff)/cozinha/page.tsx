import { AtualizarEmTempoReal } from "@/components/staff/atualizar-em-tempo-real";
import { exigirAcesso } from "@/lib/auth/dal";

import { carregarPracasAtivas, carregarTickets } from "./dados";
import { TelaCozinha } from "./tela-cozinha";

export default async function CozinhaPage(props: PageProps<"/cozinha">) {
  const acesso = await exigirAcesso("cozinha");
  const { praca } = await props.searchParams;
  const [{ pendentes, prontos, geradoEm }, pracas] = await Promise.all([
    carregarTickets(acesso.restaurante.id),
    carregarPracasAtivas(acesso.restaurante.id),
  ]);
  // Praça escolhida na URL (cada tela pode ficar fixa numa praça: /cozinha?praca=...).
  const pracaAtiva = typeof praca === "string" && pracas.some((p) => p.id === praca) ? praca : null;

  return (
    <>
      <AtualizarEmTempoReal restauranteId={acesso.restaurante.id} tabelas={["tarefas_producao", "itens_pedido", "pedidos"]} />
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
