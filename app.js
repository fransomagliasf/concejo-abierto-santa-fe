const PAGE_SIZE = 50;
const MISSING_EXPEDIENTE = "Expediente ausente";
const state = { documents: [], filtered: [], page: 1 };
const collator = new Intl.Collator("es", { sensitivity: "base", usage: "search" });
const $ = (selector) => document.querySelector(selector);
const elements = {
  form: $("#filters"), keyword: $("#keyword"), type: $("#type"), number: $("#number"),
  from: $("#from"), to: $("#to"), clear: $("#clear"), body: $("#table-body"),
  count: $("#result-count"), summary: $("#active-summary"), loading: $("#loading"),
  error: $("#error"), empty: $("#empty"), table: $("#table-wrap"), pagination: $("#pagination"),
  previous: $("#previous"), next: $("#next"), pageLabel: $("#page-label"), notice: $("#notice"),
};

const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const formatDate = (date) => date ? new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "Fecha sin validar";
const escapeHtml = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const byDocumentNumber = (a, b) => String(a.numero).localeCompare(String(b.numero), "es", { numeric: true }) || collator.compare(a.tipo, b.tipo);

function applyFilters() {
  const keyword = normalize(elements.keyword.value.trim());
  const type = elements.type.value;
  const number = normalize(elements.number.value.trim()).replace(/^0+(?=\d)/, "");
  const from = elements.from.value;
  const to = elements.to.value;
  state.filtered = state.documents.filter((document) => {
    if (type && document.tipo !== type) return false;
    if (number && normalize(document.numero).replace(/^0+(?=\d)/, "") !== number) return false;
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
  const active = [elements.type.value, elements.number.value && `N° ${elements.number.value}`, elements.keyword.value && `“${elements.keyword.value}”`].filter(Boolean);
  elements.summary.textContent = active.length ? active.join(" · ") : "Todos los documentos";
  elements.empty.hidden = state.filtered.length !== 0;
  elements.table.hidden = state.filtered.length === 0;
  elements.pagination.hidden = state.filtered.length <= PAGE_SIZE;
  elements.body.innerHTML = page.map((document) => `
    <tr>
      <td>
        <span class="number">${escapeHtml(document.numero)}</span>
        <span class="meta"><span class="badge">${escapeHtml(document.tipo)}</span><span>${escapeHtml(formatDate(document.fecha))}</span></span>
      </td>
      <td>
        <div class="description">${escapeHtml(document.descripcion || "Sin descripción")}</div>
        ${document.expediente === MISSING_EXPEDIENTE ? `<span class="missing-data">${MISSING_EXPEDIENTE}</span>` : ""}
      </td>
      <td><a class="document-link" href="#" data-document="${escapeHtml(document.id)}">Ver documento</a></td>
    </tr>`).join("");
  elements.previous.disabled = state.page === 1;
  elements.next.disabled = state.page === totalPages;
  elements.pageLabel.textContent = `Página ${state.page} de ${totalPages}`;
}

let debounce;
elements.form.addEventListener("input", () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 180); });
elements.form.addEventListener("change", applyFilters);
elements.form.addEventListener("submit", (event) => event.preventDefault());
elements.clear.addEventListener("click", () => { elements.form.reset(); applyFilters(); elements.keyword.focus(); });
elements.previous.addEventListener("click", () => { state.page -= 1; render(); $("#results-title").scrollIntoView({ behavior: "smooth" }); });
elements.next.addEventListener("click", () => { state.page += 1; render(); $("#results-title").scrollIntoView({ behavior: "smooth" }); });
elements.body.addEventListener("click", (event) => {
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
  [...new Set(payload.documentos.map((document) => document.tipo))].sort((a, b) => collator.compare(a, b)).forEach((type) => elements.type.add(new Option(type, type)));
  elements.loading.hidden = true;
  render();
} catch (error) {
  console.error(error);
  elements.loading.hidden = true;
  elements.error.hidden = false;
  elements.count.textContent = "Archivo no disponible";
}
