import type { Metadata } from "next";

import { carregarAdmins, dataBR } from "../../dados";
import { Cartao, Titulo } from "../ui";
import { EsquecerComputadores, NovoAdmin, RemoverAdmin } from "./controles";

export const metadata: Metadata = { title: { absolute: "Administradores · Admin · uau foods" } };

// Quem entra no painel da plataforma. A pessoa precisa ter conta (cadastro normal) antes.
export default async function AdministradoresPage() {
  const admins = await carregarAdmins();
  return (
    <>
      <Titulo titulo="Administradores" subtitulo="Quem entra neste painel e vê todos os restaurantes." />

      <Cartao titulo="Adicionar">
        <NovoAdmin />
      </Cartao>

      <Cartao titulo={`Com acesso (${admins.length})`}>
        <ul className="flex flex-col divide-y divide-black/5">
          {admins.map((a) => (
            <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold">
                  <span className="truncate">{a.email}</span>
                  {a.voce ? <span className="rounded-md bg-uau-laranja/15 px-1.5 text-xs text-uau-laranja-escuro">você</span> : null}
                </span>
                <span className="text-xs text-uau-marrom-claro">
                  desde {dataBR(a.desde)} · {a.ultimo_acesso ? `último acesso ${dataBR(a.ultimo_acesso)}` : "nunca entrou"}
                </span>
              </span>
              {a.voce ? <EsquecerComputadores /> : <RemoverAdmin userId={a.user_id} email={a.email} />}
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}
