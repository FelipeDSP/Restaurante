import {
  Bell,
  Bike,
  ChartColumn,
  ChefHat,
  ClipboardList,
  Megaphone,
  QrCode,
  ShoppingBag,
  Smartphone,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";

import { formatarBRL } from "@/lib/dinheiro";
import { DIAS_TESTE_GRATIS, PLANOS } from "@/lib/planos";

import { EfeitosLanding } from "./efeitos";
import caixa from "./img/caixa.jpg";
import chamar from "./img/chamar.jpg";
import mesaLivre from "./img/mesa-livre.jpg";
import mesaOcupada from "./img/mesa-ocupada.jpg";
import mesas from "./img/mesas.jpg";
import "./landing.css";

const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-geist-mono", display: "swap" });

// Contato comercial (o mesmo da landing do Bitrix).
const WHATSAPP = "5569999565508";
const TELEFONE = "(69) 99956-5508";
const INSTAGRAM = "uaufoods.oficial";
const LINK_DEMONSTRACAO = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Olá! Quero uma demonstração do uau foods.")}`;

function Ok({ tamanho = 16 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function Balao() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.5-5.3A8.5 8.5 0 1 1 21 12z" />
    </svg>
  );
}

function Sino() {
  return <Bell className="size-[22px] text-[#2B1A12]" strokeWidth={2.2} aria-hidden />;
}

function Sobrancelha({ children }: { children: React.ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="bars">
        <i />
        <i />
        <i />
      </span>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <>
      <Image className="logo-l" src="/marca/uau-foods.png" alt="uau foods" width={1024} height={351} priority />
      <Image className="logo-d" src="/marca/uau-foods-branca.png" alt="uau foods" width={1024} height={351} priority />
    </>
  );
}

const RECURSOS: { icone: LucideIcon; titulo: string; texto: string; destaque?: boolean }[] = [
  {
    icone: ShoppingBag,
    titulo: "Delivery próprio",
    texto: "Seu cardápio online, com a marca, as cores e o link da sua casa. O pedido chega no painel com aviso sonoro, sem comissão.",
  },
  { icone: Smartphone, titulo: "App do garçom", texto: "Mapa de mesas e comanda no celular do próprio garçom, com itens e observações indo direto pra cozinha." },
  {
    icone: QrCode,
    titulo: "Pedido na mesa",
    texto: "O cliente aponta a câmera para o QR da mesa e pede pelo celular. A bebida vem agora ou junto com a comida: ele escolhe.",
  },
  {
    icone: Megaphone,
    titulo: "Chamar o garçom",
    texto: "Do caixa, você avisa a equipe no celular: vir ao caixa, pedido pronto para levar ou mesa chamando.",
    destaque: true,
  },
  { icone: ChefHat, titulo: "Cozinha e impressão", texto: "Tela da cozinha por setor e impressão automática na térmica ou na impressora que você já tem." },
  { icone: Wallet, titulo: "Controle de caixa", texto: "Abertura com troco, sangria e resumo da noite por forma de pagamento e por garçom." },
  { icone: Bell, titulo: "Cliente avisado", texto: "Quem pede no delivery acompanha o pedido e recebe aviso no celular quando sai para entrega." },
  { icone: Ticket, titulo: "Cupons e entregadores", texto: "Cupom de desconto ou frete grátis, e o acerto de cada entregador no fim da noite." },
  { icone: ChartColumn, titulo: "Relatórios", texto: "Vendas por noite, por produto, por garçom e por forma de pagamento. Baixa em planilha." },
];

const PASSOS = [
  { img: mesas, alt: "Mapa de mesas: 0 de 10 ocupadas", titulo: "Vê as mesas livres e ocupadas", texto: "O garçom abre o mapa de mesas no celular e toca na mesa." },
  { img: mesaLivre, alt: "Mesa 5 livre, escolha de quantas pessoas e botão Abrir comanda", titulo: "Abre a comanda", texto: "Informa quantas pessoas estão na mesa e abre a comanda." },
  { img: mesaOcupada, alt: "Mesa 5 ocupada com total, pago e falta", titulo: "Lança os itens", texto: "Os pedidos entram na comanda e o total da mesa aparece na hora." },
  { img: caixa, alt: "Caixa com total vendido, itens vendidos e comandas fechadas", titulo: "O caixa acompanha tudo", texto: "Vendas, gaveta e formas de pagamento no resumo da noite." },
];

const DUVIDAS = [
  ["Preciso de computador ou máquina especial?", "Não. O garçom usa o próprio celular e o caixa funciona em computador, notebook ou tablet, direto no navegador."],
  ["Vocês cobram comissão sobre os pedidos?", "Não. É uma mensalidade fixa. Tudo o que o seu delivery vender fica com você."],
  ["Preciso instalar aplicativo?", "Não. Tudo abre no navegador. O app da equipe pode ir para a tela inicial do celular com a marca da sua casa."],
  [
    "Como o cliente faz um pedido de delivery?",
    "Pelo link da sua casa. Ele monta o carrinho, informa o CEP, escolhe como vai pagar na entrega (Pix, cartão ou dinheiro com troco) e acompanha o pedido na mesma página.",
  ],
  ["Imprime na cozinha?", "Sim. Cada setor (chapa, churrasqueira, bar) recebe o seu pedido, na impressora térmica ou numa impressora comum do computador."],
  ["Posso trocar de plano depois?", "Pode, a qualquer momento, pelo próprio painel. A mensalidade muda a partir da próxima fatura."],
  ["Funciona sem internet?", "Não. Garçom, caixa e delivery conversam em tempo real pela internet. Ter um 4G de reserva no salão é uma boa ideia."],
  ["Emite nota fiscal (NFC-e)?", "Ainda não. A nota continua sendo emitida no sistema que você já usa."],
  ["Como funciona o teste grátis?", `São ${DIAS_TESTE_GRATIS} dias com tudo liberado, sem cartão. Dá para cadastrar, montar o cardápio e usar na mesma noite.`],
];

const CIDADES = ["Espetinho", "Hamburgueria", "Lanchonete", "Restaurante", "Salão", "Delivery", "Ariquemes e região"];

export async function Landing() {
  const qr = await QRCode.toString(LINK_DEMONSTRACAO, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#2B1A12", light: "#FFFDF8" } });

  return (
    <div className={`lp ${geist.variable} ${geistMono.variable}`}>
      <EfeitosLanding />
      <header className="nav" id="topo">
        <div className="wrap">
          <a className="brand" href="#topo" aria-label="uau foods, voltar ao topo">
            <Logo />
          </a>
          <ul>
            <li>
              <a href="#funcionalidades">Funcionalidades</a>
            </li>
            <li>
              <a href="#como-funciona">Como funciona</a>
            </li>
            <li>
              <a href="#planos">Planos</a>
            </li>
            <li>
              <a href="#duvidas">Dúvidas</a>
            </li>
          </ul>
          <Link className="entrar" href="/login">
            Entrar
          </Link>
          <Link className="btn btn-primary" href="/cadastro">
            Testar grátis
          </Link>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap">
            <div className="hero-copy">
              <div className="tag rise d1">
                Sistema de gestão para espetinhos, hamburguerias,
                <br />
                lanchonetes e restaurantes
              </div>
              <h1 className="rise d2">
                <span className="line">Casa cheia</span>
                <span className="line">
                  sem correria<span className="dot">.</span>
                </span>
              </h1>
              <p className="lead rise d3">
                Pedidos, mesas, delivery e caixa num só sistema. O garçom anota no celular, o cliente pede pela mesa e você acompanha a noite
                inteira do caixa.
              </p>
              <div className="cta-row rise d4">
                <Link className="btn btn-primary" href="/cadastro">
                  Testar grátis por {DIAS_TESTE_GRATIS} dias
                </Link>
                <a className="btn btn-ghost" href={LINK_DEMONSTRACAO} target="_blank" rel="noopener noreferrer">
                  <Balao />
                  Pedir demonstração
                </a>
              </div>
              <div className="fine rise d5">
                <span>
                  <Ok />
                  {DIAS_TESTE_GRATIS} dias com tudo liberado
                </span>
                <span>
                  <Ok />
                  Sem cartão de crédito
                </span>
                <span>
                  <Ok />
                  Sem comissão sobre as vendas
                </span>
              </div>
              <div className="devices rise d5">
                <span className="ic">
                  <span>
                    <Smartphone className="size-[15px] text-[#2B1A12]" strokeWidth={2.2} aria-hidden />
                  </span>
                  <span>
                    <ClipboardList className="size-[15px] text-[#2B1A12]" strokeWidth={2.2} aria-hidden />
                  </span>
                </span>
                Funciona no celular e no computador
              </div>
            </div>

            <div className="stage" aria-label="Telas do uau foods no celular">
              <div className="phone p1">
                <Image src={mesas} alt="Mapa de mesas no celular do garçom, com mesas livres" sizes="250px" priority />
              </div>
              <div className="phone p2">
                <Image src={mesaOcupada} alt="Comanda da mesa 5 aberta, com botões Lançar itens e Pedir conta" sizes="250px" priority />
              </div>
              <div className="phone p3">
                <Image src={caixa} alt="Resumo do caixa com total vendido e recebido" sizes="250px" priority />
              </div>
              <div className="speed" aria-hidden>
                <i />
                <i />
                <i />
              </div>
              <div className="sticker" aria-hidden>
                Conta fechada!
              </div>
              <div className="toast" id="toast" aria-live="polite">
                <div className="ti">
                  <Sino />
                </div>
                <div>
                  <small id="toast-k">MESA 07 · 21:14</small>
                  <b id="toast-t">Pediu pelo celular</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="marquee" aria-hidden>
          <div className="track">
            {[...CIDADES, ...CIDADES].map((c, i) => (
              <span key={i}>{c}</span>
            ))}
          </div>
        </div>

        <section className="pain" id="dores">
          <div className="wrap">
            <div className="pain-head reveal">
              <Sobrancelha>Sexta à noite</Sobrancelha>
              <h2>Você conhece a cena.</h2>
              <p className="lead">A casa enche, os pedidos se acumulam e o dono tenta resolver tudo ao mesmo tempo.</p>
            </div>
            <div className="pain-list">
              {[
                ["Comanda de papel pra todo lado", "Pedido anotado no caderno, no papel e no WhatsApp. Difícil saber o que já saiu."],
                ["Garçom volta toda hora pra perguntar", "Qual mesa pediu, o que falta, quanto deu. E você no meio, atendendo e conferindo."],
                ["Fechar o caixa vira uma novela", "Salão, delivery e formas de pagamento controlados cada um de um jeito."],
              ].map(([titulo, texto], i) => (
                <div key={titulo} className="pain-item reveal">
                  <span className="n">0{i + 1}</span>
                  <div>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                </div>
              ))}
              <div className="answer reveal">O uau foods junta pedidos, mesas, delivery e caixa num só sistema, simples de aprender e feito pra correria.</div>
            </div>
          </div>
        </section>

        <section id="funcionalidades" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="head reveal">
              <Sobrancelha>Funcionalidades</Sobrancelha>
              <h2>O que a sua casa usa na correria, num lugar só.</h2>
            </div>
            <div className="grid6">
              {RECURSOS.map(({ icone: Icone, titulo, texto, destaque }) => (
                <article key={titulo} className={`feat reveal${destaque ? " hl" : ""}`}>
                  <div className="fi">
                    <Icone className="size-[26px] text-[#2B1A12]" strokeWidth={2} aria-hidden />
                  </div>
                  <h3>{titulo}</h3>
                  <p>{texto}</p>
                  {destaque ? <a href="#chamar">Ver como funciona →</a> : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="call" id="chamar">
          <div className="wrap">
            <div className="call-copy reveal">
              <Sobrancelha>Chamar garçom</Sobrancelha>
              <h2>Precisa da equipe? Chame pelo sistema.</h2>
              <p className="lead">
                No caixa, toque em Chamar, escolha quem recebe e mande um aviso pronto ou um recado. Ninguém precisa sair procurando ninguém no
                salão.
              </p>
              <div>
                <p className="call-note" id="chips-label" style={{ marginBottom: 12 }}>
                  Toque num aviso para ver como chega:
                </p>
                <div className="chips" role="group" aria-labelledby="chips-label">
                  {["Vir ao caixa", "Pedido pronto para levar", "Mesa chamando"].map((t, i) => (
                    <button key={t} className="chip" type="button" aria-pressed={i === 0} data-t={t}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="call-stage reveal">
              <span className="who">Tela do dono</span>
              <div className="phone">
                <Image src={chamar} alt="Tela Chamar garçom: escolha de quem recebe, avisos prontos e campo de recado" sizes="280px" />
              </div>
              <div className="notif ping" id="notif" aria-live="polite">
                <div className="ti">
                  <Sino />
                </div>
                <div>
                  <small id="notif-k">NO CELULAR DO GARÇOM</small>
                  <b id="notif-t">Vir ao caixa</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="como-funciona">
          <div className="wrap">
            <div className="head reveal">
              <Sobrancelha>Como funciona</Sobrancelha>
              <h2>Do primeiro pedido ao caixa da noite.</h2>
              <p className="lead">Telas reais do uau foods, no celular do garçom e na tela do dono.</p>
            </div>
            <div className="steps">
              {PASSOS.map((p, i) => (
                <div key={p.titulo} className="step reveal">
                  <div className="phone">
                    <Image src={p.img} alt={p.alt} sizes="280px" />
                  </div>
                  <span className="num">PASSO {i + 1}</span>
                  <h3>{p.titulo}</h3>
                  <p>{p.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="dev" id="dispositivos" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="reveal">
              <div className="dev-visual">
                <div className="laptop" aria-label="Ilustração do caixa do uau foods aberto no computador" role="img">
                  <div className="lid">
                    <div className="screen">
                      <div className="scr-top">
                        <span className="av">U</span>Uau Lanches
                      </div>
                      <div className="scr-side">
                        <span>Início</span>
                        <span>Delivery</span>
                        <span>Mesas</span>
                        <span className="on">Caixa</span>
                        <span>Mais</span>
                      </div>
                      <div className="scr-main">
                        <h4>Caixa</h4>
                        <div className="sub">Aberto em 24/10, 10:00 por Teste</div>
                        <div className="scr-cards">
                          <div className="scr-card r">
                            <small>Total vendido</small>
                            <b>R$ 59,70</b>
                          </div>
                          <div className="scr-card r">
                            <small>Total recebido</small>
                            <b>R$ 59,70</b>
                          </div>
                          <div className="scr-card">
                            <small>Itens vendidos</small>
                            <b>3</b>
                          </div>
                          <div className="scr-card">
                            <small>Comandas fechadas</small>
                            <b>1</b>
                          </div>
                        </div>
                        <div className="scr-cols">
                          <div className="scr-box">
                            <h5>Gaveta (dinheiro)</h5>
                            <div className="scr-row">
                              <span>Troco inicial</span>
                              <span>R$ 0,00</span>
                            </div>
                            <div className="scr-row">
                              <span>Recebido em dinheiro</span>
                              <span>R$ 0,00</span>
                            </div>
                            <div className="scr-row">
                              <span>Sangrias (–)</span>
                              <span>R$ 10,00</span>
                            </div>
                            <div className="scr-row t">
                              <span>Esperado na gaveta</span>
                              <span>-R$ 10,00</span>
                            </div>
                          </div>
                          <div className="scr-box">
                            <h5>Por forma de pagamento</h5>
                            <div className="scr-row t">
                              <span>Pix</span>
                              <span>R$ 59,70</span>
                            </div>
                            <div className="scr-row">
                              <span>3 pagamentos</span>
                              <span />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="base" />
                </div>
                <div className="phone">
                  <Image src={mesas} alt="Mapa de mesas no celular" sizes="150px" />
                </div>
              </div>
              <p className="caption">Tela do caixa no computador e app do garçom no celular, com as cores da casa.</p>
            </div>
            <div className="dev-copy reveal">
              <Sobrancelha>Celular e computador</Sobrancelha>
              <h2>Funciona no celular e no computador.</h2>
              <ul className="checks">
                {[
                  { icone: Smartphone, titulo: "Garçom no próprio celular", texto: "O app vai pra tela inicial com o nome e a marca da sua casa." },
                  { icone: ClipboardList, titulo: "Caixa no computador, notebook ou tablet", texto: "Direto no navegador, sem máquina especial." },
                  { icone: Bike, titulo: "Delivery no mesmo painel", texto: "Pedido novo com aviso sonoro, do aceite à entrega." },
                  { icone: Bell, titulo: "Tudo em tempo real", texto: "Garçom, caixa e delivery conectados pela internet. Um 4G de reserva no salão ajuda." },
                ].map(({ icone: Icone, titulo, texto }) => (
                  <li key={titulo}>
                    <span className="ci">
                      <Icone className="size-[18px] text-[#2B1A12]" strokeWidth={2.2} aria-hidden />
                    </span>
                    <div>
                      <b>{titulo}</b>
                      <span>{texto}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="planos" style={{ background: "var(--paper)", borderBlock: "1.5px solid var(--line)" }}>
          <div className="wrap">
            <div className="head reveal" style={{ marginInline: "auto", textAlign: "center", alignItems: "center" }}>
              <Sobrancelha>Planos</Sobrancelha>
              <h2>Mensalidade fixa. A conta não cresce com as suas vendas.</h2>
            </div>
            <div className="plans">
              {PLANOS.map((p, i) => (
                <div key={p.id} className="ticket reveal">
                  {p.destaque ? <span className="sticker2">Mais completo</span> : null}
                  <div className="tk-head">
                    <span>Plano</span>
                    <span>#0{i + 1}</span>
                  </div>
                  <h3>{p.nome}</h3>
                  <p className="for">{p.paraQuem}</p>
                  <div className="dash" />
                  <ul>
                    {p.itens.map((item) => (
                      <li key={item}>
                        <Ok tamanho={18} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="dash" />
                  <div className="total">
                    <small>Por mês</small>
                    <span className="price">{formatarBRL(p.precoMensal)}</span>
                  </div>
                  <Link className="btn btn-primary" href="/cadastro">
                    Testar grátis
                  </Link>
                </div>
              ))}
            </div>
            <div className="plan-note reveal">
              <span>
                <Ok tamanho={18} />
                Sem comissão por pedido
              </span>
              <span>
                <Ok tamanho={18} />
                {DIAS_TESTE_GRATIS} dias grátis, sem cartão
              </span>
              <span>
                <Ok tamanho={18} />
                Sem limite de usuários e de pedidos
              </span>
            </div>
          </div>
        </section>

        <section id="duvidas">
          <div className="wrap">
            <div className="head reveal" style={{ marginInline: "auto", textAlign: "center", alignItems: "center" }}>
              <Sobrancelha>Dúvidas</Sobrancelha>
              <h2>Perguntas de quem toca a casa.</h2>
            </div>
            <div className="faq">
              {DUVIDAS.map(([pergunta, resposta]) => (
                <details key={pergunta} className="reveal">
                  <summary>{pergunta}</summary>
                  <p>{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final" id="contato">
          <div className="wrap">
            <div className="final-copy reveal">
              <span className="region">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" />
                  <circle cx="12" cy="11" r="2" />
                </svg>
                Ariquemes e região · RO
              </span>
              <h2>Bora deixar a próxima sexta mais tranquila?</h2>
              <p className="lead">Peça uma demonstração pelo WhatsApp ou comece o teste grátis agora.</p>
              <div className="cta-row">
                <a className="btn btn-primary" href={LINK_DEMONSTRACAO} target="_blank" rel="noopener noreferrer">
                  <Balao />
                  Pedir demonstração
                </a>
                <Link className="btn btn-ghost" href="/cadastro">
                  Testar grátis por {DIAS_TESTE_GRATIS} dias
                </Link>
              </div>
              <div className="contact">
                <span className="tel">{TELEFONE}</span>
                <a href={`https://instagram.com/${INSTAGRAM}`} target="_blank" rel="noopener noreferrer">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" />
                  </svg>
                  @{INSTAGRAM}
                </a>
              </div>
            </div>
            <div className="qr reveal">
              {/* QR gerado no servidor, a partir do link do WhatsApp (sem imagem externa). */}
              <div className="box" role="img" aria-label="QR code para falar com o uau foods no WhatsApp" dangerouslySetInnerHTML={{ __html: qr }} />
              <span>Aponte a câmera do celular</span>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <Image src="/marca/uau-foods-branca.png" alt="uau foods" width={1024} height={351} />
          <nav aria-label="Rodapé">
            <a href="#funcionalidades">Funcionalidades</a>
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
            <Link href="/login">Entrar</Link>
          </nav>
          <span>© {new Date().getFullYear()} uau foods</span>
        </div>
      </footer>
    </div>
  );
}
