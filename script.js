const APP_VERSION = "2026.06.07-supabase-login-ajustado";

const SUPABASE_CONFIG = {
  // A URL recebida foi a REST API. O supabase-js usa a URL base do projeto.
  url: "https://nvfewxgtjenyawxyroqk.supabase.co",
  restUrl: "https://nvfewxgtjenyawxyroqk.supabase.co/rest/v1/",
  // Chave anon/public configurada para uso no frontend.
  // Esta chave é pública por natureza; a segurança fica nas políticas RLS do arquivo supabase/schema-and-seed.sql.
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmV3eGd0amVueWF3eHlyb3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4MDgyMDIsImV4cCI6MjA5NjM4NDIwMn0.w5vSwqUWrw5I-0qdOE24JOGyU_-k23GWX4M9kAPWTDE",
};

const STORAGE_KEYS = {
  theme: "trecho2-pdm-theme",
};

const TABLES = {
  limpeza: "limpeza",
  obras: "obras",
  profiles: "profiles",
  audit: "audit_logs",
};

const ROLE_LABELS = {
  coordenacao: "Coordenação",
  analista: "Analista",
  fiscalizacao: "Fiscalização",
};

const state = {
  supabase: null,
  session: null,
  user: null,
  profile: null,
  limpeza: { rows: [], subSummary: [], generatedAt: null, sourceSheet: "Supabase" },
  obras: { rows: [], generatedAt: null, sourceSheet: "Supabase" },
  auditLogs: [],
  profiles: [],
  sourceLabel: "Supabase",
  loadErrors: [],
  isConfigured: false,
};

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  bindNavigation();
  bindFilters();
  bindAuthActions();
  bindManagementActions();
  bindDelegatedActions();
  initSupabaseApp();
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
    button.addEventListener("click", () => activatePanel(button.dataset.panel));
  });
}

function activatePanel(panel) {
  const targetTab = document.querySelector(`.tab[data-panel="${panel}"]`);
  if (!targetTab || targetTab.hidden) return;

  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === targetTab));
  document.querySelectorAll(".panel").forEach((section) => {
    section.classList.toggle("active", section.id === `panel-${panel}`);
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

function bindAuthActions() {
  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await signIn();
  });

  document.getElementById("signUpBtn").addEventListener("click", signUp);
  document.getElementById("signOutBtn").addEventListener("click", signOut);
}

function bindManagementActions() {
  document.getElementById("limpezaForm").addEventListener("submit", saveLimpeza);
  document.getElementById("obraForm").addEventListener("submit", saveObra);
  document.getElementById("cancelLimpezaEditBtn").addEventListener("click", resetLimpezaForm);
  document.getElementById("cancelObraEditBtn").addEventListener("click", resetObraForm);
  document.getElementById("refreshAuditBtn").addEventListener("click", loadAuditLogs);
  document.getElementById("refreshProfilesBtn").addEventListener("click", loadProfiles);
}

function bindDelegatedActions() {
  document.body.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    if (action === "edit-limpeza") return editLimpeza(id);
    if (action === "delete-limpeza") return deleteLimpeza(id);
    if (action === "edit-obra") return editObra(id);
    if (action === "delete-obra") return deleteObra(id);
  });

  document.body.addEventListener("change", async (event) => {
    const select = event.target.closest('select[data-action="change-role"]');
    if (!select) return;
    await updateUserRole(select.dataset.userId, select.value);
  });
}

async function initSupabaseApp() {
  state.isConfigured = isSupabaseConfigured();

  if (!state.isConfigured) {
    setDatabaseStatus("Supabase ainda não configurado: cole a anon/public key em script.js antes de publicar.");
    showStatus("Banco Supabase preparado no código, mas falta preencher a anon/public key no arquivo script.js.");
    resetToEmptyData();
    applyPermissions();
    return;
  }

  if (!window.supabase?.createClient) {
    setDatabaseStatus("Não foi possível carregar o SDK do Supabase. Verifique a conexão com a internet ou o bloqueio do CDN.");
    showStatus("SDK do Supabase não carregou. O site precisa do supabase-js para autenticar e consultar o banco.");
    resetToEmptyData();
    applyPermissions();
    return;
  }

  state.supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  setDatabaseStatus(`Conectando ao Supabase em ${SUPABASE_CONFIG.restUrl}`);

  const { data, error } = await state.supabase.auth.getSession();
  if (error) showStatus(`Erro ao recuperar sessão: ${error.message}`);

  state.session = data?.session || null;
  state.user = state.session?.user || null;

  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    await refreshAfterAuthChange();
  });

  await refreshAfterAuthChange();
}

function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_CONFIG.url &&
    SUPABASE_CONFIG.anonKey &&
    !SUPABASE_CONFIG.anonKey.includes("COLE_AQUI") &&
    SUPABASE_CONFIG.anonKey.length > 40
  );
}

async function refreshAfterAuthChange() {
  updateAuthUi();

  if (!state.user) {
    state.profile = null;
    setDatabaseStatus("Entre com e-mail e senha para carregar os dados do Supabase.");
    resetToEmptyData();
    applyPermissions();
    return;
  }

  await loadProfile();
  applyPermissions();
  await loadRemoteData();
}

async function signIn() {
  if (!requireSupabaseReady()) return;

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || !password) return showStatus("Informe e-mail e senha.");

  showStatus("Entrando no Supabase...");
  const { error } = await state.supabase.auth.signInWithPassword({ email, password });
  if (error) return showStatus(formatAuthError(error, "signin"));
  showStatus("Login realizado com sucesso.");
  setTimeout(hideStatus, 2500);
}

async function signUp() {
  if (!requireSupabaseReady()) return;

  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || !password) return showStatus("Informe e-mail e senha para criar o acesso.");
  if (password.length < 6) return showStatus("A senha precisa ter pelo menos 6 caracteres.");

  showStatus("Criando primeiro acesso no Supabase...");
  const { data, error } = await state.supabase.auth.signUp({
    email,
    password,
    options: { data: { nome: email } },
  });

  if (error) return showStatus(formatAuthError(error, "signup"));

  if (data?.session) {
    showStatus("Acesso criado e login realizado. Agora rode o SQL de promoção para tornar seu usuário Coordenação.");
    return;
  }

  showStatus("Acesso criado. O Supabase exigiu confirmação por e-mail: abra o e-mail recebido, confirme o cadastro e depois clique em Entrar.");
}

function formatAuthError(error, context) {
  const message = error?.message || "erro desconhecido";
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Não foi possível entrar: e-mail ou senha inválidos. No primeiro acesso, clique em Criar acesso antes de Entrar; se já criou, confirme o e-mail ou revise a senha.";
  }

  if (normalized.includes("email not confirmed") || normalized.includes("confirm")) {
    return "O e-mail ainda não foi confirmado. Abra a mensagem enviada pelo Supabase, confirme o cadastro e tente Entrar novamente.";
  }

  if (normalized.includes("user already registered") || normalized.includes("already registered") || normalized.includes("already exists")) {
    return "Esse e-mail já tem acesso criado. Use o botão Entrar; se não lembrar a senha, redefina pelo painel do Supabase Auth.";
  }

  if (normalized.includes("signup") && normalized.includes("disabled")) {
    return "O cadastro público está desativado no Supabase. Ative o cadastro por e-mail em Authentication ou crie o usuário manualmente no painel do Supabase.";
  }

  if (normalized.includes("password") && normalized.includes("characters")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  return `${context === "signup" ? "Não foi possível criar acesso" : "Não foi possível entrar"}: ${message}`;
}

async function signOut() {
  if (!requireSupabaseReady()) return;
  await state.supabase.auth.signOut();
  showStatus("Sessão encerrada.");
  setTimeout(hideStatus, 2500);
}

function requireSupabaseReady() {
  if (!state.isConfigured || !state.supabase) {
    showStatus("Configure a anon/public key do Supabase em script.js para usar login e banco de dados.");
    return false;
  }
  return true;
}

async function loadProfile() {
  if (!state.user) return;

  const { data, error } = await state.supabase
    .from(TABLES.profiles)
    .select("user_id,nome,email,role,created_at,updated_at")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    setDatabaseStatus(`Erro ao carregar perfil: ${error.message}. Rode supabase/schema-and-seed.sql no SQL Editor.`);
    showStatus(`Erro ao carregar perfil: ${error.message}`);
    state.profile = null;
    return;
  }

  if (data) {
    state.profile = data;
    updateAuthUi();
    return;
  }

  // Fallback caso o gatilho de criação de perfil ainda não tenha rodado.
  const { data: inserted, error: insertError } = await state.supabase
    .from(TABLES.profiles)
    .insert({ user_id: state.user.id, nome: state.user.email, email: state.user.email, role: "fiscalizacao" })
    .select("user_id,nome,email,role,created_at,updated_at")
    .single();

  if (insertError) {
    setDatabaseStatus(`Usuário autenticado, mas sem perfil: ${insertError.message}`);
    showStatus(`Sem perfil de acesso: ${insertError.message}`);
    state.profile = null;
    return;
  }

  state.profile = inserted;
  updateAuthUi();
}

async function loadRemoteData() {
  if (!state.user || !state.supabase) return;
  showStatus("Carregando dados do Supabase...");

  const [limpezaResult, obrasResult] = await Promise.all([
    state.supabase.from(TABLES.limpeza).select("*").order("sub", { ascending: true }).order("kmi", { ascending: true }),
    state.supabase.from(TABLES.obras).select("*").order("sub", { ascending: true }).order("km", { ascending: true }),
  ]);

  if (limpezaResult.error || obrasResult.error) {
    const message = limpezaResult.error?.message || obrasResult.error?.message || "Erro desconhecido";
    setDatabaseStatus(`Erro ao consultar Supabase: ${message}`);
    showStatus(`Erro ao consultar Supabase: ${message}`);
    resetToEmptyData({ keepStatus: true });
    return;
  }

  const generatedAt = new Date().toISOString();
  const limpezaRows = (limpezaResult.data || []).map(mapLimpezaFromDb);
  const obrasRows = (obrasResult.data || []).map(mapObraFromDb);

  state.limpeza = {
    title: "ZBV-ZAR PDM Limpeza",
    sourceSheet: "public.limpeza",
    sourceFile: "Supabase",
    generatedAt,
    rows: limpezaRows,
    subSummary: calculateSubSummary(limpezaRows),
  };

  state.obras = {
    title: "ZBV-ZAR Obras",
    sourceSheet: "public.obras",
    sourceFile: "Supabase",
    generatedAt,
    rows: obrasRows,
  };

  state.sourceLabel = "Supabase";
  fillFilterOptions();
  renderAll();
  renderManagementTables();
  setDatabaseStatus(`Conectado. ${limpezaRows.length} registros de limpeza e ${obrasRows.length} obras carregados do Supabase.`);
  hideStatus();

  if (isCoordenacao()) await Promise.all([loadAuditLogs({ silent: true }), loadProfiles({ silent: true })]);
}

function resetToEmptyData(options = {}) {
  state.loadErrors = [];
  state.limpeza = {
    title: "ZBV-ZAR PDM Limpeza",
    sourceSheet: "Supabase",
    sourceFile: "",
    generatedAt: null,
    rows: [],
    subSummary: [],
  };
  state.obras = {
    title: "ZBV-ZAR Obras",
    sourceSheet: "Supabase",
    sourceFile: "",
    generatedAt: null,
    rows: [],
  };
  state.auditLogs = [];
  state.profiles = [];
  state.sourceLabel = "Supabase";
  fillFilterOptions();
  renderAll();
  renderManagementTables();
  renderAuditLogs();
  renderProfilesTable();
  if (!options.keepStatus) hideStatus();
}

function updateAuthUi() {
  const authPanel = document.getElementById("authPanel");
  const roleLabel = document.getElementById("userRoleLabel");
  const signOutBtn = document.getElementById("signOutBtn");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");

  const signedIn = Boolean(state.user);
  authPanel.classList.toggle("signed-in", signedIn);
  signOutBtn.classList.toggle("hidden", !signedIn);

  if (signedIn) {
    emailInput.value = state.user.email || "";
    passwordInput.value = "";
  }

  const role = state.profile?.role;
  roleLabel.textContent = signedIn ? (ROLE_LABELS[role] || "Sem perfil") : "—";
}

function applyPermissions() {
  const write = canWrite();
  const coord = isCoordenacao();

  document.querySelectorAll("[data-requires-write]").forEach((el) => { el.hidden = !write; });
  document.querySelectorAll("[data-requires-coordenacao]").forEach((el) => { el.hidden = !coord; });

  document.querySelectorAll("#panel-gestao input, #panel-gestao select, #panel-gestao button").forEach((el) => {
    el.disabled = !write;
  });

  const activeTab = document.querySelector(".tab.active");
  if (activeTab?.hidden) activatePanel("overview");

  renderAll();
  renderManagementTables();
  renderAuditLogs();
  renderProfilesTable();
}

function canWrite() {
  return ["coordenacao", "analista"].includes(state.profile?.role);
}

function isCoordenacao() {
  return state.profile?.role === "coordenacao";
}

function mapLimpezaFromDb(row) {
  const ext = Number(row.ext) || 0;
  const extReal = Number(row.ext_real) || 0;
  return {
    id: row.id,
    excelRow: row.excel_row,
    equipInfra: row.equip_infra,
    atividade: row.atividade || "",
    kmi: nullableInteger(row.kmi),
    kmf: nullableInteger(row.kmf),
    kmiReal: nullableInteger(row.kmi_real),
    kmfReal: nullableInteger(row.kmf_real),
    ext,
    extM: row.ext_m || `${Math.round(ext)}m`,
    extReal,
    extRealM: row.ext_real_m || `${Math.round(extReal)}m`,
    percentualReal: row.percentual_real === null || row.percentual_real === undefined ? (ext ? extReal / ext : 0) : Number(row.percentual_real),
    sb: row.sb || "",
    sub: row.sub || "",
    percentualSub: Number(row.percentual_sub) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapObraFromDb(row) {
  return {
    id: row.id,
    seedKey: row.seed_key,
    excelRow: row.excel_row,
    sub: row.sub || "",
    sb: row.sb || "",
    km: nullableInteger(row.km),
    descricao: row.descricao || "",
    tipoObra: row.tipo_obra || "",
    risco: row.risco || "",
    motivo: row.motivo || "",
    equipamento: row.equipamento || "",
    extEq: nullableNumber(row.ext_eq),
    extEqM: row.ext_eq_m || "",
    prazoMes: nullableNumber(row.prazo_mes),
    dtInicio: row.dt_inicio || "",
    status: row.status || "NÃO INFORMADO",
    progresso: row.progresso === null || row.progresso === undefined ? statusToProgress(row.status) : Number(row.progresso),
    obs: row.obs || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    `<div class="empty-state small">Entre no Supabase para visualizar as SUBs.</div>`;

  const statusCounts = countBy(obraRows, (row) => row.status || "NÃO INFORMADO");
  const obrasListHtml = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => compactProgressRow(escapeHtml(status), `${count} obra(s)`, count / Math.max(obraRows.length, 1)))
    .join("");
  document.getElementById("overviewObrasList").innerHTML = obrasListHtml ||
    `<div class="empty-state small">Entre no Supabase para visualizar as obras.</div>`;
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
    container.innerHTML = `<div class="empty-state">Nenhuma SUB carregada. Entre no Supabase e confira se a carga inicial foi executada.</div>`;
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
        ${recordActions("limpeza", row.id)}
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
  if (selectedRisco) rows = rows.filter((row) => String(row.risco || "Não informado") === selectedRisco);

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
    container.innerHTML = `<div class="empty-state">Nenhuma obra carregada. Entre no Supabase e confira se a carga inicial foi executada.</div>`;
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
        ${recordActions("obra", row.id)}
      </article>
    `;
  }).join("");
}

function recordActions(kind, id) {
  if (!canWrite() || !id) return "";
  const editAction = kind === "limpeza" ? "edit-limpeza" : "edit-obra";
  const deleteAction = kind === "limpeza" ? "delete-limpeza" : "delete-obra";
  return `
    <div class="record-actions">
      <button class="ghost-btn tiny-btn" type="button" data-action="${editAction}" data-id="${escapeAttribute(id)}">Editar</button>
      <button class="ghost-btn tiny-btn danger-btn" type="button" data-action="${deleteAction}" data-id="${escapeAttribute(id)}">Excluir</button>
    </div>
  `;
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

async function saveLimpeza(event) {
  event.preventDefault();
  if (!canWrite()) return showStatus("Seu perfil não permite alterar dados.");

  const id = document.getElementById("limpezaId").value;
  const ext = getNumberInput("limpezaExt") || 0;
  const extReal = getNumberInput("limpezaExtReal") || 0;
  const payload = {
    equip_infra: getValue("limpezaEquipInfra"),
    atividade: getValue("limpezaAtividade"),
    sub: getValue("limpezaSub"),
    sb: getValue("limpezaSb"),
    kmi: getIntegerInput("limpezaKmi"),
    kmf: getIntegerInput("limpezaKmf"),
    kmi_real: getIntegerInput("limpezaKmiReal"),
    kmf_real: getIntegerInput("limpezaKmfReal"),
    ext,
    ext_m: `${Math.round(ext)}m`,
    ext_real: extReal,
    ext_real_m: `${Math.round(extReal)}m`,
    percentual_real: ext ? extReal / ext : 0,
    percentual_sub: 0,
  };

  if (!payload.equip_infra) return showStatus("Informe o equipamento infra.");

  const result = id
    ? await state.supabase.from(TABLES.limpeza).update(payload).eq("id", id)
    : await state.supabase.from(TABLES.limpeza).insert(payload);

  if (result.error) return showStatus(`Erro ao salvar limpeza: ${result.error.message}`);
  resetLimpezaForm();
  await loadRemoteData();
  showStatus("Registro de limpeza salvo no Supabase.");
  setTimeout(hideStatus, 2500);
}

async function saveObra(event) {
  event.preventDefault();
  if (!canWrite()) return showStatus("Seu perfil não permite alterar dados.");

  const id = document.getElementById("obraId").value;
  const extEq = getNumberInput("obraExtEq");
  const status = getValue("obraStatus") || "NÃO INFORMADO";
  const payload = {
    sub: getValue("obraSub"),
    sb: getValue("obraSb"),
    km: getIntegerInput("obraKm"),
    descricao: getValue("obraDescricao"),
    tipo_obra: getValue("obraTipo"),
    risco: getValue("obraRisco"),
    motivo: getValue("obraMotivo"),
    equipamento: getValue("obraEquipamento"),
    ext_eq: extEq,
    ext_eq_m: extEq === null ? "" : `${Math.round(extEq)}m`,
    prazo_mes: getNumberInput("obraPrazoMes"),
    dt_inicio: getValue("obraDtInicio") || null,
    status,
    progresso: statusToProgress(status),
    obs: getValue("obraObs"),
  };

  if (!payload.descricao) return showStatus("Informe a descrição da obra.");

  const result = id
    ? await state.supabase.from(TABLES.obras).update(payload).eq("id", id)
    : await state.supabase.from(TABLES.obras).insert(payload);

  if (result.error) return showStatus(`Erro ao salvar obra: ${result.error.message}`);
  resetObraForm();
  await loadRemoteData();
  showStatus("Obra salva no Supabase.");
  setTimeout(hideStatus, 2500);
}

function editLimpeza(id) {
  const row = state.limpeza.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  activatePanel("gestao");
  document.getElementById("limpezaFormTitle").textContent = "Editar registro";
  setValue("limpezaId", row.id);
  setValue("limpezaEquipInfra", row.equipInfra);
  setValue("limpezaAtividade", row.atividade);
  setValue("limpezaSub", row.sub);
  setValue("limpezaSb", row.sb);
  setValue("limpezaKmi", row.kmi);
  setValue("limpezaKmf", row.kmf);
  setValue("limpezaKmiReal", row.kmiReal);
  setValue("limpezaKmfReal", row.kmfReal);
  setValue("limpezaExt", row.ext);
  setValue("limpezaExtReal", row.extReal);
  document.getElementById("limpezaEquipInfra").focus();
}

function editObra(id) {
  const row = state.obras.rows.find((item) => String(item.id) === String(id));
  if (!row) return;
  activatePanel("gestao");
  document.getElementById("obraFormTitle").textContent = "Editar obra";
  setValue("obraId", row.id);
  setValue("obraSub", row.sub);
  setValue("obraSb", row.sb);
  setValue("obraKm", row.km);
  setValue("obraDescricao", row.descricao);
  setValue("obraTipo", row.tipoObra);
  setValue("obraRisco", row.risco);
  setValue("obraMotivo", row.motivo);
  setValue("obraEquipamento", row.equipamento);
  setValue("obraExtEq", row.extEq);
  setValue("obraPrazoMes", row.prazoMes);
  setValue("obraDtInicio", row.dtInicio);
  setValue("obraStatus", row.status || "NÃO INICIADO");
  setValue("obraObs", row.obs);
  document.getElementById("obraDescricao").focus();
}

async function deleteLimpeza(id) {
  if (!canWrite()) return showStatus("Seu perfil não permite excluir dados.");
  const row = state.limpeza.rows.find((item) => String(item.id) === String(id));
  if (!confirm(`Excluir o registro de limpeza ${row?.equipInfra || "selecionado"}?`)) return;
  const { error } = await state.supabase.from(TABLES.limpeza).delete().eq("id", id);
  if (error) return showStatus(`Erro ao excluir limpeza: ${error.message}`);
  await loadRemoteData();
  showStatus("Registro de limpeza excluído.");
  setTimeout(hideStatus, 2500);
}

async function deleteObra(id) {
  if (!canWrite()) return showStatus("Seu perfil não permite excluir dados.");
  const row = state.obras.rows.find((item) => String(item.id) === String(id));
  if (!confirm(`Excluir a obra ${row?.descricao || "selecionada"}?`)) return;
  const { error } = await state.supabase.from(TABLES.obras).delete().eq("id", id);
  if (error) return showStatus(`Erro ao excluir obra: ${error.message}`);
  await loadRemoteData();
  showStatus("Obra excluída.");
  setTimeout(hideStatus, 2500);
}

function resetLimpezaForm() {
  document.getElementById("limpezaFormTitle").textContent = "Novo registro";
  document.getElementById("limpezaForm").reset();
  document.getElementById("limpezaId").value = "";
}

function resetObraForm() {
  document.getElementById("obraFormTitle").textContent = "Nova obra";
  document.getElementById("obraForm").reset();
  document.getElementById("obraId").value = "";
  document.getElementById("obraStatus").value = "NÃO INICIADO";
}

function renderManagementTables() {
  renderLimpezaManagementTable();
  renderObrasManagementTable();
}

function renderLimpezaManagementTable() {
  const table = document.getElementById("limpezaManageTable");
  if (!table) return;
  const rows = state.limpeza.rows || [];
  table.innerHTML = `
    <thead><tr><th>Equipamento</th><th>SUB</th><th>ATV</th><th>Planejado</th><th>Realizado</th><th>Ações</th></tr></thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.equipInfra)}</td>
          <td>${escapeHtml(row.sub || "—")}</td>
          <td>${escapeHtml(row.atividade || "—")}</td>
          <td>${formatMeters(row.ext)}</td>
          <td>${formatMeters(row.extReal)}</td>
          <td>${recordActions("limpeza", row.id)}</td>
        </tr>
      `).join("") || `<tr><td colspan="6">Nenhum registro carregado.</td></tr>`}
    </tbody>`;
}

function renderObrasManagementTable() {
  const table = document.getElementById("obrasManageTable");
  if (!table) return;
  const rows = state.obras.rows || [];
  table.innerHTML = `
    <thead><tr><th>Descrição</th><th>SUB</th><th>KM</th><th>Status</th><th>Risco</th><th>Ações</th></tr></thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.descricao)}</td>
          <td>${escapeHtml(row.sub || "—")}</td>
          <td>${formatKm(row.km)}</td>
          <td>${escapeHtml(row.status || "—")}</td>
          <td>${escapeHtml(row.risco || "—")}</td>
          <td>${recordActions("obra", row.id)}</td>
        </tr>
      `).join("") || `<tr><td colspan="6">Nenhuma obra carregada.</td></tr>`}
    </tbody>`;
}

async function loadAuditLogs(options = {}) {
  if (!isCoordenacao() || !state.supabase) return;
  if (!options.silent) showStatus("Carregando auditoria...");

  const { data, error } = await state.supabase
    .from(TABLES.audit)
    .select("id,table_name,record_id,action,user_id,user_email,old_data,new_data,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    showStatus(`Erro ao carregar auditoria: ${error.message}`);
    return;
  }

  state.auditLogs = data || [];
  renderAuditLogs();
  if (!options.silent) {
    showStatus("Auditoria atualizada.");
    setTimeout(hideStatus, 2500);
  }
}

async function loadProfiles(options = {}) {
  if (!isCoordenacao() || !state.supabase) return;
  if (!options.silent) showStatus("Carregando usuários...");

  const { data, error } = await state.supabase
    .from(TABLES.profiles)
    .select("user_id,nome,email,role,created_at,updated_at")
    .order("email", { ascending: true });

  if (error) {
    showStatus(`Erro ao carregar usuários: ${error.message}`);
    return;
  }

  state.profiles = data || [];
  renderProfilesTable();
  if (!options.silent) {
    showStatus("Usuários atualizados.");
    setTimeout(hideStatus, 2500);
  }
}

async function updateUserRole(userId, role) {
  if (!isCoordenacao()) return showStatus("Somente Coordenação pode alterar perfis.");
  if (!userId || !ROLE_LABELS[role]) return showStatus("Perfil inválido.");

  const { error } = await state.supabase
    .from(TABLES.profiles)
    .update({ role })
    .eq("user_id", userId);

  if (error) {
    showStatus(`Erro ao alterar perfil: ${error.message}`);
    await loadProfiles({ silent: true });
    return;
  }

  if (state.user?.id === userId) {
    await loadProfile();
    applyPermissions();
  }

  await loadProfiles({ silent: true });
  showStatus("Perfil de usuário atualizado.");
  setTimeout(hideStatus, 2500);
}

function renderProfilesTable() {
  const table = document.getElementById("profilesTable");
  if (!table) return;

  if (!isCoordenacao()) {
    table.innerHTML = `<tbody><tr><td>A gestão de perfis é exclusiva do perfil Coordenação.</td></tr></tbody>`;
    return;
  }

  const rows = state.profiles || [];
  table.innerHTML = `
    <thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Atualizado</th></tr></thead>
    <tbody>
      ${rows.map((profile) => `
        <tr>
          <td>${escapeHtml(profile.email || "—")}</td>
          <td>${escapeHtml(profile.nome || "—")}</td>
          <td>
            <select data-action="change-role" data-user-id="${escapeAttribute(profile.user_id)}">
              ${Object.entries(ROLE_LABELS).map(([value, label]) => `<option value="${value}" ${profile.role === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </td>
          <td>${formatDateTime(profile.updated_at || profile.created_at)}</td>
        </tr>
      `).join("") || `<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>`}
    </tbody>`;
}

function renderAuditLogs() {
  const table = document.getElementById("auditTable");
  if (!table) return;

  if (!isCoordenacao()) {
    table.innerHTML = `<tbody><tr><td>A auditoria é exclusiva do perfil Coordenação.</td></tr></tbody>`;
    return;
  }

  const rows = state.auditLogs || [];
  table.innerHTML = `
    <thead><tr><th>Data/hora</th><th>Usuário</th><th>Tabela</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead>
    <tbody>
      ${rows.map((log) => `
        <tr>
          <td>${formatDateTime(log.created_at)}</td>
          <td>${escapeHtml(log.user_email || log.user_id || "—")}</td>
          <td>${escapeHtml(log.table_name)}</td>
          <td>${escapeHtml(actionLabel(log.action))}</td>
          <td><code>${escapeHtml(shortId(log.record_id))}</code></td>
          <td>${escapeHtml(auditDetails(log))}</td>
        </tr>
      `).join("") || `<tr><td colspan="6">Nenhuma alteração registrada ainda.</td></tr>`}
    </tbody>`;
}

function auditDetails(log) {
  const newData = log.new_data || {};
  const oldData = log.old_data || {};
  if (log.action === "INSERT") return summarizeRecord(newData, "Criado");
  if (log.action === "DELETE") return summarizeRecord(oldData, "Excluído");
  const ignored = new Set(["updated_at", "created_at"]);
  const keys = Object.keys({ ...oldData, ...newData }).filter((key) => !ignored.has(key));
  const changed = keys.filter((key) => String(oldData[key] ?? "") !== String(newData[key] ?? ""));
  return changed.length ? `Campos alterados: ${changed.slice(0, 8).join(", ")}` : "Atualização sem diferença visível";
}

function summarizeRecord(data, prefix) {
  return `${prefix}: ${data.equip_infra || data.descricao || data.id || "registro"}`;
}

function actionLabel(action) {
  if (action === "INSERT") return "Inserção";
  if (action === "UPDATE") return "Edição";
  if (action === "DELETE") return "Exclusão";
  return action || "—";
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

function statusToProgress(status) {
  const normalized = normalizeHeader(status);
  if (normalized.includes("CONCLUI")) return 1;
  if (normalized.includes("ANDAMENTO")) return 0.5;
  return 0;
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

function setDatabaseStatus(message) {
  const el = document.getElementById("databaseStatus");
  if (el) el.textContent = message;
}

function getValue(id) {
  return String(document.getElementById(id).value || "").trim();
}

function setValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

function getNumberInput(id) {
  const value = getValue(id);
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getIntegerInput(id) {
  const value = getNumberInput(id);
  return value === null ? null : Math.round(value);
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 10 ? `${text.slice(0, 8)}…` : text;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
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
