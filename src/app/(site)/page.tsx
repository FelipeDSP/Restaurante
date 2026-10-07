import { Cabecalho } from "./_componentes/cabecalho";
import { ChamadaFinal, Duvidas, EmBreve, Planos, Rodape, SuaMarca } from "./_componentes/finais";
import { Funcionalidades } from "./_componentes/funcionalidades";
import { Hero } from "./_componentes/hero";
import { LinhasVelocidade } from "./_componentes/marca";
import { Noite } from "./_componentes/noite";

const PROMESSAS = ["Sem comissão por pedido", "Funciona no celular que você já tem", "Sua marca, não a nossa"];

// Landing page do produto (marca uau foods).
export default function Inicio() {
  return (
    <>
      <Cabecalho />
      <main className="flex flex-1 flex-col">
        <Hero />
        <div className="bg-uau-marrom py-5 text-uau-creme">
          <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 text-[15px] font-extrabold">
            {PROMESSAS.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <LinhasVelocidade className="h-3 w-6" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <Funcionalidades />
        <Noite />
        <SuaMarca />
        <EmBreve />
        <Planos />
        <Duvidas />
        <ChamadaFinal />
      </main>
      <Rodape />
    </>
  );
}
