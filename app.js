const PAGE_SIZE = 10;
const MISSING_EXPEDIENTE = "Expediente ausente";
const state = { documents: [], filtered: [], sessions: [], page: 1, expandedSession: null, readingList: new Set() };
const collator = new Intl.Collator("es", { sensitivity: "base", usage: "search" });
const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $("#filters"), keyword: $("#keyword"), type: $("#type"), number: $("#number"),
  from: $("#from"), to: $("#to"), clear: $("#clear"), body: $("#table-body"),
  count: $("#result-count"), loading: $("#loading"),
  error: $("#error"), empty: $("#empty"), table: $("#table-wrap"), pagination: $("#pagination"),
  previous: $("#previous"), next: $("#next"), pageLabel: $("#page-label"), notice: $("#notice"), pageNumber: $("#page-number"),
  readingListBody: $("#reading-list-body"), readingListEmpty: $("#reading-list-empty"), readingListTable: $("#reading-list-table"),
  readingListCount: $("#reading-list-count"), readingListTabCount: $("#reading-list-tab-count"), clearReadingList: $("#clear-reading-list"),
  documentsTab: $("#documents-tab"), sessionsTab: $("#sessions-tab"), readingListTab: $("#reading-list-tab"), documentsControls: $("#documents-controls"),
  sessionsControls: $("#sessions-controls"), readingListControls: $("#reading-list-controls"), documentsResults: $("#documents-results"),
  sessionsResults: $("#sessions-results"), readingListResults: $("#reading-list-results"),
  sessionYear: $("#session-year"), sessionCount: $("#session-count"), sessionList: $("#session-list"),
};

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const formatDate = (date) => date ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "Fecha sin validar";
const formatLongDate = (date) => new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const typeClass = (type) => `type-${normalize(type).replaceAll(" ", "-")}`;
const byDocumentNumber = (a, b) => String(b.numero).localeCompare(String(a.numero), "es", { numeric: true }) || collator.compare(a.tipo, b.tipo);

function parseNumberQuery(value) {
  const input = value.trim();
  if (!input) return null;
  const terms = input.split(";").map((part) => part.trim());
  if (terms.some((part) => !part)) return null;
  const parsed = terms.map((term) => {
    const range = term.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) return { from: Math.min(Number(range[1]), Number(range[2])), to: Math.max(Number(range[1]), Number(range[2])) };
    if (/^\d+$/.test(term)) return { from: Number(term), to: Number(term) };
    return null;
  });
  return parsed.every(Boolean) ? parsed : null;
}

function applyFilters() {
  const keyword = normalize(elements.keyword.value.trim());
  const type = elements.type.value;
  const numberQuery = parseNumberQuery(elements.number.value);
  const from = elements.from.value;
  const to = elements.to.value;
  state.filtered = state.documents.filter((document) => {
    if (type && document.tipo !== type) return false;
    if (elements.number.value.trim()) {
      if (!numberQuery) return false;
      const documentNumber = String(document.numero).replace(/\D/g, "");
      if (!documentNumber || !numberQuery.some(({ from, to }) => Number(documentNumber) >= from && Number(documentNumber) <= to)) return false;
    }
    if (from && (!document.fecha || document.fecha < from)) return false;
    if (to && (!document.fecha || document.fecha > to)) return false;
    if (keyword && !normalize(`${document.descripcion} ${document.expediente || ""} ${document.tipo} ${document.numero}`).includes(keyword)) return false;
    return true;
  }).sort(byDocumentNumber);
  state.page = 1;
  render();
}

function render() {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const page = state.filtered.slice(start, start + PAGE_SIZE);
  elements.count.textContent = `${state.filtered.length.toLocaleString("es-AR")} documentos`;
  elements.empty.hidden = state.filtered.length !== 0;
  elements.table.hidden = state.filtered.length === 0;
  elements.pagination.hidden = state.filtered.length <= PAGE_SIZE;
  elements.body.innerHTML = page.map((document) => `
    <tr>
      <td><span class="type-label ${typeClass(document.tipo)}">${escapeHtml(document.tipo)}</span></td>
      <td><span class="number">${escapeHtml(document.numero)}</span></td>
      <td><time class="document-date" datetime="${document.fecha || ""}">${escapeHtml(formatDate(document.fecha))}</time></td>
      <td>
        <div class="description">${escapeHtml(document.descripcion || "Sin descripción")}</div>
        ${document.expediente === MISSING_EXPEDIENTE ? `<span class="missing-data">${MISSING_EXPEDIENTE}</span>` : ""}
      </td>
      <td><a class="document-link" href="#" data-document="${escapeHtml(document.id)}">Ver documento</a><button class="reading-list-add" type="button" data-add-reading="${escapeHtml(document.id)}" ${state.readingList.has(document.id) ? "disabled" : ""}>${state.readingList.has(document.id) ? "En mi lista" : "＋ Mi lista"}</button></td>
    </tr>`).join("");
  elements.previous.disabled = state.page === 1;
  elements.next.disabled = state.page === totalPages;
  elements.pageLabel.textContent = `Página ${state.page} de ${totalPages}`;
  elements.pageNumber.value = state.page;
  elements.pageNumber.max = totalPages;
}

function renderReadingList() {
  const documents = [...state.readingList].map((id) => state.documents.find((document) => document.id === id)).filter(Boolean);
  const countLabel = `${documents.length.toLocaleString("es-AR")} ${documents.length === 1 ? "documento" : "documentos"}`;
  elements.readingListTab.hidden = documents.length === 0;
  elements.readingListTabCount.textContent = documents.length.toLocaleString("es-AR");
  elements.readingListCount.textContent = countLabel;
  elements.readingListEmpty.hidden = documents.length > 0;
  elements.readingListTable.hidden = documents.length === 0;
  elements.readingListBody.innerHTML = documents.map((document) => `<tr>
    <td><span class="type-label ${typeClass(document.tipo)}">${escapeHtml(document.tipo)}</span></td>
    <td><span class="number">${escapeHtml(document.numero)}</span></td>
    <td><time class="document-date" datetime="${document.fecha || ""}">${escapeHtml(formatDate(document.fecha))}</time></td>
    <td><div class="description">${escapeHtml(document.descripcion || "Sin descripción")}</div></td>
    <td>${escapeHtml(document.expediente || "Sin expediente")}</td>
    <td><a class="document-link" href="#" data-document="${escapeHtml(document.id)}">Ver documento</a><button type="button" class="reading-list-remove" data-remove-reading="${escapeHtml(document.id)}" aria-label="Quitar ${escapeHtml(document.tipo)} ${escapeHtml(document.numero)}">Quitar de mi lista</button></td>
  </tr>`).join("");
}

function buildSessions() {
  const byDate = new Map();
  for (const document of state.documents) {
    if (!document.fecha || document.tipo === "Mensaje") continue;
    if (!byDate.has(document.fecha)) byDate.set(document.fecha, []);
    byDate.get(document.fecha).push(document);
  }
  state.sessions = [...byDate].map(([date, documents]) => ({ date, documents })).sort((a, b) => b.date.localeCompare(a.date));
  const years = [...new Set(state.sessions.map((session) => session.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  elements.sessionYear.innerHTML = years.map((year) => `<option value="${year}">${year}</option>`).join("");
}

function renderSessions() {
  const year = elements.sessionYear.value;
  const sessions = state.sessions.filter((session) => session.date.startsWith(year));
  elements.sessionCount.textContent = `${sessions.length.toLocaleString("es-AR")} ${sessions.length === 1 ? "sesión" : "sesiones"} en ${year}`;
  elements.sessionList.innerHTML = sessions.map((session) => {
    const counts = new Map();
    session.documents.forEach((document) => counts.set(document.tipo, (counts.get(document.tipo) || 0) + 1));
    const types = [...counts].sort(([a], [b]) => collator.compare(a, b));
    const expanded = state.expandedSession === session.date;
    const documents = [...session.documents].sort((a, b) => collator.compare(a.tipo, b.tipo) || byDocumentNumber(a, b));
    const preview = documents.slice(0, 3).map((document) => `<li><strong>${escapeHtml(document.tipo)} ${escapeHtml(document.numero)}</strong><span>${escapeHtml(document.descripcion)}</span></li>`).join("");
    const detail = expanded ? `<div class="session-detail"><ul>${documents.map((document) => `<li><strong>${escapeHtml(document.tipo)} ${escapeHtml(document.numero)}</strong><span>${escapeHtml(document.descripcion)}</span>${document.expediente === MISSING_EXPEDIENTE ? `<em>${MISSING_EXPEDIENTE}</em>` : ""}</li>`).join("")}</ul></div>` : "";
    return `<article class="session-card">
      <div class="session-card-heading">
        <div><time datetime="${session.date}">${escapeHtml(formatLongDate(session.date))}</time><span>${session.documents.length.toLocaleString("es-AR")} ${session.documents.length === 1 ? "documento" : "documentos"}</span></div>
        <div class="session-types">${types.map(([type, count]) => `<span class="${typeClass(type)}">${escapeHtml(type)} <strong>${count}</strong></span>`).join("")}</div>
      </div>
      ${expanded ? "" : `<ul class="session-preview">${preview}</ul>`}
      <button class="session-toggle btn btn-link" type="button" data-session="${session.date}" aria-expanded="${expanded}">${expanded ? "Ocultar detalle" : `Ver los ${session.documents.length.toLocaleString("es-AR")} documentos`}</button>
      ${detail}
    </article>`;
  }).join("");
}

function selectView(view) {
  const documentsActive = view === "documents";
  const sessionsActive = view === "sessions";
  const readingListActive = view === "reading-list";
  elements.documentsTab.classList.toggle("active", documentsActive);
  elements.sessionsTab.classList.toggle("active", sessionsActive);
  elements.readingListTab.classList.toggle("active", readingListActive);
  elements.documentsTab.setAttribute("aria-selected", String(documentsActive));
  elements.sessionsTab.setAttribute("aria-selected", String(sessionsActive));
  elements.readingListTab.setAttribute("aria-selected", String(readingListActive));
  elements.documentsControls.hidden = !documentsActive;
  elements.documentsResults.hidden = !documentsActive;
  elements.sessionsControls.hidden = !sessionsActive;
  elements.sessionsResults.hidden = !sessionsActive;
  elements.readingListControls.hidden = !readingListActive;
  elements.readingListResults.hidden = !readingListActive;
  if (sessionsActive) renderSessions();
  if (readingListActive) renderReadingList();
}

let debounce;
elements.form.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 180); });
elements.form.addEventListener("change", applyFilters);
elements.form.addEventListener("submit", (event) => event.preventDefault());
elements.clear.addEventListener("click", () => { elements.form.reset(); applyFilters(); elements.keyword.focus(); });
elements.previous.addEventListener("click", () => { state.page -= 1; render(); $("#results-title").scrollIntoView({ behavior: "smooth" }); });
elements.next.addEventListener("click", () => { state.page += 1; render(); $("#results-title").scrollIntoView({ behavior: "smooth" }); });
elements.pageNumber.addEventListener("change", () => {
  const totalPages = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  state.page = Math.min(totalPages, Math.max(1, Number(elements.pageNumber.value) || 1));
  render();
});
elements.body.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add-reading]");
  if (!button) return;
  state.readingList.add(button.dataset.addReading);
  renderReadingList();
  render();
});
elements.readingListBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-reading]");
  if (button) {
    state.readingList.delete(button.dataset.removeReading);
    renderReadingList();
    render();
    if (state.readingList.size === 0) selectView("documents");
  }
});
elements.clearReadingList.addEventListener("click", () => { state.readingList.clear(); renderReadingList(); render(); selectView("documents"); });
elements.documentsTab.addEventListener("click", () => selectView("documents"));
elements.sessionsTab.addEventListener("click", () => selectView("sessions"));
elements.readingListTab.addEventListener("click", () => selectView("reading-list"));
elements.sessionYear.addEventListener("change", () => { state.expandedSession = null; renderSessions(); });
elements.sessionList.addEventListener("click", (event) => {
  const button = event.target.closest(".session-toggle");
  if (!button) return;
  state.expandedSession = state.expandedSession === button.dataset.session ? null : button.dataset.session;
  renderSessions();
  if (state.expandedSession) document.querySelector(`[data-session="${state.expandedSession}"]`)?.closest(".session-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
elements.body.addEventListener("click", (event) => {
  const link = event.target.closest(".document-link");
  if (!link) return;
  event.preventDefault();
  elements.notice.hidden = false;
  clearTimeout(elements.notice.timer);
  elements.notice.timer = setTimeout(() => { elements.notice.hidden = true; }, 3200);
});
elements.readingListBody.addEventListener("click", (event) => {
  const link = event.target.closest(".document-link");
  if (!link) return;
  event.preventDefault();
  elements.notice.hidden = false;
  clearTimeout(elements.notice.timer);
  elements.notice.timer = setTimeout(() => { elements.notice.hidden = true; }, 3200);
});

try {
  const response = await fetch("data/documentos.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  state.documents = payload.documentos;
  state.filtered = [...payload.documentos].sort(byDocumentNumber);
  renderReadingList();
  buildSessions();
  if (elements.sessionsTab.getAttribute("aria-selected") === "true") renderSessions();
  [...new Set(payload.documentos.map((document) => document.tipo))].sort((a, b) => collator.compare(a, b)).forEach((type) => elements.type.add(new Option(type, type)));
  elements.loading.hidden = true;
  render();
} catch (error) {
  console.error(error);
  elements.loading.hidden = true;
  elements.error.hidden = false;
  elements.count.textContent = "Archivo no disponible";
}
