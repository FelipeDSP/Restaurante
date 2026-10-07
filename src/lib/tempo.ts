// "há 5 min", "há 1 h 20 min"
export function tempoDesde(iso: string, agora: number = Date.now()): string {
  const minutos = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `há ${horas} h ${resto} min` : `há ${horas} h`;
}

// Hora no fuso do restaurante ("21:47").
export function horaLocal(iso: string, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fusoHorario }).format(
    new Date(iso),
  );
}

// Data e hora no fuso do restaurante ("03/10 21:47").
export function dataHoraLocal(iso: string, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fusoHorario,
  }).format(new Date(iso));
}

// "sex 03/10" no fuso do restaurante (noite de trabalho, para listas de sessões de caixa).
export function diaLocal(iso: string, fusoHorario: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: fusoHorario })
    .format(new Date(iso))
    .replace(".", "")
    .replace(",", "");
}
