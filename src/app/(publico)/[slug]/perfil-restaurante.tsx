import type { RestaurantePublico } from "./dados";

// O lucide não tem mais ícone de marca, e as duas são desenhos simples: ficam aqui, no mesmo
// traço (24 px, stroke 2) dos outros ícones do site.
const traco = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function IconeInstagram() {
  return (
    <svg {...traco}>
      <rect width="20" height="20" x="2" y="2" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function IconeFacebook() {
  return (
    <svg {...traco}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

// Capa, logo e uma linha sobre a casa: o que faz o site ser daquele restaurante e não de outro.
// É a primeira coisa da página, no formato que o cliente já conhece dos outros cardápios — capa,
// logo redonda sobreposta, nome, descrição e a situação logo abaixo.
//
// Capa, descrição e redes são opcionais e nada é inventado: sem capa não entra degradê nem foto de
// banco de imagem, o bloco simplesmente começa no nome.
export function PerfilRestaurante({ restaurante, aberto }: { restaurante: RestaurantePublico; aberto: boolean }) {
  const { capaUrl, logoUrl, descricao, instagram, facebook } = restaurante;
  const temRede = Boolean(instagram || facebook);

  return (
    <section aria-label="O restaurante" className="flex flex-col bg-background shadow-sm">
      {capaUrl ? (
        // 3:1 fixo: a pessoa manda a foto que quiser e o enquadramento nunca sai torto nem
        // empurra o cardápio para baixo da dobra.
        // eslint-disable-next-line @next/next/no-img-element -- capa do Storage do restaurante
        <img src={capaUrl} alt="" className="aspect-[3/1] w-full object-cover" />
      ) : null}

      {logoUrl || temRede ? (
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          {/* Logo redonda sobre a capa, como num perfil: metade dela sobe para cima da imagem.
              Sem capa ela fica em linha com o nome, sem buraco nenhum. */}
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo do Storage do restaurante
            <img
              src={logoUrl}
              alt=""
              className={`size-20 shrink-0 rounded-full border-4 border-background bg-white object-contain p-1 shadow-sm ${capaUrl ? "-mt-12" : ""}`}
            />
          ) : (
            <span />
          )}
          {temRede ? (
            <div className="-mr-2 flex shrink-0 items-center">
              {instagram ? (
                <a
                  href={`https://instagram.com/${instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Instagram de ${restaurante.nome}`}
                  className="flex size-11 items-center justify-center rounded-full text-[var(--cor-primaria-texto)] hover:bg-muted"
                >
                  <IconeInstagram />
                </a>
              ) : null}
              {facebook ? (
                <a
                  href={`https://facebook.com/${facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Facebook de ${restaurante.nome}`}
                  className="flex size-11 items-center justify-center rounded-full text-[var(--cor-primaria-texto)] hover:bg-muted"
                >
                  <IconeFacebook />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Nome, descrição e situação na largura toda. Ao lado da logo e dos ícones, num celular de
          390 px sobravam 190 px: o nome quebrava em duas linhas e a descrição em três. */}
      <div className="flex flex-col gap-1 px-4 pt-2 pb-3">
        <h1 className="text-2xl leading-tight font-bold">{restaurante.nome}</h1>
        {descricao ? <p className="text-sm leading-snug text-muted-foreground">{descricao}</p> : null}
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <span className={`size-2 rounded-full ${aberto ? "bg-green-600" : "bg-red-600"}`} aria-hidden />
          <span className={aberto ? "text-green-700" : "text-red-700"}>{aberto ? "Aberto agora" : "Fechado"}</span>
        </p>
      </div>
    </section>
  );
}
