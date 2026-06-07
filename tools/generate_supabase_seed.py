from __future__ import annotations

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

XLSX_PATH = Path('/mnt/data/1. UNIFILAR T2 DR (1).xlsx')
OUT_SQL = Path('/mnt/data/work/Coord-Infra-Trecho-2-main/supabase/schema-and-seed.sql')
OUT_JSON = Path('/mnt/data/work/Coord-Infra-Trecho-2-main/data/seed-preview.json')

NS_MAIN = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
NS_REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
NS_PKG_REL = '{http://schemas.openxmlformats.org/package/2006/relationships}'

def normalize(value: Any) -> str:
    import unicodedata
    text = str(value or '')
    text = unicodedata.normalize('NFD', text)
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn')
    text = re.sub(r'[^A-Za-z0-9]+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip().upper()

def compact(value: Any) -> str:
    return normalize(value).replace(' ', '')

def col_to_index(ref: str) -> int:
    letters = re.sub(r'\d+', '', ref or '').upper()
    idx = 0
    for char in letters:
        idx = idx * 26 + ord(char) - 64
    return idx - 1

def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if 'xl/sharedStrings.xml' not in zf.namelist():
        return []
    root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
    strings = []
    for si in root.findall(f'.//{NS_MAIN}si'):
        text = ''.join(t.text or '' for t in si.findall(f'.//{NS_MAIN}t'))
        strings.append(text)
    return strings

def normalize_workbook_target(target: str) -> str:
    if target.startswith('/'):
        return target.lstrip('/')
    parts = ['xl'] + target.split('/')
    normalized: list[str] = []
    for part in parts:
        if not part or part == '.':
            continue
        if part == '..':
            if normalized:
                normalized.pop()
        else:
            normalized.append(part)
    return '/'.join(normalized)

def parse_sheets(zf: zipfile.ZipFile) -> list[dict[str, str]]:
    workbook = ET.fromstring(zf.read('xl/workbook.xml'))
    rels = ET.fromstring(zf.read('xl/_rels/workbook.xml.rels'))
    rel_map = {}
    for rel in rels.findall(f'.//{NS_PKG_REL}Relationship'):
        rel_id = rel.attrib.get('Id')
        target = rel.attrib.get('Target', '')
        if rel_id:
            rel_map[rel_id] = normalize_workbook_target(target)
    sheets = []
    for sheet in workbook.findall(f'.//{NS_MAIN}sheet'):
        rel_id = sheet.attrib.get(f'{NS_REL}id') or sheet.attrib.get('r:id')
        sheets.append({'name': sheet.attrib.get('name', ''), 'path': rel_map.get(rel_id, '')})
    return sheets

def parse_sheet_matrix(zf: zipfile.ZipFile, path: str, shared_strings: list[str]) -> list[list[Any]]:
    root = ET.fromstring(zf.read(path))
    raw_rows: dict[int, list[Any]] = {}
    for row_node in root.findall(f'.//{NS_MAIN}row'):
        row_number = int(row_node.attrib.get('r', len(raw_rows) + 1)) - 1
        row = raw_rows.get(row_number, [])
        for cell in row_node.findall(f'{NS_MAIN}c'):
            ref = cell.attrib.get('r', '')
            col_idx = col_to_index(ref) if ref else len(row)
            while len(row) <= col_idx:
                row.append('')
            row[col_idx] = read_cell(cell, shared_strings)
        raw_rows[row_number] = row
    rows = [raw_rows[i] for i in sorted(raw_rows)]
    max_len = max((len(row) for row in rows), default=0)
    return [row + [''] * (max_len - len(row)) for row in rows]

def read_cell(cell: ET.Element, shared_strings: list[str]) -> Any:
    typ = cell.attrib.get('t')
    value_node = cell.find(f'{NS_MAIN}v')
    raw = value_node.text if value_node is not None and value_node.text is not None else ''
    if typ == 's':
        try:
            return shared_strings[int(raw)]
        except Exception:
            return ''
    if typ == 'inlineStr':
        return ''.join(t.text or '' for t in cell.findall(f'.//{NS_MAIN}t'))
    if typ == 'b':
        return raw == '1'
    if raw == '':
        return ''
    try:
        n = float(raw)
        return int(n) if n.is_integer() else n
    except Exception:
        return raw

def find_sheet(sheets: list[dict[str, str]], candidates: list[str]) -> dict[str, str]:
    cand_norm = [normalize(c) for c in candidates]
    for sheet in sheets:
        if normalize(sheet['name']) in cand_norm:
            return sheet
    for sheet in sheets:
        name = normalize(sheet['name'])
        if any(c in name for c in cand_norm):
            return sheet
    raise RuntimeError(f'Sheet not found. Available: {[s["name"] for s in sheets]}')

def header_map(row: list[Any]) -> dict[str, int]:
    mp: dict[str, int] = {}
    for i, cell in enumerate(row):
        for key in (normalize(cell), compact(cell)):
            if key and key not in mp:
                mp[key] = i
    return mp

def get_index(mp: dict[str, int], aliases: list[str]) -> int | None:
    for alias in aliases:
        for key in (normalize(alias), compact(alias)):
            if key in mp:
                return mp[key]
    keys = list(mp.keys())
    for alias in aliases:
        key = normalize(alias)
        cmp = compact(alias)
        for map_key in keys:
            if key and key in map_key:
                return mp[map_key]
            if cmp and cmp in map_key:
                return mp[map_key]
    return None

def get(row: list[Any], mp: dict[str, int], aliases: list[str]) -> Any:
    idx = get_index(mp, aliases)
    if idx is None or idx >= len(row):
        return ''
    return row[idx]


def get_exactish(row: list[Any], data_row: list[Any], aliases: list[str]) -> Any:
    raw_aliases = {str(alias).strip().upper() for alias in aliases}
    for idx, header in enumerate(row):
        if str(header).strip().upper() in raw_aliases:
            return data_row[idx] if idx < len(data_row) else ''
    alias_norms = {normalize(alias) for alias in aliases if '%' not in str(alias)}
    for idx, header in enumerate(row):
        if normalize(header) in alias_norms:
            return data_row[idx] if idx < len(data_row) else ''
    return ''

def find_header_row(matrix: list[list[Any]], required: list[list[str]]) -> int:
    for idx, row in enumerate(matrix):
        mp = header_map(row)
        if all(get_index(mp, aliases) is not None for aliases in required):
            return idx
    return -1

def clean(value: Any) -> str:
    if value is None:
        return ''
    text = str(value).strip()
    return '' if text == '-' else text

def number(value: Any, default: float = 0.0) -> float:
    if value is None or value == '':
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace('m', '').replace('M', '').replace('%', '').replace(' ', '')
    if not text or text == '-':
        return default
    if ',' in text and '.' not in text:
        text = text.replace('.', '').replace(',', '.')
    else:
        text = text.replace(',', '.')
    try:
        return float(text)
    except ValueError:
        return default

def nullable_number(value: Any) -> float | None:
    if value is None or str(value).strip() in ('', '-'):
        return None
    return number(value, 0.0)

def integer(value: Any) -> int | None:
    n = nullable_number(value)
    return None if n is None else int(round(n))

def excel_date_text(value: Any) -> str:
    n = nullable_number(value)
    if n is None or n <= 0:
        return ''
    # Excel serial date system used by xlsx: base 1899-12-30 handles leap-year bug compatibility.
    dt = datetime(1899, 12, 30) + timedelta(days=float(n))
    return dt.date().isoformat()

def normalize_limpeza(matrix: list[list[Any]]) -> list[dict[str, Any]]:
    header_idx = find_header_row(matrix, [['EQUIP_INFRA','EQUIP INFRA','EQUIPAMENTO INFRA'], ['EXT','EXTENSÃO'], ['EXT REAL','EXT REALIZADA','EXECUTADO']])
    if header_idx < 0:
        raise RuntimeError('Cabeçalho de limpeza não encontrado')
    mp = header_map(matrix[header_idx])
    rows = []
    for i, row in enumerate(matrix[header_idx + 1:], start=header_idx + 2):
        equip = clean(get(row, mp, ['EQUIP_INFRA','EQUIP INFRA','EQUIPAMENTO INFRA']))
        if not equip or '/' not in equip:
            continue
        ext = number(get(row, mp, ['EXT','EXTENSÃO','EXTENSAO']))
        ext_real = number(get(row, mp, ['EXT REAL','EXT REALIZADA','EXT EXECUTADA','EXECUTADO']))
        sub = clean(get(row, mp, ['SUB','SUBDIVISÃO','SUBDIVISAO'])) or (equip.split('/')[0] if '/' in equip else '')
        rows.append({
            'excel_row': i,
            'equip_infra': equip,
            'atividade': clean(get(row, mp, ['ATV','ATIVIDADE'])),
            'kmi': integer(get(row, mp, ['KMI','KM INICIAL'])),
            'kmf': integer(get(row, mp, ['KMF','KM FINAL'])),
            'kmi_real': integer(get(row, mp, ['KMI REAL','KM INICIAL REAL'])),
            'kmf_real': integer(get(row, mp, ['KMF REAL','KM FINAL REAL'])),
            'ext': ext,
            'ext_m': f'{round(ext)}m',
            'ext_real': ext_real,
            'ext_real_m': f'{round(ext_real)}m',
            'percentual_real': ext_real / ext if ext else 0,
            'sb': clean(get(row, mp, ['SB','SUBTRECHO'])),
            'sub': clean(sub),
            'percentual_sub': number(get_exactish(matrix[header_idx], row, ['%SUB','PERCENTUAL SUB'])),
        })
    return rows

def status_progress(status: str) -> float:
    norm = normalize(status)
    if 'CONCLUI' in norm:
        return 1
    if 'ANDAMENTO' in norm:
        return 0.5
    return 0

def normalize_obras(matrix: list[list[Any]]) -> list[dict[str, Any]]:
    header_idx = find_header_row(matrix, [['SUB','SUBDIVISÃO','SUBDIVISAO'], ['DESCRIÇÃO OBRA','DESCRICAO OBRA','DESCRIÇÃO DA OBRA','OBRA'], ['STATUS','SITUAÇÃO','SITUACAO']])
    if header_idx < 0:
        raise RuntimeError('Cabeçalho de obras não encontrado')
    mp = header_map(matrix[header_idx])
    rows = []
    current_sub = ''
    for i, row in enumerate(matrix[header_idx + 1:], start=header_idx + 2):
        maybe_sub = clean(get(row, mp, ['SUB','SUBDIVISÃO','SUBDIVISAO']))
        if maybe_sub:
            current_sub = maybe_sub
        descricao = clean(get(row, mp, ['DESCRIÇÃO OBRA','DESCRICAO OBRA','DESCRIÇÃO DA OBRA','OBRA']))
        if not descricao or 'plano de drenagem' in descricao.lower():
            continue
        status = clean(get(row, mp, ['STATUS','SITUAÇÃO','SITUACAO'])) or 'NÃO INFORMADO'
        km = integer(get(row, mp, ['KM','KILOMETRO','QUILÔMETRO','QUILOMETRO']))
        equipamento = clean(get(row, mp, ['EQUIPAMENTO','EQUIP_INFRA','EQUIP INFRA']))
        seed_key = normalize('|'.join([current_sub, clean(get(row, mp, ['SB','SUBTRECHO'])), str(km or ''), descricao, equipamento])).replace(' ', '-')[:180]
        rows.append({
            'seed_key': seed_key,
            'excel_row': i,
            'sub': current_sub,
            'sb': clean(get(row, mp, ['SB','SUBTRECHO'])),
            'km': km,
            'descricao': descricao,
            'tipo_obra': clean(get(row, mp, ['TIPO DE OBRA','TIPO OBRA'])),
            'risco': clean(get(row, mp, ['RISCO','RISCO MATRIZ','MATRIZ DE RISCO'])),
            'motivo': clean(get(row, mp, ['MOTIVO','JUSTIFICATIVA'])),
            'equipamento': equipamento,
            'ext_eq': nullable_number(get(row, mp, ['EXT EQ.','EXT EQ','EXTENSÃO EQ','EXTENSAO EQ'])),
            'ext_eq_m': clean(get(row, mp, ['EXT EQ.(M)','EXT EQ M','EXTENSÃO EQ M','EXTENSAO EQ M'])),
            'prazo_mes': nullable_number(get(row, mp, ['PRAZO (MÊS)','PRAZO MES','PRAZO'])),
            'dt_inicio': excel_date_text(get(row, mp, ['DT INÍCIO','DT INICIO','DATA INÍCIO','DATA INICIO'])),
            'status': status,
            'progresso': status_progress(status),
            'obs': clean(get(row, mp, ['OBS.','OBS','OBSERVAÇÃO','OBSERVACAO'])),
        })
    return rows

def sql_literal(value: Any) -> str:
    if value is None or value == '':
        return 'NULL'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return repr(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"

def values_sql(rows: list[dict[str, Any]], cols: list[str]) -> str:
    return ',\n'.join('  (' + ', '.join(sql_literal(row.get(col)) for col in cols) + ')' for row in rows)

def build_sql(limpeza: list[dict[str, Any]], obras: list[dict[str, Any]]) -> str:
    limpeza_cols = ['excel_row','equip_infra','atividade','kmi','kmf','kmi_real','kmf_real','ext','ext_m','ext_real','ext_real_m','percentual_real','sb','sub','percentual_sub']
    obras_cols = ['seed_key','excel_row','sub','sb','km','descricao','tipo_obra','risco','motivo','equipamento','ext_eq','ext_eq_m','prazo_mes','dt_inicio','status','progresso','obs']
    return f"""-- Supabase schema + carga inicial gerada a partir de 1. UNIFILAR T2 DR (1).xlsx
-- Projeto: Trecho 2 | Dashboard PDM Infraestrutura
-- Gerado em: {datetime.now().isoformat(timespec='seconds')}

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
insert into public.limpeza ({', '.join(limpeza_cols)}) values
{values_sql(limpeza, limpeza_cols)}
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
insert into public.obras ({', '.join(obras_cols)}) values
{values_sql(obras, obras_cols)}
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
"""

def main() -> None:
    with zipfile.ZipFile(XLSX_PATH) as zf:
        shared = read_shared_strings(zf)
        sheets = parse_sheets(zf)
        limpeza_sheet = find_sheet(sheets, ['ZBV-ZAR PDM Limpeza DR', 'ZBV-ZAR PDM Limpeza', 'PDM Limpeza'])
        obras_sheet = find_sheet(sheets, ['ZBV-ZAR Obras DR', 'ZBV-ZAR Obras', 'Obras DR', 'Obras'])
        limpeza = normalize_limpeza(parse_sheet_matrix(zf, limpeza_sheet['path'], shared))
        obras = normalize_obras(parse_sheet_matrix(zf, obras_sheet['path'], shared))

    OUT_JSON.write_text(json.dumps({
        'sourceFile': XLSX_PATH.name,
        'generatedAt': datetime.now().isoformat(timespec='seconds'),
        'limpezaCount': len(limpeza),
        'obrasCount': len(obras),
        'limpeza': limpeza,
        'obras': obras,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    OUT_SQL.write_text(build_sql(limpeza, obras), encoding='utf-8')
    print(f'Gerado {OUT_SQL} com {len(limpeza)} linhas de limpeza e {len(obras)} obras')

if __name__ == '__main__':
    main()
