const APP_VERSION = "2026.05.19-2";

const STORAGE_KEYS = {
  theme: "trecho2-pdm-theme",
};

const TARGET_SHEETS = {
  limpeza: ["ZBV-ZAR PDM Limpeza DR", "ZBV-ZAR PDM Limpeza", "PDM Limpeza"],
  obras: ["ZBV-ZAR Obras DR", "ZBV-ZAR Obras", "Obras DR", "Obras"],
};

const state = {
  limpeza: { rows: [], subSummary: [], generatedAt: null, sourceSheet: "" },
  obras: { rows: [], generatedAt: null, sourceSheet: "" },
  sourceLabel: "Nenhuma planilha carregada",
  loadErrors: [],
};

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindNavigation();
  bindFilters();
  bindSourceActions();
  resetToEmptyData({ silent: true });
});

function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEYS.theme);
  const useDark = saved === "dark";
  document.body.classList.toggle("dark", useDark);
  updateThemeButton();

  document.getElementById("themeToggle").addEventListener("click", () => {
    const isDark = !document.body.classList.contains("dark");
    document.body.classList.toggle("dark", isDark);
    localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
    updateThemeButton();
  });
}

function updateThemeButton() {
  const isDark = document.body.classList.contains("dark");
  document.getElementById("themeToggleText").textContent = isDark ? "Tema claro" : "Tema escuro";
}

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.panel;
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      document.querySelectorAll(".panel").forEach((section) => {
        section.classList.toggle("active", section.id === `panel-${panel}`);
      });
    });
  });
}

function bindFilters() {
  ["limpezaSubFilter", "limpezaSearch"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderLimpeza);
  });

  ["obrasSubFilter", "obrasStatusFilter", "obrasRiscoFilter", "obrasSearch"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderObras);
  });
}

function bindSourceActions() {
  const fileInput = document.getElementById("pdmFileInput");
  const importButton = document.getElementById("importWorkbookBtn");
  const clearButton = document.getElementById("clearDataBtn");

  if (!fileInput || !importButton || !clearButton) return;

  importButton.addEventListener("click", importSelectedWorkbook);
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) {
      setLoadedFileInfo(`Arquivo selecionado: ${fileInput.files[0].name}. Importando...`);
      importSelectedWorkbook();
    }
  });

  clearButton.addEventListener("click", () => {
    fileInput.value = "";
    resetToEmptyData();
  });
}

function resetToEmptyData(options = {}) {
  state.loadErrors = [];
  state.limpeza = {
    title: "ZBV-ZAR PDM Limpeza",
    sourceSheet: "",
    sourceFile: "",
    generatedAt: null,
    rows: [],
    subSummary: [],
  };
  state.obras = {
    title: "ZBV-ZAR Obras",
    sourceSheet: "",
    sourceFile: "",
    generatedAt: null,
    rows: [],
  };
  state.sourceLabel = "Nenhuma planilha carregada";
  fillFilterOptions();
  renderAll();
  setLoadedFileInfo(`Nenhuma planilha local carregada. O dashboard está zerado até a importação da planilha PDM. Versão ${APP_VERSION}.`);
  if (!options.silent) {
    showStatus("Dados locais removidos. Importe uma planilha PDM para preencher o dashboard.");
    setTimeout(hideStatus, 3500);
  } else {
    hideStatus();
  }
}

async function importSelectedWorkbook() {
  const input = document.getElementById("pdmFileInput");
  const file = input?.files?.[0];

  if (!file) {
    showStatus("Selecione primeiro a planilha PDM em formato .xlsx ou .xlsm.");
    return;
  }

  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    showStatus("Formato não suportado. Use uma planilha .xlsx ou .xlsm.");
    return;
  }

  if (typeof DecompressionStream === "undefined") {
    showStatus("Este navegador não possui suporte necessário para ler Excel localmente. Use Chrome ou Edge atualizado.");
    return;
  }

  showStatus("Lendo planilha local no navegador. Nenhum arquivo será enviado para a internet...");
  setLoadedFileInfo(`Lendo ${file.name}... aguarde.`);

  try {
    const workbookData = await parsePdmWorkbook(file);
    const generatedAt = file.lastModified ? new Date(file.lastModified).toISOString() : new Date().toISOString();

    state.limpeza = {
      title: "ZBV-ZAR PDM Limpeza",
      sourceSheet: workbookData.limpezaSheetName,
      sourceFile: file.name,
      generatedAt,
      rows: workbookData.limpezaRows,
      subSummary: calculateSubSummary(workbookData.limpezaRows),
    };

    state.obras = {
      title: "ZBV-ZAR Obras",
      sourceSheet: workbookData.obrasSheetName,
      sourceFile: file.name,
      generatedAt,
      rows: workbookData.obrasRows,
    };

    state.sourceLabel = `Planilha local: ${file.name}`;
    fillFilterOptions();
    renderAll();
    setLoadedFileInfo(`Planilha carregada: ${file.name} • Limpeza: ${workbookData.limpezaRows.length} equipamentos • Obras: ${workbookData.obrasRows.length} • Versão ${APP_VERSION}`);
    showStatus(`Planilha importada com sucesso. Abas lidas: ${workbookData.limpezaSheetName} e ${workbookData.obrasSheetName}.`);
    setTimeout(hideStatus, 4500);
  } catch (error) {
    console.error(error);
    setLoadedFileInfo(`Falha na importação de ${file.name}: ${error.message}`);
    showStatus(`Não foi possível importar a planilha: ${error.message}`);
  }
}

function setLoadedFileInfo(message) {
  const el = document.getElementById("loadedFileInfo");
  if (el) el.textContent = message;
}


async function parsePdmWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const zip = parseZipCentralDirectory(buffer);

  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const workbookDoc = parseXml(workbookXml, "workbook.xml");
  const relsDoc = parseXml(relsXml, "workbook.xml.rels");
  const sharedStrings = await readSharedStrings(zip);
  const sheets = parseWorkbookSheets(workbookDoc, relsDoc);

  const limpezaSheet = findWorkbookSheet(sheets, TARGET_SHEETS.limpeza);
  const obrasSheet = findWorkbookSheet(sheets, TARGET_SHEETS.obras);

  if (!limpezaSheet) {
    throw new Error(`Aba de limpeza não encontrada. Abas disponíveis: ${sheets.map((sheet) => sheet.name).join(", ")}`);
  }

  if (!obrasSheet) {
    throw new Error(`Aba de obras não encontrada. Abas disponíveis: ${sheets.map((sheet) => sheet.name).join(", ")}`);
  }

  const limpezaMatrix = parseWorksheetMatrix(
    parseXml(await readZipText(zip, limpezaSheet.path), limpezaSheet.path),
    sharedStrings
  );

  const obrasMatrix = parseWorksheetMatrix(
    parseXml(await readZipText(zip, obrasSheet.path), obrasSheet.path),
    sharedStrings
  );

  return {
    limpezaSheetName: limpezaSheet.name,
    obrasSheetName: obrasSheet.name,
    limpezaRows: normalizeLimpezaFromMatrix(limpezaMatrix),
    obrasRows: normalizeObrasFromMatrix(obrasMatrix),
  };
}

function parseZipCentralDirectory(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8");
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const maxCommentLength = Math.min(bytes.length, 66000);

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= bytes.length - maxCommentLength; i--) {
    if (i < 0) break;
    if (view.getUint32(i, true) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset < 0) throw new Error("Arquivo Excel inválido ou corrompido.");

  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== centralSignature) break;

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (view.getUint32(localHeaderOffset, true) !== localSignature) {
      throw new Error(`Entrada ZIP inválida: ${fileName}`);
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;

    entries.set(fileName.replace(/^\//, ""), {
      name: fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      data: buffer.slice(dataStart, dataEnd),
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipText(zip, path) {
  const entry = zip.get(path.replace(/^\//, ""));
  if (!entry) throw new Error(`Arquivo interno não encontrado na planilha: ${path}`);

  let data;
  if (entry.compressionMethod === 0) {
    data = entry.data;
  } else if (entry.compressionMethod === 8) {
    data = await inflateRaw(entry.data);
  } else {
    throw new Error(`Método de compressão não suportado na planilha: ${entry.compressionMethod}`);
  }

  return new TextDecoder("utf-8").decode(data);
}

async function inflateRaw(data) {
  try {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).arrayBuffer();
  } catch (rawError) {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
      return await new Response(stream).arrayBuffer();
    } catch {
      throw rawError;
    }
  }
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`Erro ao ler ${label}.`);
  return doc;
}

async function readSharedStrings(zip) {
  if (!zip.has("xl/sharedStrings.xml")) return [];

  const doc = parseXml(await readZipText(zip, "xl/sharedStrings.xml"), "sharedStrings.xml");
  return Array.from(doc.getElementsByTagName("si")).map((si) => {
    return Array.from(si.getElementsByTagName("t")).map((node) => node.textContent || "").join("");
  });
}

function parseWorkbookSheets(workbookDoc, relsDoc) {
  const relMap = new Map();
  Array.from(relsDoc.getElementsByTagName("Relationship")).forEach((rel) => {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target") || "";
    if (id) relMap.set(id, normalizeWorkbookTarget(target));
  });

  return Array.from(workbookDoc.getElementsByTagName("sheet")).map((sheet) => {
    const relId = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    return {
      name: sheet.getAttribute("name") || "Sem nome",
      relId,
      path: relMap.get(relId),
    };
  }).filter((sheet) => sheet.path);
}

function normalizeWorkbookTarget(target) {
  if (!target) return "";
  if (target.startsWith("/")) return target.replace(/^\//, "");
  const parts = (`xl/${target}`).split("/");
  const normalized = [];
  parts.forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  });
  return normalized.join("/");
}

function findWorkbookSheet(sheets, candidates) {
  const normalizedCandidates = candidates.map(normalizeHeader);

  return sheets.find((sheet) => normalizedCandidates.includes(normalizeHeader(sheet.name))) ||
    sheets.find((sheet) => normalizedCandidates.some((candidate) => normalizeHeader(sheet.name).includes(candidate)));
}

function parseWorksheetMatrix(sheetDoc, sharedStrings) {
  const rawRows = [];
  const rowNodes = Array.from(sheetDoc.getElementsByTagName("row"));

  rowNodes.forEach((rowNode) => {
    const excelRow = Number(rowNode.getAttribute("r"));
    const targetRowIndex = Number.isFinite(excelRow) && excelRow > 0 ? excelRow - 1 : rawRows.length;
    const row = rawRows[targetRowIndex] || [];

    Array.from(rowNode.getElementsByTagName("c")).forEach((cell) => {
      const reference = cell.getAttribute("r") || "";
      const columnLetters = reference.replace(/\d+/g, "");
      const columnIndex = columnLetters ? columnNameToIndex(columnLetters) : row.length;
      row[columnIndex] = readCellValue(cell, sharedStrings);
    });

    rawRows[targetRowIndex] = row;
  });

  const compactRows = rawRows.filter(Boolean);
  const maxLength = compactRows.reduce((max, row) => Math.max(max, row.length), 0);
  return compactRows.map((row) => Array.from({ length: maxLength }, (_, index) => row[index] ?? ""));
}

function columnNameToIndex(name) {
  return String(name || "").toUpperCase().split("").reduce((index, char) => {
    return index * 26 + char.charCodeAt(0) - 64;
  }, 0) - 1;
}

function readCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  const valueNode = cell.getElementsByTagName("v")[0];
  const rawValue = valueNode ? valueNode.textContent || "" : "";

  if (type === "s") {
    return sharedStrings[Number(rawValue)] ?? "";
  }

  if (type === "inlineStr") {
    const inline = cell.getElementsByTagName("is")[0] || cell;
    return Array.from(inline.getElementsByTagName("t")).map((node) => node.textContent || "").join("");
  }

  if (type === "b") return rawValue === "1" ? "TRUE" : "FALSE";
  return rawValue;
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function compactHeader(value) {
  return normalizeHeader(value).replace(/\s+/g, "");
}

function findHeaderRow(matrix, requiredTerms) {
  return matrix.findIndex((row) => {
    const map = headerMap(row);
    return requiredTerms.every((term) => {
      const aliases = Array.isArray(term) ? term : [term];
      return getHeaderIndex(map, aliases) !== undefined;
    });
  });
}

function headerMap(row) {
  const map = {};
  row.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    const compact = compactHeader(cell);
    if (key && map[key] === undefined) map[key] = index;
    if (compact && map[compact] === undefined) map[compact] = index;
  });
  return map;
}

function getHeaderIndex(map, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const compact = compactHeader(alias);
    if (map[key] !== undefined) return map[key];
    if (map[compact] !== undefined) return map[compact];
  }

  const keys = Object.keys(map);
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const compact = compactHeader(alias);
    const found = keys.find((mapKey) => mapKey.includes(key) || mapKey.includes(compact));
    if (found !== undefined) return map[found];
  }

  return undefined;
}

function getByHeader(row, map, name) {
  return getByAnyHeader(row, map, [name]);
}

function getByAnyHeader(row, map, aliases) {
  const index = getHeaderIndex(map, aliases);
  return index === undefined ? "" : row[index];
}

function normalizeLimpezaFromMatrix(matrix) {
  const headerIndex = findHeaderRow(matrix, [["EQUIP_INFRA", "EQUIP INFRA", "EQUIPAMENTO INFRA"], ["EXT", "EXTENSÃO"], ["EXT REAL", "EXT REALIZADA", "EXECUTADO"]]);
  if (headerIndex < 0) throw new Error("Cabeçalho da aba de limpeza não encontrado.");

  const map = headerMap(matrix[headerIndex]);
  const rows = [];

  matrix.slice(headerIndex + 1).forEach((row, index) => {
    const equip = String(getByAnyHeader(row, map, ["EQUIP_INFRA", "EQUIP INFRA", "EQUIPAMENTO INFRA"]) || "").trim();
    if (!equip || !equip.includes("/")) return;

    const ext = parseNumber(getByAnyHeader(row, map, ["EXT", "EXTENSÃO", "EXTENSAO"]));
    const real = parseNumber(getByAnyHeader(row, map, ["EXT REAL", "EXT REALIZADA", "EXT EXECUTADA", "EXECUTADO"]));
    const sub = String(getByAnyHeader(row, map, ["SUB", "SUBDIVISÃO", "SUBDIVISAO"]) || equip.split("/")[0] || "").trim();

    rows.push({
      excelRow: headerIndex + index + 2,
      equipInfra: equip,
      atividade: String(getByAnyHeader(row, map, ["ATV", "ATIVIDADE"]) || "").trim(),
      kmi: parseInteger(getByAnyHeader(row, map, ["KMI", "KM INICIAL"])),
      kmf: parseInteger(getByAnyHeader(row, map, ["KMF", "KM FINAL"])),
      kmiReal: parseInteger(getByAnyHeader(row, map, ["KMI REAL", "KM INICIAL REAL"])),
      kmfReal: parseInteger(getByAnyHeader(row, map, ["KMF REAL", "KM FINAL REAL"])),
      ext,
      extM: `${Math.round(ext)}m`,
      extReal: real,
      extRealM: `${Math.round(real)}m`,
      percentualReal: ext ? real / ext : 0,
      sb: cleanOptional(getByAnyHeader(row, map, ["SB", "SUBTRECHO"])),
      sub,
      percentualSub: parseNumber(getByAnyHeader(row, map, ["%SUB", "PERCENTUAL SUB"])),
    });
  });

  return rows;
}

function normalizeObrasFromMatrix(matrix) {
  const headerIndex = findHeaderRow(matrix, [["SUB", "SUBDIVISÃO", "SUBDIVISAO"], ["DESCRIÇÃO OBRA", "DESCRICAO OBRA", "DESCRIÇÃO DA OBRA", "OBRA"], ["STATUS", "SITUAÇÃO", "SITUACAO"]]);
  if (headerIndex < 0) throw new Error("Cabeçalho da aba de obras não encontrado.");

  const map = headerMap(matrix[headerIndex]);
  const rows = [];
  let currentSub = "";

  matrix.slice(headerIndex + 1).forEach((row, index) => {
    const maybeSub = cleanOptional(getByAnyHeader(row, map, ["SUB", "SUBDIVISÃO", "SUBDIVISAO"]));
    if (maybeSub) currentSub = maybeSub;

    const descricao = cleanOptional(getByAnyHeader(row, map, ["DESCRIÇÃO OBRA", "DESCRICAO OBRA", "DESCRIÇÃO DA OBRA", "OBRA"]));
    if (!descricao || descricao.toLowerCase().includes("plano de drenagem")) return;

    const status = cleanOptional(getByAnyHeader(row, map, ["STATUS", "SITUAÇÃO", "SITUACAO"])) || "NÃO INFORMADO";
    rows.push({
      excelRow: headerIndex + index + 2,
      sub: currentSub,
      sb: cleanOptional(getByAnyHeader(row, map, ["SB", "SUBTRECHO"])),
      km: parseInteger(getByAnyHeader(row, map, ["KM", "KILOMETRO", "QUILÔMETRO", "QUILOMETRO"])),
      descricao,
      tipoObra: cleanOptional(getByAnyHeader(row, map, ["TIPO DE OBRA", "TIPO OBRA"])),
      risco: cleanOptional(getByAnyHeader(row, map, ["RISCO", "RISCO MATRIZ", "MATRIZ DE RISCO"])),
      motivo: cleanOptional(getByAnyHeader(row, map, ["MOTIVO", "JUSTIFICATIVA"])),
      equipamento: cleanOptional(getByAnyHeader(row, map, ["EQUIPAMENTO", "EQUIP_INFRA", "EQUIP INFRA"])),
      extEq: parseNullableNumber(getByAnyHeader(row, map, ["EXT EQ.", "EXT EQ", "EXTENSÃO EQ", "EXTENSAO EQ"])),
      extEqM: cleanOptional(getByAnyHeader(row, map, ["EXT EQ.(M)", "EXT EQ M", "EXTENSÃO EQ M", "EXTENSAO EQ M"])),
      prazoMes: parseNullableNumber(getByAnyHeader(row, map, ["PRAZO (MÊS)", "PRAZO MES", "PRAZO"])),
      dtInicio: cleanOptional(getByAnyHeader(row, map, ["DT INÍCIO", "DT INICIO", "DATA INÍCIO", "DATA INICIO"])),
      status,
      progresso: statusToProgress(status),
      obs: cleanOptional(getByAnyHeader(row, map, ["OBS.", "OBS", "OBSERVAÇÃO", "OBSERVACAO"])),
    });
  });

  return rows;
}

function cleanOptional(value) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : "";
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/m/gi, "")
    .replace("%", "");
  if (!text || text === "-") return 0;
  const normalized = text.includes(",") && !text.includes(".")
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function parseNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "" || String(value).trim() === "-") return null;
  return parseNumber(value);
}

function parseInteger(value) {
  const number = parseNullableNumber(value);
  return number === null ? null : Math.round(number);
}

function statusToProgress(status) {
  const normalized = normalizeHeader(status);
  if (normalized.includes("CONCLUI")) return 1;
  if (normalized.includes("ANDAMENTO")) return 0.5;
  return 0;
}

function calculateSubSummary(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const sub = String(row.sub || "").trim() || "Sem SUB";
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(row);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sub, items]) => {
      const planejadoM = sum(items, "ext");
      const realizadoM = sum(items, "extReal");
      const atividades = {};

      items.forEach((item) => {
        const key = item.atividade || "Sem ATV";
        atividades[key] = (atividades[key] || 0) + 1;
      });

      return {
        sub,
        planejadoM,
        realizadoM,
        saldoM: Math.max(planejadoM - realizadoM, 0),
        percentual: planejadoM ? realizadoM / planejadoM : 0,
        quantidadeFrentes: items.length,
        frentesConcluidas: items.filter((item) => item.ext > 0 && item.extReal >= item.ext).length,
        frentesAndamento: items.filter((item) => item.extReal > 0 && item.extReal < item.ext).length,
        frentesPendentes: items.filter((item) => !item.extReal).length,
        kmInicial: min(items.map((item) => item.kmi).filter(Number.isFinite)),
        kmFinal: max(items.map((item) => item.kmf).filter(Number.isFinite)),
        sbs: unique(items.map((item) => item.sb).filter(Boolean)),
        atividades,
      };
    });
}

function renderAll() {
  renderHeaderMeta();
  renderOverview();
  renderLimpeza();
  renderObras();
}

function renderHeaderMeta() {
  const lastUpdate = document.getElementById("lastUpdateLabel");
  if (lastUpdate) {
    lastUpdate.textContent = latestDateLabel([
      state.limpeza.generatedAt,
      state.obras.generatedAt,
    ]);
  }
}

function renderOverview() {
  const limpezaRows = state.limpeza.rows || [];
  const obraRows = state.obras.rows || [];
  const planejado = sum(limpezaRows, "ext");
  const realizado = sum(limpezaRows, "extReal");
  const pct = planejado ? realizado / planejado : 0;
  const obrasConcluidas = obraRows.filter((row) => statusToProgress(row.status) === 1).length;
  const obrasAndamento = obraRows.filter((row) => statusToProgress(row.status) > 0 && statusToProgress(row.status) < 1).length;

  document.getElementById("overviewKpis").innerHTML = [
    kpiCard("Limpeza planejada", formatMeters(planejado), `${limpezaRows.length} equipamentos cadastrados`),
    kpiCard("Limpeza executada", formatMeters(realizado), `${formatPercent(pct)} do planejado`),
    kpiCard("Saldo de limpeza", formatMeters(Math.max(planejado - realizado, 0)), "metros restantes"),
    kpiCard("Obras", String(obraRows.length), `${obrasAndamento} em andamento • ${obrasConcluidas} concluída(s)`),
  ].join("");

  const subListHtml = (state.limpeza.subSummary || [])
    .map((sub) => compactProgressRow(`SUB ${escapeHtml(sub.sub)}`, formatPercent(sub.percentual), sub.percentual))
    .join("");
  document.getElementById("overviewSubList").innerHTML = subListHtml ||
    `<div class="empty-state small">Importe uma planilha PDM para visualizar as SUBs.</div>`;

  const statusCounts = countBy(obraRows, (row) => row.status || "NÃO INFORMADO");
  const obrasListHtml = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => compactProgressRow(escapeHtml(status), `${count} obra(s)`, count / Math.max(obraRows.length, 1)))
    .join("");
  document.getElementById("overviewObrasList").innerHTML = obrasListHtml ||
    `<div class="empty-state small">Importe uma planilha PDM para visualizar as obras.</div>`;
}

function kpiCard(label, value, detail) {
  return `
    <article class="kpi-card">
      <span class="kpi-label">${escapeHtml(label)}</span>
      <strong class="kpi-value">${escapeHtml(value)}</strong>
      <span class="kpi-detail">${escapeHtml(detail)}</span>
    </article>
  `;
}

function compactProgressRow(label, value, pct) {
  return `
    <div class="compact-row">
      <strong>${label}</strong>
      <div class="progress" aria-label="${stripHtml(label)} ${stripHtml(value)}">
        <span style="width: ${clampPercent(pct)}%"></span>
      </div>
      <strong>${value}</strong>
    </div>
  `;
}

function renderLimpeza() {
  const selectedSub = document.getElementById("limpezaSubFilter").value;
  const search = normalizeHeader(document.getElementById("limpezaSearch").value);

  let summaries = state.limpeza.subSummary || [];
  if (selectedSub) summaries = summaries.filter((item) => String(item.sub) === selectedSub);

  if (search) {
    summaries = summaries.filter((summary) => {
      const rows = limpezaRowsForSub(summary.sub);
      const haystack = normalizeHeader([
        summary.sub,
        rows.map((row) => `${row.equipInfra} ${row.atividade} ${row.sb}`).join(" "),
      ].join(" "));
      return haystack.includes(search);
    });
  }

  const container = document.getElementById("limpezaCards");
  if (!summaries.length) {
    container.innerHTML = `<div class="empty-state">Nenhuma SUB carregada. Importe uma planilha PDM local para preencher este dashboard.</div>`;
    return;
  }

  container.innerHTML = summaries.map((summary) => {
    const rows = limpezaRowsForSub(summary.sub);
    const activityBadges = Object.entries(summary.atividades || {})
      .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
      .map(([name, count]) => `<span class="badge">${escapeHtml(String(name).toLowerCase())}: ${count}</span>`)
      .join("");

    const detailCards = rows.map((row) => `
      <div class="detail-row">
        <div class="detail-row-head">
          <strong>${escapeHtml(row.equipInfra || "—")}</strong>
          <span>${formatPercent(row.percentualReal)}</span>
        </div>
        <div class="detail-grid">
          <div><span>ATV</span><strong>${escapeHtml(row.atividade || "—")}</strong></div>
          <div><span>KM</span><strong>${formatKmRange(row.kmi, row.kmf)}</strong></div>
          <div><span>EXT</span><strong>${formatMeters(row.ext)}</strong></div>
          <div><span>EXT real</span><strong>${formatMeters(row.extReal)}</strong></div>
        </div>
      </div>
    `).join("");

    return `
      <article class="sub-card">
        <div class="sub-top">
          <div>
            <span class="eyebrow">Limpeza Geral</span>
            <div class="sub-title">SUB ${escapeHtml(summary.sub)}</div>
          </div>
          <div class="sub-percent">${formatPercent(summary.percentual)}</div>
        </div>

        <div class="progress">
          <span style="width: ${clampPercent(summary.percentual)}%"></span>
        </div>

        <div class="metric-row">
          <div class="metric-pill"><span>Planejado</span><strong>${formatMeters(summary.planejadoM)}</strong></div>
          <div class="metric-pill"><span>Executado</span><strong>${formatMeters(summary.realizadoM)}</strong></div>
          <div class="metric-pill"><span>Saldo</span><strong>${formatMeters(summary.saldoM)}</strong></div>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><span>Faixa KM</span><strong>${formatKmRange(summary.kmInicial, summary.kmFinal)}</strong></div>
          <div class="meta-item"><span>Equipamentos</span><strong>${summary.quantidadeFrentes}</strong></div>
          <div class="meta-item"><span>Concluídas</span><strong>${summary.frentesConcluidas}</strong></div>
          <div class="meta-item"><span>Em andamento</span><strong>${summary.frentesAndamento}</strong></div>
          <div class="meta-item"><span>Pendentes</span><strong>${summary.frentesPendentes}</strong></div>
        </div>

        <div class="tag-row activity-summary">${activityBadges || `<span class="badge">Sem ATV informado</span>`}</div>

        <details>
          <summary>Ver equipamentos da SUB ${escapeHtml(summary.sub)}</summary>
          <div class="detail-list">${detailCards}</div>
        </details>
      </article>
    `;
  }).join("");
}

function renderObras() {
  const selectedSub = document.getElementById("obrasSubFilter").value;
  const selectedStatus = document.getElementById("obrasStatusFilter").value;
  const selectedRisco = document.getElementById("obrasRiscoFilter").value;
  const search = normalizeHeader(document.getElementById("obrasSearch").value);

  let rows = state.obras.rows || [];
  if (selectedSub) rows = rows.filter((row) => String(row.sub) === selectedSub);
  if (selectedStatus) rows = rows.filter((row) => String(row.status) === selectedStatus);
  if (selectedRisco) rows = rows.filter((row) => String(row.risco) === selectedRisco);

  if (search) {
    rows = rows.filter((row) => normalizeHeader([
      row.sub,
      row.sb,
      row.km,
      row.descricao,
      row.tipoObra,
      row.risco,
      row.motivo,
      row.equipamento,
      row.status,
      row.obs,
    ].join(" ")).includes(search));
  }

  const container = document.getElementById("obrasCards");
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">Nenhuma obra carregada. Importe uma planilha PDM local para preencher este dashboard.</div>`;
    return;
  }

  container.innerHTML = rows.map((row) => {
    const progress = row.progresso ?? statusToProgress(row.status);
    return `
      <article class="obra-card">
        <div class="obra-top">
          <div>
            <span class="eyebrow">SUB ${escapeHtml(row.sub || "—")} - KM ${formatKm(row.km)}</span>
            <div class="obra-title">${escapeHtml(row.descricao)}</div>
          </div>
        </div>

        <div class="badge-row">
          <span class="status-badge ${statusClass(row.status)}">${escapeHtml(row.status || "NÃO INFORMADO")}</span>
          <span class="risk-badge ${riskClass(row.risco)}">Risco Matriz: ${escapeHtml(row.risco || "—")}</span>
        </div>

        <div class="progress" style="margin-top: 14px;">
          <span style="width: ${clampPercent(progress)}%"></span>
        </div>

        <div class="meta-grid">
          <div class="meta-item"><span>SB</span><strong>${escapeHtml(row.sb || "—")}</strong></div>
          <div class="meta-item"><span>KM</span><strong>${formatKm(row.km)}</strong></div>
          <div class="meta-item"><span>Tipo</span><strong>${escapeHtml(row.tipoObra || "—")}</strong></div>
          <div class="meta-item"><span>Equipamento</span><strong>${escapeHtml(row.equipamento || "—")}</strong></div>
          <div class="meta-item"><span>Extensão</span><strong>${escapeHtml(row.extEqM || formatMeters(row.extEq || 0))}</strong></div>
        </div>

        <p><strong>Motivo:</strong> ${escapeHtml(row.motivo || "—")}</p>
        ${row.obs ? `<p><strong>Observação:</strong> ${escapeHtml(row.obs)}</p>` : ""}
      </article>
    `;
  }).join("");
}

function fillFilterOptions() {
  fillSelect("limpezaSubFilter", unique((state.limpeza.subSummary || []).map((row) => String(row.sub))).sort(sortNumericText), "Todas");
  fillSelect("obrasSubFilter", unique((state.obras.rows || []).map((row) => String(row.sub || "")).filter(Boolean)).sort(sortNumericText), "Todas");
  fillSelect("obrasStatusFilter", unique((state.obras.rows || []).map((row) => row.status || "NÃO INFORMADO")).sort(), "Todos");
  fillSelect("obrasRiscoFilter", unique((state.obras.rows || []).map((row) => row.risco || "Não informado")).sort(), "Todos");
}

function fillSelect(id, options, firstLabel) {
  const select = document.getElementById(id);
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>` +
    options.map((option) => `<option value="${escapeAttribute(option)}">${escapeHtml(option)}</option>`).join("");
  if (options.includes(current)) select.value = current;
}

function limpezaRowsForSub(sub) {
  return (state.limpeza.rows || []).filter((row) => String(row.sub) === String(sub));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

function min(values) {
  return values.length ? Math.min(...values) : null;
}

function max(values) {
  return values.length ? Math.max(...values) : null;
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "")));
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sortNumericText(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b), "pt-BR");
}

function formatMeters(value) {
  const number = Number(value) || 0;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(number)} m`;
}

function formatPercent(value) {
  const number = Number(value) || 0;
  const normalized = number > 1 ? number / 100 : number;
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(normalized * 100)}%`;
}

function clampPercent(value) {
  const number = Number(value) || 0;
  const normalized = number > 1 ? number / 100 : number;
  return Math.max(0, Math.min(100, normalized * 100));
}

function formatKm(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const km = Math.floor(number / 1000);
  const meters = Math.round(number % 1000).toString().padStart(3, "0");
  return `${km}+${meters}`;
}

function formatKmRange(start, end) {
  if (!Number.isFinite(Number(start)) && !Number.isFinite(Number(end))) return "—";
  return `${formatKm(start)} a ${formatKm(end)}`;
}

function latestDateLabel(values) {
  const dates = values
    .map((value) => value ? new Date(value) : null)
    .filter((date) => date && !Number.isNaN(date.getTime()));

  if (!dates.length) return "—";
  const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
  return latest.toLocaleDateString("pt-BR");
}

function statusClass(status) {
  const normalized = normalizeHeader(status);
  if (normalized.includes("CONCLUI")) return "status-concluido";
  if (normalized.includes("ANDAMENTO")) return "status-andamento";
  return "status-nao-iniciado";
}

function riskClass(risk) {
  const normalized = normalizeHeader(risk);
  if (normalized.includes("ALTO")) return "risk-alto";
  if (normalized.includes("MODERADO")) return "risk-moderado";
  return "";
}

function showStatus(message) {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.classList.add("show");
}

function hideStatus() {
  const el = document.getElementById("statusMessage");
  el.textContent = "";
  el.classList.remove("show");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]+>/g, "");
}
