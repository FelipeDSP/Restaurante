import { TituloSecao } from "./funcionalidades";

const MOMENTOS = [
  { hora: "18:00", titulo: "O caixa abre", texto: "Informa o troco da gaveta e o salão está liberado. O site de delivery passa a aceitar pedidos." },
  { hora: "19:40", titulo: "Mesa 7 senta", texto: "O garçom abre a comanda no celular e lança os primeiros espetos, com a observação de cada um." },
  { hora: "20:15", titulo: "Chega um delivery", texto: "O painel apita, o pedido aparece com endereço e troco. Um toque e o cliente vê que está em preparo." },
  { hora: "21:30", titulo: "A mesa 7 pede a conta", texto: "Metade no Pix, metade em dinheiro. O troco aparece na tela e a mesa fica livre no mapa na hora." },
  { hora: "23:50", titulo: "Último pedido entregue", texto: "Marcado como entregue e pago. Nada de papelzinho esquecido no balcão." },
  { hora: "00:40", titulo: "O caixa fecha", texto: "Você conta a gaveta e o sistema diz se bateu. O resumo mostra o que vendeu, por forma de pagamento e por garçom." },
];

export function Noite() {
  return (
    <section id="como-funciona" className="scroll-mt-20 py-24">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-[1fr_1.35fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <TituloSecao
            olho="Como funciona"
            titulo="Uma sexta-feira com a uau foods."
            texto="Do troco da abertura ao fechamento depois da meia-noite: o resumo é por noite de trabalho, não pelo dia do calendário."
          />
        </div>
        <ol className="relative flex flex-col">
          {MOMENTOS.map((m, i) => (
            <li key={m.hora} className="group relative grid grid-cols-[5.5rem_1fr] gap-5 pb-10 last:pb-0">
              {i < MOMENTOS.length - 1 ? (
                <span aria-hidden className="absolute top-9 bottom-0 left-[2.6rem] w-0.5 bg-uau-borda" />
              ) : null}
              <span className="relative z-10 flex h-9 items-center justify-center self-start rounded-full bg-uau-marrom font-ticket text-sm font-semibold text-uau-creme transition-colors group-hover:bg-uau-laranja group-hover:text-uau-marrom">
                {m.hora}
              </span>
              <div className="flex flex-col gap-1.5 pt-1">
                <h3 className="text-xl font-black">{m.titulo}</h3>
                <p className="text-[15px] leading-relaxed text-uau-marrom-claro">{m.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
