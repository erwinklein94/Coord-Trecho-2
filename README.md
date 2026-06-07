# Trecho 2 — Dashboard PDM Infraestrutura

Site estático pronto para **GitHub Pages**, agora configurado como **dashboard local** para proteger os dados da planilha PDM.

## Como funciona

1. Abra o site.
2. O dashboard inicia **zerado**, sem dados de exemplo preenchidos.
3. Vá em **Fonte de dados**.
4. Clique em **Importar planilha**.
5. Selecione a planilha PDM atualizada em formato `.xlsx` ou `.xlsm`.
6. O dashboard será gerado no próprio navegador.

A planilha **não precisa ser publicada online** e não fica armazenada no GitHub.

## Abas esperadas na planilha

O sistema procura estas abas:

- `ZBV-ZAR PDM Limpeza DR` ou `ZBV-ZAR PDM Limpeza`
- `ZBV-ZAR Obras DR` ou `ZBV-ZAR Obras`

A estrutura das colunas deve seguir a planilha usada como modelo neste projeto.

## Dashboards incluídos

- **Visão geral**
- **Limpeza Geral**
  - Cards por SUB
  - Percentual por SUB
  - Planejado, executado e saldo
  - Detalhes dos equipamentos
- **Obras**
  - Cards por obra
  - SUB, KM, status, risco matriz, tipo, equipamento, extensão, motivo e observação
- **Fonte de dados**
  - Importação local da planilha PDM

## Segurança dos dados

Este modelo evita publicar a planilha real em serviços externos. O arquivo Excel é lido localmente no navegador da pessoa que está usando o site.

Pontos importantes:

- Não coloque a planilha real dentro do repositório do GitHub.
- Não publique CSV, JSON ou PDF com dados sigilosos no GitHub Pages.
- Os arquivos `data/pdm-limpeza.json` e `data/obras-dr.json` ficam vazios por padrão.
- Para visualizar dados reais, importe a planilha localmente pela aba **Fonte de dados**.

## Compatibilidade

A leitura local de Excel usa recursos modernos do navegador. Recomenda-se usar **Google Chrome** ou **Microsoft Edge** atualizados.

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos deste pacote para a raiz do repositório.
3. Vá em **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Salve e aguarde o link do GitHub Pages.

## Arquivos principais

```text
index.html
styles.css
script.js
data/pdm-limpeza.json
data/obras-dr.json
data/source-config.json
```

Gerado para o fluxo de dashboard local com tela inicial zerada.
