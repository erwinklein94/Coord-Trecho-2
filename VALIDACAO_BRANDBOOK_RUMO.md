# Validação — Identidade Visual Rumo

Aplicação do brand book oficial da Rumo (https://brandbook.rumolog.com/) no dashboard
**Trecho 2 — PDM Infraestrutura**. Stack: HTML + CSS + JS puro.

Abordagem (de baixo risco): **tokens centralizados + aliases**. O site já usava variáveis
CSS (`--navy`, `--blue`, `--green`, `--yellow`, `--border`, `--radius`…), então em vez de
caçar cor por cor, os tokens institucionais foram definidos uma vez e as variáveis
existentes passaram a apontar para eles.

## O que mudou

### Tokens e cores (`styles.css`)
Paleta institucional adicionada no `:root` e ligada aos aliases do projeto:

| Token Rumo | HEX | Variável do projeto que passou a usá-lo |
|---|---|---|
| Azul (âncora) | `#003865` | `--navy`, `--navy-2`, `.tab.active` |
| Azul claro | `#32A6E6` | `--blue` (links, realces, progresso) |
| Verde | `#1E9F7F` | `--green` (sucesso, confirmações) |
| Verde claro | `#7FE06C` | base de `--green-soft`, highlights |
| Amarelo | `#FBD300` | `--yellow` (apenas toques: eyebrow, alertas, badge) |
| Cinza 50/100/200 | `#F2F5F6` / `#E5EBEE` / `#D7E0E5` | `--bg`, `--surface-2`, `--border` |
| Texto neutro | `#4D626F` | `--muted` |

- **Proporção respeitada:** azul escuro dominante + branco/neutros na estrutura; azuis/verdes
  como acentos; amarelo só em toques. **Roxo não foi usado** (é cor da Raízen).
- **Forma:** `--radius` ajustado de `22px` para `14px` (chanfro sutil do grafismo).
- **Sombra:** tingida no azul (`rgba(0,56,101,…)`).

### Tipografia
- `body` agora usa `--rumo-fonte: "Cera Pro", Verdana, Geneva, Tahoma, sans-serif`
  (antes Arial).
- ⚠️ **Cera Pro não foi embutida** — é fonte paga e não pode ser redistribuída. Quem tiver
  a licença instalada vê a Cera Pro; os demais caem para **Verdana**, o fallback oficial do
  manual.

### Logo (`index.html` + `assets/rumo/`)
- O "selo" de texto improvisado (`r` + palavra "rumo") foi substituído pelo **logo oficial**.
- Duas versões incluídas, trocadas por tema:
  - `rumo-logo-azul.png` — header claro (tema claro);
  - `rumo-logo-branco.png` — header azul profundo (tema escuro).
- **Área de segurança** preservada (margem ao redor do logo) e altura de 34px (≈145px de
  largura) — bem acima da redução mínima de 70px. Logo **não** distorcido nem recolorido.

### Tema escuro
Alinhado à regra do manual: fundos **azul profundo** (`#001E36` / `#002B4D`) com
**logo e texto brancos** e acentos em azul claro / verde claro.

## Checklist do brand book
- [x] Azul `#003865` dominante; secundária só em toques.
- [x] Roxo ausente (cor da Raízen).
- [x] Logo na versão certa por fundo, com área de segurança e ≥ 70px.
- [x] Fonte Cera Pro com fallback Verdana — sem embutir a Cera Pro.
- [x] Contraste AA/AAA (texto branco sobre azul; amarelo só em fundo/badge, nunca como texto).
- [x] Cantos com chanfro/raio sutil (14px); sombras tingidas no azul.
- [x] Esta validação documentada.

## Não alterado (fora do escopo "aparência")
- Lógica de importação da planilha e geração dos dashboards (`script.js`).
- Estrutura/semântica do HTML e textos de conteúdo.
