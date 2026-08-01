(() => {
  "use strict";

  const CSV_PATH = "data/keywords.csv";
  const ROW_H = 36;
  const BUFFER_ROWS = 8;

  const LS_STARRED = "sk_starred";
  const LS_REVIEWED = "sk_reviewed";
  const LS_NOTES = "sk_notes";

  /** @type {{keyword:string, parent:string}[]} */
  let all = [];
  /** @type {Map<string, {keyword:string, parent:string}>} */
  let byKeyword = new Map();
  let filtered = [];
  let selectedKeyword = null;
  let activeFilter = "all";
  let searchTerm = "";

  let starred = loadSet(LS_STARRED);
  let reviewed = loadSet(LS_REVIEWED);
  let notes = loadMap(LS_NOTES);

  // ---- DOM refs ----
  const listScroll = document.getElementById("listScroll");
  const listSpacer = document.getElementById("listSpacer");
  const listRows = document.getElementById("listRows");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const filterbar = document.getElementById("filterbar");
  const statTotal = document.getElementById("statTotal");
  const statReviewed = document.getElementById("statReviewed");
  const statStarred = document.getElementById("statStarred");

  const detailEmpty = document.getElementById("detailEmpty");
  const detailContent = document.getElementById("detailContent");
  const detailLineage = document.getElementById("detailLineage");
  const detailKeyword = document.getElementById("detailKeyword");
  const btnGoogle = document.getElementById("btnGoogle");
  const btnCopy = document.getElementById("btnCopy");
  const btnStar = document.getElementById("btnStar");
  const btnReview = document.getElementById("btnReview");
  const notesArea = document.getElementById("notesArea");

  // ---- storage helpers ----
  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
    catch { return new Set(); }
  }
  function saveSet(key, set) {
    localStorage.setItem(key, JSON.stringify([...set]));
  }
  function loadMap(key) {
    try { return new Map(Object.entries(JSON.parse(localStorage.getItem(key) || "{}"))); }
    catch { return new Map(); }
  }
  function saveMap(key, map) {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(map)));
  }

  // ---- CSV parsing (handles simple quoted fields) ----
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const rows = [];
    for (let i = 1; i < lines.length; i++) { // skip header
      const line = lines[i];
      const cols = splitCSVLine(line);
      if (cols.length < 2) continue;
      const [parent, keyword] = cols;
      if (!keyword) continue;
      rows.push({ parent: parent || "", keyword });
    }
    return rows;
  }

  function splitCSVLine(line) {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  // ---- data load ----
  async function loadData() {
    try {
      const res = await fetch(CSV_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      all = parseCSV(text);
    } catch (err) {
      console.error("Failed to load keywords.csv:", err);
      all = [];
    }
    byKeyword = new Map(all.map((r) => [r.keyword, r]));
    applyFilters();
    updateStats();
  }

  // ---- filtering ----
  function applyFilters() {
    const term = searchTerm.trim().toLowerCase();
    filtered = all.filter((r) => {
      if (term && !r.keyword.toLowerCase().includes(term)) return false;
      if (activeFilter === "starred" && !starred.has(r.keyword)) return false;
      if (activeFilter === "unreviewed" && reviewed.has(r.keyword)) return false;
      if (activeFilter === "reviewed" && !reviewed.has(r.keyword)) return false;
      return true;
    });
    emptyState.hidden = filtered.length !== 0;
    renderVirtualList();
  }

  function updateStats() {
    statTotal.textContent = all.length.toLocaleString();
    statReviewed.textContent = reviewed.size.toLocaleString();
    statStarred.textContent = starred.size.toLocaleString();
  }

  // ---- virtualized list ----
  function renderVirtualList() {
    listSpacer.style.height = `${filtered.length * ROW_H}px`;
    renderVisibleRows();
  }

  function renderVisibleRows() {
    const scrollTop = listScroll.scrollTop;
    const viewportH = listScroll.clientHeight;

    let startIdx = Math.floor(scrollTop / ROW_H) - BUFFER_ROWS;
    let endIdx = Math.ceil((scrollTop + viewportH) / ROW_H) + BUFFER_ROWS;
    startIdx = Math.max(0, startIdx);
    endIdx = Math.min(filtered.length, endIdx);

    listRows.style.transform = `translateY(${startIdx * ROW_H}px)`;
    listRows.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (let i = startIdx; i < endIdx; i++) {
      frag.appendChild(buildRow(filtered[i]));
    }
    listRows.appendChild(frag);
  }

  function buildRow(item) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.keyword = item.keyword;
    if (item.keyword === selectedKeyword) row.classList.add("is-selected");
    if (reviewed.has(item.keyword)) row.classList.add("is-reviewed");

    const check = document.createElement("div");
    check.className = "row-check";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = reviewed.has(item.keyword);
    checkbox.setAttribute("aria-label", `Mark "${item.keyword}" reviewed`);
    checkbox.addEventListener("click", (e) => e.stopPropagation());
    checkbox.addEventListener("change", () => toggleReviewed(item.keyword));
    check.appendChild(checkbox);

    const kw = document.createElement("div");
    kw.className = "row-keyword";
    kw.textContent = item.keyword;

    const parent = document.createElement("div");
    parent.className = "row-parent";
    parent.textContent = item.parent || "—";

    const actions = document.createElement("div");
    actions.className = "row-actions";

    const gBtn = document.createElement("button");
    gBtn.className = "icon-btn";
    gBtn.title = "Open in Google";
    gBtn.textContent = "🔍";
    gBtn.addEventListener("click", (e) => { e.stopPropagation(); openGoogle(item.keyword); });

    const cBtn = document.createElement("button");
    cBtn.className = "icon-btn";
    cBtn.title = "Copy";
    cBtn.textContent = "📋";
    cBtn.addEventListener("click", (e) => { e.stopPropagation(); copyKeyword(item.keyword); });

    const sBtn = document.createElement("button");
    sBtn.className = "icon-btn" + (starred.has(item.keyword) ? " is-starred" : "");
    sBtn.title = "Star";
    sBtn.textContent = starred.has(item.keyword) ? "★" : "☆";
    sBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleStar(item.keyword); });

    actions.append(gBtn, cBtn, sBtn);
    row.append(check, kw, parent, actions);
    row.addEventListener("click", () => selectKeyword(item.keyword));

    return row;
  }

  listScroll.addEventListener("scroll", () => {
    window.requestAnimationFrame(renderVisibleRows);
  });
  window.addEventListener("resize", () => renderVisibleRows());

  // ---- selection & detail panel ----
  function selectKeyword(keyword) {
    selectedKeyword = keyword;
    renderVisibleRows();
    renderDetail();
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    const idx = filtered.findIndex((r) => r.keyword === selectedKeyword);
    if (idx === -1) return;
    const top = idx * ROW_H;
    const bottom = top + ROW_H;
    if (top < listScroll.scrollTop) listScroll.scrollTop = top;
    else if (bottom > listScroll.scrollTop + listScroll.clientHeight) {
      listScroll.scrollTop = bottom - listScroll.clientHeight;
    }
  }

  function buildLineage(keyword) {
    const chain = [];
    let cur = byKeyword.get(keyword);
    const guard = new Set();
    while (cur && !guard.has(cur.keyword)) {
      guard.add(cur.keyword);
      chain.unshift(cur.keyword);
      cur = cur.parent ? byKeyword.get(cur.parent) : null;
    }
    return chain;
  }

  function renderDetail() {
    if (!selectedKeyword) {
      detailEmpty.hidden = false;
      detailContent.hidden = true;
      return;
    }
    detailEmpty.hidden = true;
    detailContent.hidden = false;

    detailKeyword.textContent = selectedKeyword;

    const chain = buildLineage(selectedKeyword);
    detailLineage.innerHTML = "";
    chain.forEach((kw, i) => {
      const node = document.createElement("div");
      node.className = "lineage-node" + (i === chain.length - 1 ? " is-leaf" : "");
      const dot = document.createElement("span");
      dot.className = "dot";
      const label = document.createElement("span");
      label.textContent = kw;
      node.append(dot, label);
      detailLineage.appendChild(node);
    });

    btnStar.classList.toggle("is-active", starred.has(selectedKeyword));
    btnStar.textContent = starred.has(selectedKeyword) ? "★ Starred" : "☆ Star";

    btnReview.classList.toggle("is-active", reviewed.has(selectedKeyword));
    btnReview.textContent = reviewed.has(selectedKeyword) ? "✓ Reviewed" : "Mark reviewed";

    notesArea.value = notes.get(selectedKeyword) || "";
  }

  // ---- actions ----
  function openGoogle(keyword) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(keyword)}`, "_blank", "noopener");
  }

  function copyKeyword(keyword) {
    navigator.clipboard?.writeText(keyword).catch(() => {});
  }

  function toggleStar(keyword) {
    if (starred.has(keyword)) starred.delete(keyword);
    else starred.add(keyword);
    saveSet(LS_STARRED, starred);
    updateStats();
    if (activeFilter === "starred") applyFilters();
    else renderVisibleRows();
    if (keyword === selectedKeyword) renderDetail();
  }

  function toggleReviewed(keyword) {
    if (reviewed.has(keyword)) reviewed.delete(keyword);
    else reviewed.add(keyword);
    saveSet(LS_REVIEWED, reviewed);
    updateStats();
    if (activeFilter === "unreviewed" || activeFilter === "reviewed") applyFilters();
    else renderVisibleRows();
    if (keyword === selectedKeyword) renderDetail();
  }

  notesArea.addEventListener("input", () => {
    if (!selectedKeyword) return;
    if (notesArea.value.trim() === "") notes.delete(selectedKeyword);
    else notes.set(selectedKeyword, notesArea.value);
    saveMap(LS_NOTES, notes);
  });

  btnGoogle.addEventListener("click", () => selectedKeyword && openGoogle(selectedKeyword));
  btnCopy.addEventListener("click", () => selectedKeyword && copyKeyword(selectedKeyword));
  btnStar.addEventListener("click", () => selectedKeyword && toggleStar(selectedKeyword));
  btnReview.addEventListener("click", () => selectedKeyword && toggleReviewed(selectedKeyword));

  // ---- search & filters ----
  let searchDebounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchTerm = searchInput.value;
      applyFilters();
    }, 80);
  });

  filterbar.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-tab");
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    [...filterbar.querySelectorAll(".filter-tab")].forEach((t) =>
      t.classList.toggle("is-active", t === btn)
    );
    applyFilters();
  });

  // ---- keyboard shortcuts ----
  document.addEventListener("keydown", (e) => {
    const inField = e.target === searchInput || e.target === notesArea;

    if (e.key === "/" && !inField) {
      e.preventDefault();
      searchInput.focus();
      return;
    }
    if (e.key === "Escape" && e.target === searchInput) {
      searchInput.blur();
      return;
    }
    if (inField) return;

    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      moveSelection(-1);
    } else if ((e.key === "g" || e.key === "Enter") && selectedKeyword) {
      openGoogle(selectedKeyword);
    } else if (e.key === "c" && selectedKeyword) {
      copyKeyword(selectedKeyword);
    } else if (e.key === "s" && selectedKeyword) {
      toggleStar(selectedKeyword);
    } else if (e.key === "x" && selectedKeyword) {
      toggleReviewed(selectedKeyword);
    }
  });

  function moveSelection(dir) {
    if (filtered.length === 0) return;
    const curIdx = filtered.findIndex((r) => r.keyword === selectedKeyword);
    let nextIdx = curIdx === -1 ? 0 : curIdx + dir;
    nextIdx = Math.max(0, Math.min(filtered.length - 1, nextIdx));
    selectKeyword(filtered[nextIdx].keyword);
  }

  // ---- init ----
  loadData();
})();
