// Três bipes curtos gerados no navegador (sem arquivo de áudio).
export function tocarAlerta(contexto: AudioContext) {
  const inicio = contexto.currentTime;
  [0, 0.25, 0.5].forEach((atraso, i) => {
    const oscilador = contexto.createOscillator();
    const volume = contexto.createGain();
    oscilador.type = "sine";
    oscilador.frequency.value = i === 2 ? 1175 : 880;
    volume.gain.setValueAtTime(0.0001, inicio + atraso);
    volume.gain.exponentialRampToValueAtTime(0.4, inicio + atraso + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + atraso + 0.2);
    oscilador.connect(volume).connect(contexto.destination);
    oscilador.start(inicio + atraso);
    oscilador.stop(inicio + atraso + 0.22);
  });
}
