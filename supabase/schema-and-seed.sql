-- Supabase schema + carga inicial gerada a partir de 1. UNIFILAR T2 DR (1).xlsx
-- Projeto: Trecho 2 | Dashboard PDM Infraestrutura
-- Gerado em: 2026-06-07T15:08:18

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('coordenacao', 'analista', 'fiscalizacao');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  role public.app_role not null default 'fiscalizacao',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.limpeza (
  id uuid primary key default gen_random_uuid(),
  excel_row integer,
  equip_infra text not null unique,
  atividade text,
  kmi integer,
  kmf integer,
  kmi_real integer,
  kmf_real integer,
  ext numeric not null default 0,
  ext_m text,
  ext_real numeric not null default 0,
  ext_real_m text,
  percentual_real numeric not null default 0,
  sb text,
  sub text,
  percentual_sub numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  seed_key text unique,
  excel_row integer,
  sub text,
  sb text,
  km integer,
  descricao text not null,
  tipo_obra text,
  risco text,
  motivo text,
  equipamento text,
  ext_eq numeric,
  ext_eq_m text,
  prazo_mes numeric,
  dt_inicio date,
  status text not null default 'NÃO INFORMADO',
  progresso numeric not null default 0,
  obs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  table_name text not null,
  record_id text,
  action text not null,
  user_id uuid,
  user_email text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, nome, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), new.email, 'fiscalizacao')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where user_id = auth.uid();
$$;

create or replace function public.is_coordenacao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'coordenacao', false);
$$;

create or replace function public.can_write_pdm()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() in ('coordenacao', 'analista'), false);
$$;

create or replace function public.audit_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (table_name, record_id, action, user_id, user_email, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id::text, old.id::text),
    tg_op,
    auth.uid(),
    auth.jwt()->>'email',
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

alter table public.profiles enable row level security;
alter table public.limpeza enable row level security;
alter table public.obras enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_self_or_coordenacao" on public.profiles;
create policy "profiles_select_self_or_coordenacao" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_coordenacao());

drop policy if exists "profiles_insert_self_fiscalizacao" on public.profiles;
create policy "profiles_insert_self_fiscalizacao" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid() and role = 'fiscalizacao');

drop policy if exists "profiles_update_only_coordenacao" on public.profiles;
create policy "profiles_update_only_coordenacao" on public.profiles
  for update to authenticated
  using (public.is_coordenacao())
  with check (public.is_coordenacao());

drop policy if exists "limpeza_select_authenticated" on public.limpeza;
create policy "limpeza_select_authenticated" on public.limpeza
  for select to authenticated
  using (true);

drop policy if exists "limpeza_write_coord_analista" on public.limpeza;
create policy "limpeza_write_coord_analista" on public.limpeza
  for all to authenticated
  using (public.can_write_pdm())
  with check (public.can_write_pdm());

drop policy if exists "obras_select_authenticated" on public.obras;
create policy "obras_select_authenticated" on public.obras
  for select to authenticated
  using (true);

drop policy if exists "obras_write_coord_analista" on public.obras;
create policy "obras_write_coord_analista" on public.obras
  for all to authenticated
  using (public.can_write_pdm())
  with check (public.can_write_pdm());

drop policy if exists "audit_select_only_coordenacao" on public.audit_logs;
create policy "audit_select_only_coordenacao" on public.audit_logs
  for select to authenticated
  using (public.is_coordenacao());

-- Carga inicial: Limpeza Geral
insert into public.limpeza (excel_row, equip_infra, atividade, kmi, kmf, kmi_real, kmf_real, ext, ext_m, ext_real, ext_real_m, percentual_real, sb, sub, percentual_sub) values
  (4, '63/017081-017544ct', 'ct', 17081, 17544, NULL, NULL, 463, '463m', 0, '0m', 0, 'ZJY ZVN', '63', 0),
  (5, '63/021280-021760at', 'at', 21280, 21760, NULL, NULL, 480, '480m', 0, '0m', 0, NULL, '63', 0),
  (6, '63/021760-022236ct', 'ct', 21760, 22236, NULL, NULL, 476, '476m', 0, '0m', 0, 'ZVN ZCP', '63', 0),
  (7, '63/023665-024287at', 'at', 23665, 24287, NULL, NULL, 622, '622m', 0, '0m', 0, NULL, '63', 0),
  (8, '63/024319-024480sm', 'sm', 24319, 24480, NULL, NULL, 161, '161m', 0, '0m', 0, NULL, '63', 0),
  (9, '63/024480-024518ct', 'ct', 24480, 24518, NULL, NULL, 38, '38m', 0, '0m', 0, NULL, '63', 0),
  (10, '63/024520-024887ct', 'ct', 24520, 24887, NULL, NULL, 367, '367m', 0, '0m', 0, NULL, '63', 0),
  (11, '63/024903-025150sm', 'sm', 24903, 25150, NULL, NULL, 247, '247m', 0, '0m', 0, NULL, '63', 0),
  (12, '63/025154-025521sm', 'sm', 25154, 25521, NULL, NULL, 367, '367m', 0, '0m', 0, NULL, '63', 0),
  (13, '63/039019-039910ct', 'ct', 39019, 39910, NULL, NULL, 891, '891m', 0, '0m', 0, NULL, '63', 0),
  (14, '63/039910-040300sm', 'sm', 39910, 40300, NULL, NULL, 390, '390m', 0, '0m', 0, NULL, '63', 0),
  (15, '63/040334-040384sm', 'sm', 40334, 40384, NULL, NULL, 50, '50m', 0, '0m', 0, NULL, '63', 0),
  (16, '63/040388-040769sm', 'sm', 40388, 40769, NULL, NULL, 381, '381m', 0, '0m', 0, NULL, '63', 0),
  (17, '63/040773-041566at', 'at', 40773, 41566, NULL, NULL, 793, '793m', 0, '0m', 0, NULL, '63', 0),
  (18, '66/049700-050330ct', 'ct', 49700, 50330, 49700, 50330, 630, '630m', 630, '630m', 1, 'ZCP ZBV', '66', 1),
  (19, '66/050330-051181at', 'at', 50330, 51181, 50330, 51181, 851, '851m', 851, '851m', 1, NULL, '66', 0),
  (20, '66/051373-051508at', 'at', 51373, 51508, 51373, 51508, 135, '135m', 135, '135m', 1, NULL, '66', 0),
  (21, '66/051568-052420ct', 'ct', 51568, 52420, 51568, 52420, 852, '852m', 852, '852m', 1, NULL, '66', 0),
  (22, '68/052700-053145ct', 'ct', 52700, 53145, 52700, 53145, 445, '445m', 445, '445m', 1, 'ZBV ZHO', '68', 0.07483217330422964),
  (23, '68/053145-053174at', 'at', 53145, 53174, 53145, 53174, 29, '29m', 29, '29m', 1, NULL, '68', 0),
  (24, '68/053180-053770at', 'at', 53180, 53770, 53180, 53770, 590, '590m', 590, '590m', 1, NULL, '68', 0),
  (25, '68/053771-055477ct', 'ct', 53771, 55477, 53771, 54656, 1706, '1706m', 753, '753m', 0.4413833528722157, NULL, '68', 0),
  (26, '68/055478-055722at', 'at', 55478, 55722, NULL, NULL, 244, '244m', 0, '0m', 0, NULL, '68', 0),
  (27, '68/055723-056889ct', 'ct', 55723, 56889, NULL, NULL, 1166, '1166m', 0, '0m', 0, NULL, '68', 0),
  (28, '68/056890-056932at', 'at', 56890, 56932, NULL, NULL, 42, '42m', 0, '0m', 0, NULL, '68', 0),
  (29, '68/056938-057542at', 'at', 56938, 57542, NULL, NULL, 604, '604m', 0, '0m', 0, NULL, '68', 0),
  (30, '68/057548-058340ct', 'ct', 57548, 58340, NULL, NULL, 792, '792m', 0, '0m', 0, NULL, '68', 0),
  (31, '68/058340-058385sm', 'sm', 58340, 58385, NULL, NULL, 45, '45m', 0, '0m', 0, NULL, '68', 0),
  (32, '68/058391-058780sm', 'sm', 58391, 58780, NULL, NULL, 389, '389m', 0, '0m', 0, NULL, '68', 0),
  (33, '68/058780-058797ct', 'ct', 58780, 58797, NULL, NULL, 17, '17m', 0, '0m', 0, NULL, '68', 0),
  (34, '68/058803-061856ct', 'ct', 58803, 61856, NULL, NULL, 3053, '3053m', 0, '0m', 0, 'ZHO ZSU', '68', 0),
  (35, '68/061869-063920sm', 'sm', 61869, 63920, NULL, NULL, 2051, '2051m', 0, '0m', 0, NULL, '68', 0),
  (36, '68/063920-064175ct', 'ct', 63920, 64175, NULL, NULL, 255, '255m', 0, '0m', 0, NULL, '68', 0),
  (37, '68/064179-065249ct', 'ct', 64179, 65249, NULL, NULL, 1070, '1070m', 0, '0m', 0, NULL, '68', 0),
  (38, '68/065250-065380at', 'at', 65250, 65380, NULL, NULL, 130, '130m', 0, '0m', 0, NULL, '68', 0),
  (39, '68/065381-067110ct', 'ct', 65381, 67110, NULL, NULL, 1729, '1729m', 0, '0m', 0, NULL, '68', 0),
  (40, '68/067136-067300at', 'at', 67136, 67300, NULL, NULL, 164, '164m', 0, '0m', 0, NULL, '68', 0),
  (41, '68/067300-067600ct', 'ct', 67300, 67600, NULL, NULL, 300, '300m', 0, '0m', 0, NULL, '68', 0),
  (42, '68/067600-069774sm', 'sm', 67600, 69774, NULL, NULL, 2174, '2174m', 0, '0m', 0, 'ZSU ZRC', '68', 0),
  (43, '68/069812-069884sm', 'sm', 69812, 69884, NULL, NULL, 72, '72m', 0, '0m', 0, NULL, '68', 0),
  (44, '68/069916-070000sm', 'sm', 69916, 70000, NULL, NULL, 84, '84m', 0, '0m', 0, NULL, '68', 0),
  (45, '68/070000-070390ct', 'ct', 70000, 70390, NULL, NULL, 390, '390m', 0, '0m', 0, NULL, '68', 0),
  (46, '68/070390-071460sm', 'sm', 70390, 71460, NULL, NULL, 1070, '1070m', 0, '0m', 0, NULL, '68', 0),
  (47, '68/071474-072000ct', 'ct', 71474, 72000, NULL, NULL, 526, '526m', 0, '0m', 0, NULL, '68', 0),
  (48, '68/072000-072576sm', 'sm', 72000, 72576, NULL, NULL, 576, '576m', 0, '0m', 0, NULL, '68', 0),
  (49, '68/072598-073347ct', 'ct', 72598, 73347, NULL, NULL, 749, '749m', 0, '0m', 0, NULL, '68', 0),
  (50, '68/073359-073790at', 'at', 73359, 73790, NULL, NULL, 431, '431m', 0, '0m', 0, NULL, '68', 0),
  (51, '68/073790-073833sm', 'sm', 73790, 73833, NULL, NULL, 43, '43m', 0, '0m', 0, NULL, '68', 0),
  (52, '68/073839-074190ct', 'ct', 73839, 74190, NULL, NULL, 351, '351m', 0, '0m', 0, NULL, '68', 0),
  (53, '68/074190-074373sm', 'sm', 74190, 74373, NULL, NULL, 183, '183m', 0, '0m', 0, NULL, '68', 0),
  (54, '68/074389-074900sm', 'sm', 74389, 74900, NULL, NULL, 511, '511m', 0, '0m', 0, NULL, '68', 0),
  (55, '68/074900-075600at', 'at', 74900, 75600, NULL, NULL, 700, '700m', 0, '0m', 0, NULL, '68', 0),
  (56, '68/075600-075883ct', 'ct', 75600, 75883, NULL, NULL, 283, '283m', 0, '0m', 0, NULL, '68', 0),
  (57, '68/075883-076300ct', 'ct', 75883, 76300, NULL, NULL, 417, '417m', 0, '0m', 0, NULL, '68', 0),
  (58, '68/076300-077200at', 'at', 76300, 77200, NULL, NULL, 900, '900m', 0, '0m', 0, NULL, '68', 0),
  (59, '70/077200-079056sm', 'sm', 77200, 79056, 77200, 79446, 1856, '1856m', 2096, '2096m', 1.1293103448275863, 'ZAC ZTT', '70', 0.5180448768241017),
  (60, '70/081202-081959at', 'at', 81202, 81959, 81202, 81712, 757, '757m', 510, '510m', 0.6737120211360634, NULL, '70', 0),
  (61, '70/081962-082161at', 'at', 81962, 82161, 81962, 82161, 199, '199m', 199, '199m', 1, NULL, '70', 0),
  (62, '70/082161-082598ct', 'ct', 82161, 82598, 82161, 82598, 437, '437m', 437, '437m', 1, NULL, '70', 0),
  (63, '70/082604-082675sm', 'sm', 82604, 82675, 82604, 82675, 71, '71m', 71, '71m', 1, NULL, '70', 0),
  (64, '70/082681-082857at', 'at', 82681, 82857, 82681, 82857, 176, '176m', 176, '176m', 1, NULL, '70', 0),
  (65, '70/082863-083750ct', 'ct', 82863, 83750, 82863, 83750, 887, '887m', 887, '887m', 1, NULL, '70', 0),
  (66, '70/083750-083900at', 'at', 83750, 83900, 83750, 83900, 150, '150m', 150, '150m', 1, NULL, '70', 0),
  (67, '70/083900-084650ct', 'ct', 83900, 84650, 83900, 84650, 750, '750m', 750, '750m', 1, NULL, '70', 0),
  (68, '70/084650-085750sm', 'sm', 84650, 85750, 84650, 85750, 1100, '1100m', 1100, '1100m', 1, NULL, '70', 0),
  (69, '70/085750-085990ct', 'ct', 85750, 87400, 85750, 87400, 1650, '1650m', 1650, '1650m', 1, NULL, '70', 0),
  (70, '70/085990-086100at', 'at', 85990, 86100, 85990, 86100, 110, '110m', 110, '110m', 1, NULL, '70', 0),
  (71, '70/086100-086300ct', 'ct', 86100, 86300, 86100, 86300, 200, '200m', 200, '200m', 1, NULL, '70', 0),
  (72, '70/086300-087100sm', 'sm', 86300, 87100, NULL, NULL, 800, '800m', 0, '0m', 0, NULL, '70', 0),
  (73, '70/087100-087200at', 'at', 87100, 87200, NULL, NULL, 100, '100m', 0, '0m', 0, NULL, '70', 0),
  (74, '70/087200-087400ct', 'ct', 87200, 87400, 87226, 87400, 200, '200m', 174, '174m', 0.87, NULL, '70', 0),
  (75, '70/087400-088868at', 'at', 87400, 88868, 87400, 88868, 1468, '1468m', 1468, '1468m', 1, NULL, '70', 0),
  (79, '70/102280-102905ct', 'ct', 102280, 102905, 102280, 102965, 625, '625m', 685, '685m', 1.096, 'ZLI ZCD', '70', 0),
  (80, '70/102909-103061sm', 'sm', 102909, 103061, NULL, NULL, 152, '152m', 0, '0m', 0, NULL, '70', 0),
  (81, '70/105988-106950sm', 'sm', 105988, 106950, NULL, NULL, 962, '962m', 0, '0m', 0, NULL, '70', 0),
  (82, '70/106954-107378ct', 'ct', 106954, 107378, NULL, NULL, 424, '424m', 0, '0m', 0, NULL, '70', 0),
  (83, '70/107382-107780at', 'at', 107382, 107780, NULL, NULL, 398, '398m', 0, '0m', 0, NULL, '70', 0),
  (84, '70/107780-108330ct', 'ct', 107780, 108330, NULL, NULL, 550, '550m', 0, '0m', 0, NULL, '70', 0),
  (85, '70/108780-109844ct', 'ct', 108780, 109844, NULL, NULL, 1064, '1064m', 0, '0m', 0, NULL, '70', 0),
  (86, '70/109850-110186at', 'at', 109850, 110186, NULL, NULL, 336, '336m', 0, '0m', 0, 'ZCD ZWX', '70', 0),
  (87, '70/117220-118100sm', 'sm', 117220, 118100, NULL, NULL, 880, '880m', 0, '0m', 0, NULL, '70', 0),
  (88, '70/118100-118380ct', 'ct', 118100, 118380, NULL, NULL, 280, '280m', 0, '0m', 0, NULL, '70', 0),
  (89, '70/118380-118680sm', 'sm', 118380, 118680, NULL, NULL, 300, '300m', 0, '0m', 0, NULL, '70', 0),
  (90, '70/118680-119360at', 'at', 118680, 119360, NULL, NULL, 680, '680m', 0, '0m', 0, NULL, '70', 0),
  (91, '70/119360-120191ct', 'ct', 119360, 120191, NULL, NULL, 831, '831m', 0, '0m', 0, NULL, '70', 0),
  (92, '70/136331-136980at', 'at', 136331, 136980, NULL, NULL, 649, '649m', 0, '0m', 0, 'ZRX ZQX', '70', 0),
  (93, '70/136980-138897ct', 'ct', 136980, 138897, NULL, NULL, 1917, '1917m', 0, '0m', 0, NULL, '70', 0),
  (94, '70/139191-139400at', 'at', 139190, 139400, NULL, NULL, 210, '210m', 0, '0m', 0, NULL, '70', 0),
  (95, '70/139401-139750ct', 'ct', 139400, 139750, NULL, NULL, 350, '350m', 0, '0m', 0, NULL, '70', 0),
  (96, '70/139751-139901sm', 'sm', 139750, 139900, NULL, NULL, 150, '150m', 0, '0m', 0, NULL, '70', 0),
  (97, '70/139902-140201ct', 'ct', 139900, 140200, NULL, NULL, 300, '300m', 0, '0m', 0, NULL, '70', 0),
  (98, '70/140202-140780sm', 'sm', 140200, 140780, NULL, NULL, 580, '580m', 0, '0m', 0, NULL, '70', 0),
  (99, '70/140780-141180at', 'at', 140780, 141180, NULL, NULL, 400, '400m', 0, '0m', 0, NULL, '70', 0),
  (100, '71/174900-175449at', 'at', 174900, 175449, NULL, NULL, 549, '549m', 0, '0m', 0, 'ZIQ ZVI', '71', 0),
  (101, '71/175456-176124ct', 'ct', 175456, 176124, NULL, NULL, 668, '668m', 0, '0m', 0, NULL, '71', 0),
  (102, '71/203490-203800sm', 'sm', 203490, 203800, NULL, NULL, 310, '310m', 0, '0m', 0, 'ZSK ZHX', '71', 0),
  (103, '71/203800-204270at', 'at', 203800, 204270, NULL, NULL, 470, '470m', 0, '0m', 0, NULL, '71', 0),
  (104, '71/204270-205092sm', 'sm', 204270, 205092, NULL, NULL, 822, '822m', 0, '0m', 0, NULL, '71', 0),
  (105, '71/205124-205589sm', 'sm', 205124, 205589, NULL, NULL, 465, '465m', 0, '0m', 0, NULL, '71', 0),
  (106, '71/205602-206170ct', 'ct', 205602, 206170, NULL, NULL, 568, '568m', 0, '0m', 0, NULL, '71', 0),
  (107, '71/206170-206530at', 'at', 206170, 206530, NULL, NULL, 360, '360m', 0, '0m', 0, NULL, '71', 0),
  (108, '71/206530-207128sm', 'sm', 206530, 207128, NULL, NULL, 598, '598m', 0, '0m', 0, NULL, '71', 0),
  (109, '71/207162-208067sm', 'sm', 207162, 208067, NULL, NULL, 905, '905m', 0, '0m', 0, NULL, '71', 0),
  (110, '71/208117-208560at', 'at', 208117, 208560, NULL, NULL, 443, '443m', 0, '0m', 0, NULL, '71', 0),
  (111, '71/219000-219904at', 'at', 219000, 219904, NULL, NULL, 904, '904m', 0, '0m', 0, 'ZHX ZTI', '71', 0),
  (112, '71/219910-220510ct', 'ct', 219910, 220510, NULL, NULL, 600, '600m', 0, '0m', 0, NULL, '71', 0),
  (113, '71/220510-220759at', 'at', 220510, 220759, NULL, NULL, 249, '249m', 0, '0m', 0, NULL, '71', 0),
  (114, '71/220765-221020at', 'at', 220765, 221020, NULL, NULL, 255, '255m', 0, '0m', 0, NULL, '71', 0),
  (115, '71/221020-222081sm', 'sm', 221020, 222081, NULL, NULL, 1061, '1061m', 0, '0m', 0, NULL, '71', 0),
  (116, '78/214000-214200ct', 'ct', 214000, 214200, NULL, NULL, 200, '200m', 0, '0m', 0, 'ZEP ZFG', '78', 0.09278975157967627),
  (117, '78/214200-214310sm', 'sm', 214200, 214310, NULL, NULL, 110, '110m', 0, '0m', 0, NULL, '78', 0),
  (118, '78/214310-214500ct', 'ct', 214310, 214500, NULL, NULL, 190, '190m', 0, '0m', 0, NULL, '78', 0),
  (119, '78/214500-214810at', 'at', 214500, 214810, NULL, NULL, 310, '310m', 0, '0m', 0, NULL, '78', 0),
  (120, '78/214810-215240ct', 'ct', 214810, 215240, NULL, NULL, 430, '430m', 0, '0m', 0, NULL, '78', 0),
  (121, '78/215240-215447sm', 'sm', 215240, 215447, NULL, NULL, 207, '207m', 0, '0m', 0, NULL, '78', 0),
  (122, '78/215447-215560ct', 'ct', 215447, 215560, NULL, NULL, 113, '113m', 0, '0m', 0, NULL, '78', 0),
  (123, '78/215620-215690ct', 'ct', 215620, 215690, NULL, NULL, 70, '70m', 0, '0m', 0, NULL, '78', 0),
  (124, '78/215705-215850at', 'at', 215690, 215850, NULL, NULL, 160, '160m', 0, '0m', 0, NULL, '78', 0),
  (125, '78/215850-216200ct', 'ct', 215850, 216200, NULL, NULL, 350, '350m', 0, '0m', 0, NULL, '78', 0),
  (126, '78/216200-216420sm', 'sm', 216200, 216420, NULL, NULL, 220, '220m', 0, '0m', 0, NULL, '78', 0),
  (127, '78/216420-216823ct', 'ct', 216420, 216823, NULL, NULL, 403, '403m', 0, '0m', 0, NULL, '78', 0),
  (128, '78/216823-217098at', 'at', 216823, 217098, NULL, NULL, 275, '275m', 0, '0m', 0, NULL, '78', 0),
  (129, '78/221088-223000ct', 'ct', 221088, 223000, NULL, NULL, 1912, '1912m', 0, '0m', 0, 'ZFG ZTR', '78', 0),
  (130, '78/271410-272310at', 'at', 271410, 272310, NULL, NULL, 900, '900m', 0, '0m', 0, 'ZLF ZJU', '78', 0),
  (131, '78/272310-272610ct', 'ct', 272310, 272610, 272300, 272549, 300, '300m', 249, '249m', 0.83, NULL, '78', 0),
  (132, '78/272610-273344ct', 'ct', 272610, 273344, NULL, NULL, 734, '734m', 0, '0m', 0, NULL, '78', 0),
  (133, '78/273350-273640at', 'at', 273350, 273640, NULL, NULL, 290, '290m', 0, '0m', 0, NULL, '78', 0),
  (134, '78/273640-274598ct', 'ct', 273640, 274598, 273600, 274423, 958, '958m', 823, '823m', 0.8590814196242171, NULL, '78', 0),
  (135, '78/274604-274900at', 'at', 274604, 274900, NULL, NULL, 296, '296m', 0, '0m', 0, NULL, '78', 0),
  (136, '78/274900-276270ct', 'ct', 274900, 276270, NULL, NULL, 1370, '1370m', 0, '0m', 0, 'ZJU ZWM', '78', 0),
  (137, '78/276270-276730at', 'at', 276270, 276730, NULL, NULL, 460, '460m', 0, '0m', 0, NULL, '78', 0),
  (138, '78/276730-277566ct', 'ct', 276730, 277566, NULL, NULL, 836, '836m', 0, '0m', 0, NULL, '78', 0),
  (139, '78/277571-278030at', 'at', 277571, 278030, NULL, NULL, 459, '459m', 0, '0m', 0, NULL, '78', 0)
on conflict (equip_infra) do update set
  excel_row = excluded.excel_row,
  atividade = excluded.atividade,
  kmi = excluded.kmi,
  kmf = excluded.kmf,
  kmi_real = excluded.kmi_real,
  kmf_real = excluded.kmf_real,
  ext = excluded.ext,
  ext_m = excluded.ext_m,
  ext_real = excluded.ext_real,
  ext_real_m = excluded.ext_real_m,
  percentual_real = excluded.percentual_real,
  sb = excluded.sb,
  sub = excluded.sub,
  percentual_sub = excluded.percentual_sub,
  updated_at = now();

-- Carga inicial: Obras
insert into public.obras (seed_key, excel_row, sub, sb, km, descricao, tipo_obra, risco, motivo, equipamento, ext_eq, ext_eq_m, prazo_mes, dt_inicio, status, progresso, obs) values
  ('63-ZJY-ZCP-45969-RECUPERACAO-DE-BUEIRO-DANIFICADO-E-CAIXA-A-JUSANTE', 3, '63', 'ZJY - ZCP', 45969, 'Recuperação de bueiro danificado e caixa a jusante', 'Drenagem', 'Não informado', NULL, NULL, NULL, NULL, 0.5, NULL, 'NÃO INICIADO', 0, NULL),
  ('68-ZBV-ZRC-66400-DRENAGEM-PROFUNDA-SUPERFICIAL-68-065381-067110CT', 4, '68', 'ZBV - ZRC', 66400, 'Drenagem profunda + superficial', 'Drenagem', 'Alto', 'Histórico de restrição', '68/065381-067110ct', 1729, '1729m', 6, NULL, 'NÃO INICIADO', 0, NULL),
  ('68-ZBV-ZRC-67136-DRENAGEM-PROFUNDA-CANAL-SUPERFICIAL-AMV-E-PN-68-067136-069774SM', 5, '68', 'ZBV - ZRC', 67136, 'Drenagem profunda + canal superficial (AMV e PN)', 'Drenagem', 'Baixo', 'Acúmulo de água', '68/067136-069774sm', 2638, '2638m', 2, NULL, 'NÃO INICIADO', 0, NULL),
  ('70-ZRC-ZIC-97300-DRENAGEM-SUPERFICIAL-427M-BASE-DE-RACHAO-70-096959-098934CT', 6, '70', 'ZRC - ZIC', 97300, 'Drenagem superficial (427m) + base de rachão', 'Pavimento / Drenagem', 'Baixo', 'Plataforma instável', '70/096959-098934ct', 427, '427m', 0.5, NULL, 'EM ANDAMENTO', 0.5, 'REALIZADO A BASE DE RACHÃO, CANALETA AINDA NÃO INICIOU'),
  ('70-ZRC-ZIC-101350-DRENAGEM-SUPERFICIAL-650M-70-101107-101972CT', 7, '70', 'ZRC - ZIC', 101350, 'Drenagem superficial (650m)', 'Pavimento / Drenagem', 'Moderado', 'Plataforma instável', '70/101107-101972ct', 650, '650m', 1, NULL, 'NÃO INICIADO', 0, NULL),
  ('70-ZRC-ZIC-106267-DRENAGEM-PROFUNDA-SUPERFICIAL-70-105988-106950SM', 8, '70', 'ZRC - ZIC', 106267, 'Drenagem profunda + superficial', 'Pavimento / Drenagem', 'Moderado', 'Plataforma instável', '70/105988-106950sm', 962, '962m', 2.5, NULL, 'NÃO INICIADO', 0, NULL),
  ('70-ZRC-ZIC-134715-BASE-DE-RACHAO-DRENAGEM-PROFUNDA-70-134480-135897CT', 9, '70', 'ZRC - ZIC', 134715, 'Base de rachão + drenagem profunda', 'Pavimento / Drenagem', 'Moderado', 'Plataforma instável', '70/134480-135897ct', 1417, '1417m', 4, '2026-04-28', 'EM ANDAMENTO', 0.5, 'REALIZADO A BASE DE RACHÃO, DRENAGEM INICIOU, EM ANDAMENTO'),
  ('70-ZRC-ZIC-139002-BASE-DE-RACHAO-200-M-DRENAGEM-PROFUNDA-70-139002-139190CT', 10, '70', 'ZRC - ZIC', 139002, 'Base de rachão (200 m) + drenagem profunda', 'Pavimento / Drenagem', 'Baixo', 'Plataforma instável', '70/139002-139190ct', 188, '188m', 1, NULL, 'EM ANDAMENTO', 0.5, 'REALIZADO A BASE DE RACHÃO, DRENAGEM AINDA NÃO INICIOU'),
  ('70-ZRC-ZIC-141180-BASE-DE-RACHAO-200-M-DRENAGEM-PROFUNDA-70-141180-141380CT', 11, '70', 'ZRC - ZIC', 141180, 'Base de rachão (200 m) + drenagem profunda', 'Pavimento / Drenagem', 'Baixo', 'Plataforma instável', '70/141180-141380ct', 200, '200m', 1, NULL, 'EM ANDAMENTO', 0.5, 'REALIZADO A BASE DE RACHÃO, DRENAGEM AINDA NÃO INICIOU'),
  ('70-ZRC-ZIC-141680-IMPLANTACAO-DE-DRENAGEM-PROFUNDA-70-141680-141880CT', 12, '70', 'ZRC - ZIC', 141680, 'Implantação de drenagem profunda', 'Drenagem', 'Baixo', 'Plataforma instável', '70/141680-141880ct', 200, '200m', 1, NULL, 'NÃO INICIADO', 0, NULL),
  ('70-ZRC-ZIC-142800-DRENAGEM-PROFUNDA-BASE-DE-RACHAO-70-141920-144452CT', 13, '70', 'ZRC - ZIC', 142800, 'Drenagem profunda + base de rachão', 'Pavimento / Drenagem', 'Moderado', NULL, '70/141920-144452ct', 2532, '2532m', 6, NULL, 'NÃO INICIADO', 0, NULL),
  ('70-ZRC-ZIC-157440-BASE-DE-RACHAO-DRENAGEM-PROFUNDA-100-M-70-157440-158197CT', 14, '70', 'ZRC - ZIC', 157440, 'Base de rachão + drenagem profunda (100 m)', 'Pavimento / Drenagem', 'Moderado', 'Histórico de acidente', '70/157440-158197ct', 1500, '1500m', 4, NULL, 'CONCLUÍDO', 1, NULL),
  ('78-ZIQ-ZBU-214700-ESTABILIZACAO-DE-TALUDE-APARALASTRO-78-214500-214810AT', 15, '78', 'ZIQ - ZBU', 214700, 'Estabilização de talude + aparalastro', 'Talude / Aterro', 'Alto', NULL, '78/214500-214810at', 310, '310m', 1, NULL, 'NÃO INICIADO', 0, NULL),
  ('78-ZIQ-ZBU-271000-EXECUCAO-DE-BUEIRO-DE-GROTA', 16, '78', 'ZIQ - ZBU', 271000, 'Execução de bueiro de grota', 'Bueiro', NULL, NULL, NULL, NULL, NULL, 1, NULL, 'EM ANDAMENTO', 0.5, 'OBRA DE EXECUÇÃO DO DRENO INICIADA'),
  ('78-ZIQ-ZBU-291000-ESTABILIZACAO-DE-TALUDE-APARALASTRO-78-290200-291300AT', 17, '78', 'ZIQ - ZBU', 291000, 'Estabilização de talude + aparalastro', 'Talude / Aterro', 'Moderado', 'Histórico de acidente', '78/290200-291300at', 1100, '1100m', 1, NULL, 'NÃO INICIADO', 0, NULL)
on conflict (seed_key) do update set
  excel_row = excluded.excel_row,
  sub = excluded.sub,
  sb = excluded.sb,
  km = excluded.km,
  descricao = excluded.descricao,
  tipo_obra = excluded.tipo_obra,
  risco = excluded.risco,
  motivo = excluded.motivo,
  equipamento = excluded.equipamento,
  ext_eq = excluded.ext_eq,
  ext_eq_m = excluded.ext_eq_m,
  prazo_mes = excluded.prazo_mes,
  dt_inicio = excluded.dt_inicio,
  status = excluded.status,
  progresso = excluded.progresso,
  obs = excluded.obs,
  updated_at = now();

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_limpeza_updated_at on public.limpeza;
create trigger touch_limpeza_updated_at before update on public.limpeza
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_obras_updated_at on public.obras;
create trigger touch_obras_updated_at before update on public.obras
  for each row execute function public.touch_updated_at();

drop trigger if exists audit_limpeza_changes on public.limpeza;
create trigger audit_limpeza_changes after insert or update or delete on public.limpeza
  for each row execute function public.audit_table_changes();

drop trigger if exists audit_obras_changes on public.obras;
create trigger audit_obras_changes after insert or update or delete on public.obras
  for each row execute function public.audit_table_changes();

-- Depois que o primeiro usuário entrar/cadastrar no site, rode uma vez no SQL Editor:
-- update public.profiles set role = 'coordenacao' where email = 'SEU_EMAIL_CORPORATIVO@empresa.com';
