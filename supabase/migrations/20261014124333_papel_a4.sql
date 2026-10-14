-- Impressora comum (jato de tinta, laser) pelo driver do Windows: papel "Folha A4".
-- A largura guarda os milímetros do papel: 58 e 80 (bobina térmica) ou 210 (folha A4).
-- A4 só existe no modo driver (a térmica por comandos ESC/POS usa bobina).

alter table public.impressoras drop constraint impressoras_largura_check;
alter table public.impressoras add constraint impressoras_largura_check check (largura in (58, 80, 210));
alter table public.impressoras add constraint impressoras_a4_so_driver check (largura <> 210 or modo = 'driver');
