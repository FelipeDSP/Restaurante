// Som do aviso: um toque só, igual ao que o cliente já conhece dos apps de delivery. O arquivo é
// servido pelo próprio app (`/sons/aviso.mp3`), nunca por CDN de terceiro — o aviso da cozinha não
// pode depender de um domínio de fora.
//
// Se o arquivo não carregar (internet caiu no meio do serviço, cache vazio), cai num bipe gerado
// aqui mesmo. É a única razão de o sintetizador continuar existindo: sem ele, o aparelho ficaria
// mudo justamente quando a rede falha.
//
// Toca UMA vez por aviso. Insistir é trabalho de quem chama: o chamado do garçom repete até o
// "Vou", e o delivery sem aceite volta a avisar na conferência seguinte.

import { AVISOS_PADRAO, type Avisos } from "@/lib/avisos";

const ARQUIVO = "/sons/aviso.mp3";

export const VOLUMES = { baixo: 0.3, medio: 0.6, alto: 1 } as const;
export type Volume = keyof typeof VOLUMES;

export type PreferenciaDeSom = { volume: Volume };
export const SOM_PADRAO: PreferenciaDeSom = { volume: "alto" };

export function lerPreferenciaDeSom(valor: unknown): PreferenciaDeSom {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  return { volume: typeof v.volume === "string" && v.volume in VOLUMES ? (v.volume as Volume) : SOM_PADRAO.volume };
}

let preferencia: PreferenciaDeSom = SOM_PADRAO;
export function definirPreferenciaDeSom(p: PreferenciaDeSom) {
  preferencia = p;
}

let avisos: Avisos = AVISOS_PADRAO;
export function definirAvisos(a: Avisos) {
  avisos = a;
}

// Avisa respeitando as duas escolhas da pessoa: tocar som e vibrar. `vibracao` é o padrão daquele
// aviso (ms ligado/desligado). O iPhone não vibra de jeito nenhum, porque o Safari não tem a API —
// o som toca normalmente.
export function avisar(contexto: AudioContext | null, vibracao?: number[]) {
  if (avisos.vibrar && vibracao) navigator.vibrate?.(vibracao);
  if (avisos.som && contexto?.state === "running") tocarAlerta(contexto);
}

// Reserva, quando o arquivo não vem: três notas curtas geradas no navegador. Não precisa ser
// bonito, precisa existir.
function bipeDeReserva(contexto: AudioContext, volume: number) {
  const saida = contexto.createDynamicsCompressor();
  saida.connect(contexto.destination);
  const notas = [
    { freq: 880, inicio: 0 },
    { freq: 880, inicio: 0.25 },
    { freq: 1175, inicio: 0.5 },
  ];
  for (const n of notas) {
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    oscilador.frequency.value = n.freq;
    const t0 = contexto.currentTime + n.inicio;
    ganho.gain.setValueAtTime(0.0001, t0);
    ganho.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.7 * volume), t0 + 0.015);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    oscilador.connect(ganho).connect(saida);
    oscilador.start(t0);
    oscilador.stop(t0 + 0.22);
  }
}

// O arquivo é baixado e decodificado uma vez só; a partir daí tocar é instantâneo. `null` marca
// que já tentamos e não deu, para não repetir a busca a cada aviso.
let amostra: AudioBuffer | null | undefined;
let baixando: Promise<void> | null = null;

async function carregarAmostra(contexto: AudioContext) {
  if (amostra !== undefined || baixando) return baixando ?? undefined;
  baixando = (async () => {
    try {
      const resposta = await fetch(ARQUIVO, { cache: "force-cache" });
      if (!resposta.ok) throw new Error(String(resposta.status));
      amostra = await contexto.decodeAudioData(await resposta.arrayBuffer());
    } catch {
      amostra = null;
    } finally {
      baixando = null;
    }
  })();
  return baixando;
}

// Deixa o som pronto antes de precisar dele: o primeiro aviso não pode esperar um download.
export function prepararSom(contexto: AudioContext) {
  void carregarAmostra(contexto);
}

// Toca o aviso uma vez, no volume escolhido pela pessoa (ou no informado, para o "Ouvir").
export function tocarAlerta(contexto: AudioContext, escolha: PreferenciaDeSom = preferencia) {
  const volume = VOLUMES[escolha.volume];
  if (amostra) {
    const fonte = contexto.createBufferSource();
    const ganho = contexto.createGain();
    fonte.buffer = amostra;
    ganho.gain.value = volume;
    fonte.connect(ganho).connect(contexto.destination);
    fonte.start();
    return;
  }
  bipeDeReserva(contexto, volume);
  // Ainda não tentou baixar (ou o contexto acabou de ser liberado): tenta para o próximo aviso.
  if (amostra === undefined) void carregarAmostra(contexto);
}

// O iPhone (e alguns Android) suspende o áudio quando a tela bloqueia ou o app vai para segundo plano,
// e o contexto não volta sozinho: ao voltar para a tela (ou no próximo toque), retoma todos.
const contextos = new Set<AudioContext>();
let ouvindo = false;

function retomarSom() {
  if (document.visibilityState !== "visible") return;
  contextos.forEach((c) => {
    if (c.state !== "running" && c.state !== "closed") void c.resume().catch(() => {});
  });
}

// Cria o contexto de áudio dos avisos e o mantém ativo depois de bloquear a tela.
export function novoContextoDeSom(): AudioContext {
  const contexto = new AudioContext();
  contextos.add(contexto);
  // Baixa e decodifica já: o primeiro aviso da noite não pode esperar um download.
  prepararSom(contexto);
  if (!ouvindo) {
    ouvindo = true;
    document.addEventListener("visibilitychange", retomarSom);
    window.addEventListener("pageshow", retomarSom);
    window.addEventListener("focus", retomarSom);
    window.addEventListener("pointerdown", retomarSom);
  }
  return contexto;
}
