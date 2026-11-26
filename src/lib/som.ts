// Sons dos avisos (pedido novo, cozinha, garçom), gerados no navegador: sem arquivo de áudio.
// Em "Meu perfil" > Notificações cada pessoa escolhe o toque, o volume, quantas vezes toca e se
// quer som e vibração (guardado na conta, vale em qualquer aparelho em que ela entrar).
// <PreferenciaSom> no layout aplica as escolhas aqui.

import { AVISOS_PADRAO, type Avisos } from "@/lib/avisos";

export const SONS = {
  bipe: "Bipe",
  campainha: "Campainha",
  sino: "Sino de balcão",
  telefone: "Telefone",
  alarme: "Alarme",
  alegre: "Alegre",
} as const;
export type Som = keyof typeof SONS;

export const VOLUMES = { baixo: 0.3, medio: 0.6, alto: 1 } as const;
export type Volume = keyof typeof VOLUMES;

// `toque` é qual som; se toca ou não é escolha à parte, em `Avisos`.
export type PreferenciaDeSom = { toque: Som; volume: Volume; vezes: 1 | 2 | 3 };
export const SOM_PADRAO: PreferenciaDeSom = { toque: "bipe", volume: "alto", vezes: 2 };

function escolherToque(valor: unknown): Som {
  return typeof valor === "string" && valor in SONS ? (valor as Som) : SOM_PADRAO.toque;
}

export function lerPreferenciaDeSom(valor: unknown): PreferenciaDeSom {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  return {
    // `v.som` é como o toque se chamava antes de "som" virar o liga/desliga: quem já tinha
    // escolhido um toque não volta para o Bipe.
    toque: escolherToque(v.toque ?? v.som),
    volume: typeof v.volume === "string" && v.volume in VOLUMES ? (v.volume as Volume) : SOM_PADRAO.volume,
    vezes: v.vezes === 1 || v.vezes === 2 || v.vezes === 3 ? v.vezes : SOM_PADRAO.vezes,
  };
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

type Nota = { freq: number; inicio: number; duracao: number; tipo?: OscillatorType; pico?: number };

// Cada som é uma lista de notas (segundos a partir do começo) e sua duração total.
const MELODIAS: Record<Som, { notas: Nota[]; duracao: number }> = {
  bipe: {
    notas: [
      { freq: 880, inicio: 0, duracao: 0.2 },
      { freq: 880, inicio: 0.25, duracao: 0.2 },
      { freq: 1175, inicio: 0.5, duracao: 0.2 },
    ],
    duracao: 0.75,
  },
  campainha: {
    notas: [
      { freq: 659, inicio: 0, duracao: 0.7, tipo: "triangle" },
      { freq: 523, inicio: 0.45, duracao: 0.9, tipo: "triangle" },
    ],
    duracao: 1.4,
  },
  sino: {
    notas: [
      { freq: 1568, inicio: 0, duracao: 1.2 },
      { freq: 3136, inicio: 0, duracao: 0.6, pico: 0.25 },
      { freq: 1568, inicio: 0.35, duracao: 1.2 },
      { freq: 3136, inicio: 0.35, duracao: 0.6, pico: 0.25 },
    ],
    duracao: 1.6,
  },
  telefone: {
    notas: [0, 0.1, 0.2, 0.3, 0.6, 0.7, 0.8, 0.9].flatMap((t) => [
      { freq: 440, inicio: t, duracao: 0.08, tipo: "square" as const, pico: 0.35 },
      { freq: 480, inicio: t, duracao: 0.08, tipo: "square" as const, pico: 0.35 },
    ]),
    duracao: 1.1,
  },
  alarme: {
    notas: [0, 0.15, 0.3, 0.45, 0.6, 0.75].map((t, i) => ({
      freq: i % 2 ? 660 : 990,
      inicio: t,
      duracao: 0.14,
      tipo: "sawtooth" as const,
      pico: 0.45,
    })),
    duracao: 0.95,
  },
  alegre: {
    notas: [523, 659, 784, 1047].map((freq, i) => ({ freq, inicio: i * 0.11, duracao: i === 3 ? 0.45 : 0.18, tipo: "triangle" as const })),
    duracao: 0.85,
  },
};

function tocarNotas(contexto: AudioContext, som: Som, volume: number, inicio: number) {
  // Compressor: volume alto sem estourar quando as notas se somam.
  const saida = contexto.createDynamicsCompressor();
  saida.connect(contexto.destination);
  for (const n of MELODIAS[som].notas) {
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    oscilador.type = n.tipo ?? "sine";
    oscilador.frequency.value = n.freq;
    const t0 = inicio + n.inicio;
    ganho.gain.setValueAtTime(0.0001, t0);
    ganho.gain.exponentialRampToValueAtTime(Math.max(0.0002, (n.pico ?? 0.7) * volume), t0 + 0.015);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + n.duracao);
    oscilador.connect(ganho).connect(saida);
    oscilador.start(t0);
    oscilador.stop(t0 + n.duracao + 0.02);
  }
}

// Toca o som escolhido pela pessoa (ou o informado, para o "Ouvir" do perfil).
export function tocarAlerta(contexto: AudioContext, escolha: PreferenciaDeSom = preferencia) {
  const melodia = MELODIAS[escolha.toque];
  const volume = VOLUMES[escolha.volume];
  for (let i = 0; i < escolha.vezes; i++) {
    tocarNotas(contexto, escolha.toque, volume, contexto.currentTime + i * (melodia.duracao + 0.35));
  }
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
  if (!ouvindo) {
    ouvindo = true;
    document.addEventListener("visibilitychange", retomarSom);
    window.addEventListener("pageshow", retomarSom);
    window.addEventListener("focus", retomarSom);
    window.addEventListener("pointerdown", retomarSom);
  }
  return contexto;
}
