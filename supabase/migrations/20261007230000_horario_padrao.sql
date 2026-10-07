-- Restaurante novo nasce aberto das 18h às 23h todos os dias (antes nascia "fechado" todos os
-- dias e o site aparecia fechado até o dono descobrir a tela de horários). O dono ajusta depois.
alter table public.restaurantes alter column horarios set default
  '{"dom":[{"abre":"18:00","fecha":"23:00"}],"seg":[{"abre":"18:00","fecha":"23:00"}],"ter":[{"abre":"18:00","fecha":"23:00"}],"qua":[{"abre":"18:00","fecha":"23:00"}],"qui":[{"abre":"18:00","fecha":"23:00"}],"sex":[{"abre":"18:00","fecha":"23:00"}],"sab":[{"abre":"18:00","fecha":"23:00"}]}'::jsonb;
