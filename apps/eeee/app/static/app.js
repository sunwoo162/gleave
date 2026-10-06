const RUNS_PAGE_SIZE = 50;
const RECENT_RUN_FILTERS_STORAGE_KEY = "oss-product-builder.recent-run-filters";
const RECENT_RUN_STATUSES = new Set(["all", "created", "running", "completed", "failed", "unavailable"]);
const RECENT_RUN_PAGE_SIZES = new Set(["25", "50", "100"]);
const RECENT_RUN_SORTS = new Set(["newest", "oldest"]);
const state = { requestId: null, requestSelectionId: 0, runId: null, candidates: [], selectedCandidates: null, decisionEvents: [], runs: [], allRuns: [], approved: false, hasMoreRuns: false, hasLoadedRuns: false, loadingRuns: false, runsRequestId: 0, runsError: null, totalRuns: 0, runsUpdatedAt: null, runsPageSize: RUNS_PAGE_SIZE, runsSort: "newest" };
const pendingApprovalRequestIds = new Set();
const pendingResearchRequestIds = new Set();
const pendingRunExecutionIds = new Set();
let designReferenceRequestId = 0;
let visualVerificationRequestId = 0;

const $ = (selector) => document.querySelector(selector);

function setStatus(message, kind = "") {
  const status = $("#status");
  status.textContent = message;
  status.className = `status ${kind}`.trim();
}

function beginRequestSelection() {
  const selectionId = ++state.requestSelectionId;
  if ($("#restore-status").textContent === "Restoring…") {
    $("#restore-status").textContent = "Selection changed";
  }
  if ($("#recent-runs-status").textContent === "Loading selected run…") {
    $("#recent-runs-status").textContent = "Selection changed";
  }
  if ($("#status").textContent === "Creating request…") {
    setStatus("Selection changed");
  }
  return selectionId;
}

function showError(error) {
  const message = error?.detail || error?.message || "Request failed";
  setStatus(message, "error");
  $("#run-summary").textContent = message;
}

function syncResearchButton() {
  const pending = Boolean(state.requestId && pendingResearchRequestIds.has(state.requestId));
  $("#research-button").disabled = state.approved || pending;
  $("#candidates").setAttribute("aria-busy", String(pending));
}

function syncRunButton(run = state.runs.find((item) => item.id === state.runId)) {
  $("#run-button").disabled = !state.approved
    || !run
    || pendingRunExecutionIds.has(state.runId)
    || !["created", "running"].includes(run.status);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) throw body;
  return body;
}

function renderCandidates() {
  const container = $("#candidates");
  container.replaceChildren();
  syncResearchButton();
  $("#approve-button").disabled = true;
  if (!state.candidates.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No candidate evidence yet.";
    container.append(empty);
    return;
  }
  state.candidates.forEach((candidate, index) => {
    const repository = candidate.repository;
    const card = document.createElement("label");
    card.className = "candidate-card";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = repository.full_name;
    checkbox.checked = state.selectedCandidates === null
      ? index === 0
      : state.selectedCandidates.includes(repository.full_name);
    checkbox.disabled = state.approved;
    checkbox.addEventListener("change", () => {
      state.selectedCandidates = [...document.querySelectorAll("#candidates input:checked")]
        .map((input) => input.value);
    });
    const title = document.createElement("strong");
    title.textContent = candidate.repository.full_name;
    const description = document.createElement("span");
    description.textContent = repository.description || "No description";
    const metadata = document.createElement("small");
    metadata.className = "candidate-metadata";
    metadata.textContent = `License ${repository.license_spdx || "unknown"} · ${repository.stars.toLocaleString()} stars · ${repository.forks.toLocaleString()} forks · Last push ${formatRunTime(repository.pushed_at)}`;
    const dimensionScores = document.createElement("small");
    dimensionScores.className = "candidate-dimensions";
    dimensionScores.textContent = Object.entries(candidate.dimension_scores)
      .map(([dimension, score]) => `${dimension}: ${score}`)
      .join(" · ") || "No score breakdown";
    const evidence = document.createElement("small");
    evidence.textContent = `Score ${candidate.total} · ${candidate.evidence.join("; ")}`;
    const risks = document.createElement("small");
    risks.className = "candidate-risks";
    risks.textContent = candidate.risks.length ? `Risks: ${candidate.risks.join("; ")}` : "Risks: none reported";
    card.append(checkbox, title, description, metadata, dimensionScores, evidence, risks);
    container.append(card);
  });
  $("#approve-button").disabled = state.approved || pendingApprovalRequestIds.has(state.requestId);
}

function renderRun(run) {
  if (!run) {
    $("#run-summary").textContent = "No saved runs for this request yet.";
    $("#events").replaceChildren();
    $("#changed-files").replaceChildren();
    $("#test-commands").replaceChildren();
    $("#run-artifacts").replaceChildren();
    $("#retry-button").disabled = true;
    $("#run-button").disabled = true;
    return;
  }
  const artifacts = run.artifacts || [];
  const resultArtifact = artifacts.find((artifact) => artifact.type === "agent_result")
    || artifacts.find((artifact) => artifact.summary || artifact.changed_files || artifact.test_commands)
    || {};
  const summary = run.error || resultArtifact.summary || "No summary";
  $("#run-summary").textContent = run.status === "unavailable"
    ? `Runtime unavailable: ${summary}. Configure LLM_API_KEY and LLM_MODEL.`
    : `${run.status}: ${summary}`;
  $("#events").replaceChildren(...run.events.map((event) => {
    const item = document.createElement("li");
    item.textContent = JSON.stringify(event);
    return item;
  }));
  const changedFiles = resultArtifact.changed_files || [];
  $("#changed-files").replaceChildren(...changedFiles.map((file) => {
    const item = document.createElement("li");
    item.textContent = file;
    return item;
  }));
  const testCommands = resultArtifact.test_commands || [];
  $("#test-commands").replaceChildren(...testCommands.map((command) => {
    const item = document.createElement("li");
    item.textContent = command;
    return item;
  }));
  const artifactPaths = (run.artifacts || [])
    .map((artifact) => artifact.path)
    .filter(Boolean);
  $("#run-artifacts").replaceChildren(...artifactPaths.map((path) => {
    const item = document.createElement("li");
    item.textContent = path;
    return item;
  }));
  $("#retry-button").disabled = !["failed", "unavailable"].includes(run.status);
  syncRunButton(run);
}

function backgroundRunStatus(runId) {
  return `Run ${runId.slice(0, 8)} continues in background`;
}

function setSelectedRun(runId) {
  if (state.runId && state.runId !== runId && $("#status").textContent === "Running…") {
    setStatus(backgroundRunStatus(state.runId), "busy");
  }
  state.runId = runId;
  document.querySelectorAll(".run-history-item[data-run-id]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.runId === runId));
  });
}

function renderRunHistory(runs) {
  const history = $("#run-history");
  history.replaceChildren();
  if (!runs.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No saved runs yet.";
    history.append(empty);
    return;
  }
  [...runs].reverse().forEach((run) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-history-item";
    button.dataset.runId = run.id;
    button.setAttribute("aria-pressed", String(run.id === state.runId));
    button.title = `Created ${formatRunTime(run.created_at)}`;
    button.textContent = `${run.status} · ${formatRunTime(run.created_at)} · ${run.id.slice(0, 8)}`;
    button.addEventListener("click", () => {
      beginRequestSelection();
      setSelectedRun(run.id);
      renderRun(run);
    });
    item.append(button);
    history.append(item);
  });
}

function renderRecentRuns() {
  const list = $("#recent-runs");
  list.replaceChildren();
  const filteredRuns = state.allRuns;
  const loadedRuns = filteredRuns.length;
  const runsRange = `Showing ${loadedRuns ? `1–${loadedRuns}` : "0"} of ${state.totalRuns} matching runs`;
  const refreshedAt = state.runsUpdatedAt ? ` · Updated ${formatRunTime(state.runsUpdatedAt)}` : "";
  $("#recent-runs-status").textContent = state.runsError && loadedRuns
    ? `${runsRange} · ${state.runsError}${refreshedAt}`
    : state.runsError || (state.loadingRuns && !loadedRuns
      ? "Loading runs…"
      : `${runsRange}${state.loadingRuns ? " · Loading more…" : ""}${refreshedAt}`);
  $("#load-more-runs").hidden = !state.hasMoreRuns;
  $("#load-more-runs").disabled = state.loadingRuns;
  $("#refresh-recent-runs").disabled = state.loadingRuns;
  $("#recent-run-page-size").disabled = state.loadingRuns;
  $("#recent-run-sort").disabled = state.loadingRuns;
  if (!filteredRuns.length) {
    if (!state.hasLoadedRuns || state.loadingRuns) return;
    const empty = document.createElement("li");
    empty.className = "muted";
    const hasFilters = $("#recent-run-search").value.trim()
      || $("#recent-run-status-filter").value !== "all"
      || $("#recent-run-created-after").value
      || $("#recent-run-created-before").value;
    empty.textContent = hasFilters ? "No runs match the current filters (0 total)." : "No saved runs yet.";
    list.append(empty);
    return;
  }
  filteredRuns.forEach((run) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-history-item";
    button.dataset.runId = run.id;
    button.setAttribute("aria-pressed", String(run.id === state.runId));
    button.textContent = `${run.status} · ${formatRunTime(run.created_at)} · request ${run.request_id.slice(0, 8)} · run ${run.id.slice(0, 8)}`;
    button.addEventListener("click", () => openRecentRun(run));
    item.append(button);
    list.append(item);
  });
}

function formatRunTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : date.toLocaleString();
}

function normaliseRecentRunPageSize(value) {
  const pageSizeText = typeof value === "string"
    ? value
    : Number.isInteger(value) ? String(value) : "";
  return RECENT_RUN_PAGE_SIZES.has(pageSizeText) ? Number(pageSizeText) : RUNS_PAGE_SIZE;
}

function normaliseRecentRunSort(value) {
  return RECENT_RUN_SORTS.has(value) ? value : "newest";
}

function readRecentRunFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_RUN_FILTERS_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return {};
    return {
      search: typeof saved.search === "string" ? saved.search : "",
      status: RECENT_RUN_STATUSES.has(saved.status) ? saved.status : "all",
      createdAfter: typeof saved.createdAfter === "string" ? saved.createdAfter : "",
      createdBefore: typeof saved.createdBefore === "string" ? saved.createdBefore : "",
      pageSize: normaliseRecentRunPageSize(saved.pageSize),
      sort: normaliseRecentRunSort(saved.sort),
    };
  } catch (_error) {
    return {};
  }
}

function saveRecentRunFilters() {
  try {
    state.runsPageSize = normaliseRecentRunPageSize($("#recent-run-page-size").value);
    state.runsSort = normaliseRecentRunSort($("#recent-run-sort").value);
    localStorage.setItem(RECENT_RUN_FILTERS_STORAGE_KEY, JSON.stringify({
      search: $("#recent-run-search").value,
      status: $("#recent-run-status-filter").value,
      createdAfter: $("#recent-run-created-after").value,
      createdBefore: $("#recent-run-created-before").value,
      pageSize: $("#recent-run-page-size").value,
      sort: $("#recent-run-sort").value,
    }));
  } catch (_error) {
    // Local storage is an optional convenience; filtering remains usable.
  }
}

function restoreRecentRunFilters() {
  const filters = readRecentRunFilters();
  $("#recent-run-search").value = filters.search || "";
  $("#recent-run-status-filter").value = filters.status || "all";
  $("#recent-run-created-after").value = filters.createdAfter || "";
  $("#recent-run-created-before").value = filters.createdBefore || "";
  state.runsPageSize = filters.pageSize || RUNS_PAGE_SIZE;
  $("#recent-run-page-size").value = String(state.runsPageSize);
  state.runsSort = filters.sort || "newest";
  $("#recent-run-sort").value = state.runsSort;
}

function clearStoredRecentRunFilters() {
  try {
    localStorage.removeItem(RECENT_RUN_FILTERS_STORAGE_KEY);
  } catch (_error) {
    // Local storage is an optional convenience; filtering remains usable.
  }
}

function refreshRecentRunsForFilterChange() {
  clearTimeout(recentRunsSearchTimer);
  saveRecentRunFilters();
  refreshRecentRuns();
}

async function refreshRecentRuns() {
  const requestId = state.runsRequestId + 1;
  state.runsRequestId = requestId;
  state.allRuns = [];
  state.hasMoreRuns = false;
  state.hasLoadedRuns = false;
  state.loadingRuns = false;
  state.runsError = null;
  state.totalRuns = 0;
  state.runsUpdatedAt = null;
  renderRecentRuns();
  await loadMoreRecentRuns(requestId);
}

async function loadMoreRecentRuns(requestId = state.runsRequestId) {
  if (state.loadingRuns || requestId !== state.runsRequestId) return;
  state.runsError = null;
  state.loadingRuns = true;
  renderRecentRuns();
  try {
    const offset = state.allRuns.length;
    const params = new URLSearchParams({ limit: String(state.runsPageSize), offset: String(offset) });
    const sort = state.runsSort;
    const search = $("#recent-run-search").value.trim();
    const status = $("#recent-run-status-filter").value;
    const createdAfter = $("#recent-run-created-after").value;
    const createdBefore = $("#recent-run-created-before").value;
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    params.set("sort", sort);
    setRunTimeFilter(params, "created_after", createdAfter);
    setRunTimeFilter(params, "created_before", createdBefore);
    const response = await fetch(`/api/runs?${params}`);
    const page = await response.json();
    if (!response.ok) throw page;
    if (requestId !== state.runsRequestId) return;
    state.allRuns.push(...page);
    state.hasMoreRuns = response.headers.get("X-Has-More") === "true";
    state.totalRuns = Number(response.headers.get("X-Total-Count") || state.allRuns.length);
    state.hasLoadedRuns = true;
    state.runsUpdatedAt = new Date().toISOString();
    state.runsError = null;
  } catch (error) {
    if (requestId === state.runsRequestId) {
      state.runsError = error?.detail || "Could not load more runs";
    }
  } finally {
    if (requestId === state.runsRequestId) {
      state.loadingRuns = false;
      renderRecentRuns();
    }
  }
}

function setRunTimeFilter(params, name, value) {
  if (!value) return;
  const timestamp = new Date(value);
  if (!Number.isNaN(timestamp.getTime())) params.set(name, timestamp.toISOString());
}

function clearRunHistoryFilters() {
  clearTimeout(recentRunsSearchTimer);
  clearStoredRecentRunFilters();
  $("#recent-run-search").value = "";
  $("#recent-run-status-filter").value = "all";
  $("#recent-run-created-after").value = "";
  $("#recent-run-created-before").value = "";
  state.runsPageSize = RUNS_PAGE_SIZE;
  $("#recent-run-page-size").value = String(RUNS_PAGE_SIZE);
  state.runsSort = "newest";
  $("#recent-run-sort").value = state.runsSort;
  refreshRecentRuns();
}

async function openRecentRun(run) {
  const selectionId = beginRequestSelection();
  try {
    $("#recent-runs-status").textContent = "Loading selected run…";
    if (state.requestId !== run.request_id) {
      const snapshot = await requestJson(`/api/requests/${run.request_id}`);
      if (state.requestSelectionId !== selectionId) return;
      applySnapshot(snapshot);
    }
    setSelectedRun(run.id);
    renderRun(run);
    $("#recent-runs-status").textContent = `Showing run ${run.id.slice(0, 8)} from request ${run.request_id.slice(0, 8)}`;
    setStatus("Run restored", "success");
  } catch (error) {
    if (state.requestSelectionId !== selectionId) return;
    $("#recent-runs-status").textContent = error?.detail || "Could not restore selected run";
  }
}

function renderDecisionEvents(events) {
  $("#decision-events").replaceChildren(...events.map((event) => {
    const item = document.createElement("li");
    const selected = Array.isArray(event.selected) ? ` (${event.selected.join(", ")})` : "";
    item.textContent = `${event.action || "event"}${selected}`;
    return item;
  }));
}

function renderSnapshotEvidence(snapshot) {
  const plan = snapshot?.work_plan?.steps || [];
  $("#work-plan").replaceChildren(...plan.map((step) => {
    const item = document.createElement("li");
    item.textContent = `${step.title}: ${step.description}`;
    return item;
  }));
  renderDecisionEvents(snapshot?.decision_events || []);
}

function rememberRequest(requestId) {
  try {
    localStorage.setItem("oss-product-builder.request-id", requestId);
  } catch (_error) {
    // Local storage is an optional convenience; the API flow remains usable.
  }
}

function forgetRequest(requestId) {
  try {
    if (!requestId || localStorage.getItem("oss-product-builder.request-id") === requestId) {
      localStorage.removeItem("oss-product-builder.request-id");
    }
  } catch (_error) {
    // Local storage is an optional convenience; the API flow remains usable.
  }
}

async function restoreRequest(requestId, quiet = false) {
  const selectionId = beginRequestSelection();
  try {
    if (!quiet) $("#restore-status").textContent = "Restoring…";
    const snapshot = await requestJson(`/api/requests/${requestId}`);
    if (state.requestSelectionId !== selectionId) return false;
    if (quiet && state.requestId && state.requestId !== requestId) return false;
    applySnapshot(snapshot);
    $("#restore-status").textContent = quiet ? "Saved request restored" : "Request restored";
    setStatus(quiet ? "Saved request restored" : "Request restored", "success");
    return true;
  } catch (error) {
    if (state.requestSelectionId !== selectionId) return false;
    if (quiet) {
      if (String(error?.detail || "").toLowerCase().includes("request not found")) {
        forgetRequest(requestId);
        $("#restore-request-id").value = "";
      }
      return false;
    }
    $("#restore-status").textContent = error?.detail || "Request restore failed";
    return false;
  }
}

function applySnapshot(snapshot) {
  state.requestId = snapshot.request_id;
  state.candidates = snapshot.candidates || [];
  state.selectedCandidates = snapshot.decision ? snapshot.decision.selected : null;
  state.decisionEvents = snapshot.decision_events || [];
  state.runs = snapshot.runs || [];
  state.approved = snapshot.decision?.approved === true;
  setSelectedRun(state.runs.at(-1)?.id || null);
  $("#restore-request-id").value = state.requestId;
  $("#request-text").value = snapshot.brief.raw_text;
  $("#workspace").value = snapshot.workspace;
  $("#brief").textContent = `${snapshot.brief.goal} · ${snapshot.brief.target_type}`;
  renderCandidates();
  renderSnapshotEvidence(snapshot);
  renderRunHistory(state.runs);
  syncResearchButton();
  renderRun(state.runs.at(-1));
  rememberRequest(state.requestId);
}

$("#request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const selectionId = beginRequestSelection();
  try {
    setStatus("Creating request…", "busy");
    const body = {
      text: $("#request-text").value,
      workspace: $("#workspace").value || null,
    };
    const created = await requestJson("/api/requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (state.requestSelectionId !== selectionId) return;
    state.requestId = created.request_id;
    setSelectedRun(created.run_id);
    state.approved = false;
    state.candidates = [];
    state.selectedCandidates = null;
    state.decisionEvents = [];
    state.runs = [];
    rememberRequest(state.requestId);
    $("#brief").textContent = `${created.brief.goal} · ${created.brief.target_type}`;
    renderCandidates();
    renderSnapshotEvidence(null);
    renderRunHistory(state.runs);
    renderRun(null);
    refreshRecentRuns();
    $("#research-button").disabled = false;
    setStatus("Request created", "success");
  } catch (error) {
    if (state.requestSelectionId === selectionId) showError(error);
  }
});

$("#research-button").addEventListener("click", async () => {
  const requestId = state.requestId;
  if (!requestId || pendingResearchRequestIds.has(requestId)) return;
  pendingResearchRequestIds.add(requestId);
  syncResearchButton();
  try {
    setStatus("Researching…", "busy");
    const result = await requestJson(`/api/requests/${requestId}/research`, { method: "POST" });
    if (state.requestId !== requestId) return;
    state.candidates = result.candidates;
    if (!state.approved) state.selectedCandidates = null;
    renderCandidates();
    renderSnapshotEvidence({
      work_plan: result.work_plan,
      decision_events: state.approved ? state.decisionEvents : [],
    });
    setStatus(`${state.candidates.length} candidates compared`, "success");
  } catch (error) {
    if (state.requestId === requestId) showError(error);
  } finally {
    pendingResearchRequestIds.delete(requestId);
    syncResearchButton();
  }
});

$("#approve-button").addEventListener("click", async () => {
  const requestId = state.requestId;
  const selectionId = state.requestSelectionId;
  if (!requestId || pendingApprovalRequestIds.has(requestId)) return;
  pendingApprovalRequestIds.add(requestId);
  $("#approve-button").disabled = true;
  try {
    const selected = [...document.querySelectorAll("#candidates input:checked")].map((input) => input.value);
    state.selectedCandidates = selected;
    const result = await requestJson(`/api/requests/${requestId}/approve`, {
      method: "POST",
      body: JSON.stringify({ selected }),
    });
    if (state.requestId !== requestId) return;
    const preserveRunSelection = state.requestSelectionId !== selectionId;
    state.approved = result.decision.approved;
    state.selectedCandidates = result.decision.selected;
    state.decisionEvents = result.decision_events || [];
    if (!preserveRunSelection) setSelectedRun(result.run_id);
    renderCandidates();
    renderDecisionEvents(state.decisionEvents);
    $("#research-button").disabled = state.approved;
    $("#run-button").disabled = !state.approved;
    if (!preserveRunSelection) {
      $("#run-summary").textContent = "Selection approved. Execution is ready.";
    }
    const snapshot = await requestJson(`/api/requests/${requestId}`);
    if (state.requestId !== requestId) return;
    const selectedRunId = state.requestSelectionId !== selectionId ? state.runId : result.run_id;
    applySnapshot(snapshot);
    if (state.requestSelectionId !== selectionId) {
      const selectedRun = state.runs.find((run) => run.id === selectedRunId);
      setSelectedRun(selectedRunId);
      renderRun(selectedRun);
    } else {
      setSelectedRun(result.run_id);
      $("#run-button").disabled = false;
      $("#run-summary").textContent = "Selection approved. Execution is ready.";
    }
    setStatus("Approved", "success");
  } catch (error) {
    if (state.requestId !== requestId) return;
    if (state.approved) {
      const detail = error?.detail || error?.message || "Unknown error";
      setStatus(`Approval saved. Request refresh failed: ${detail}`, "error");
    } else if (state.requestSelectionId !== selectionId) {
      setStatus(error?.detail || error?.message || "Approval failed", "error");
    } else {
      showError(error);
    }
  } finally {
    pendingApprovalRequestIds.delete(requestId);
    if (state.requestId === requestId) {
      $("#approve-button").disabled = state.approved || !state.candidates.length;
    }
  }
});

$("#design-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestId = ++designReferenceRequestId;
  $("#collect-reference-button").disabled = true;
  $("#design-form").setAttribute("aria-busy", "true");
  try {
    $("#design-status").textContent = "Collecting…";
    const result = await requestJson("/api/design/references", {
      method: "POST",
      body: JSON.stringify({
        urls: [$("#reference-url").value],
        keywords: $("#reference-keywords").value.split(",").map((item) => item.trim()).filter(Boolean),
        target_type: $("#reference-target").value,
      }),
    });
    if (requestId !== designReferenceRequestId) return;
    const list = $("#references");
    list.replaceChildren(...result.pack.references.map((reference) => {
      const card = document.createElement("article");
      card.className = "reference-card";
      const title = document.createElement("strong");
      title.textContent = reference.title;
      const source = document.createElement("span");
      source.textContent = `${reference.source_url} · ${reference.license_name || "license unknown"}`;
      const uses = document.createElement("small");
      uses.textContent = `Allowed uses: ${reference.allowed_uses.join(", ")}`;
      card.append(title, source, uses);
      return card;
    }));
    $("#tokens").textContent = `Tokens: ${JSON.stringify(result.tokens)}`;
    $("#attribution").textContent = `Attribution: ${result.pack.attribution.join(" | ")}`;
    $("#design-status").textContent = "Pack recorded";
  } catch (error) {
    if (requestId !== designReferenceRequestId) return;
    $("#design-status").textContent = error?.detail || "Reference collection failed";
  } finally {
    if (requestId === designReferenceRequestId) {
      $("#collect-reference-button").disabled = false;
      $("#design-form").setAttribute("aria-busy", "false");
    }
  }
});

$("#visual-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestId = ++visualVerificationRequestId;
  $("#verify-visual-button").disabled = true;
  $("#visual-status").textContent = "Verifying…";
  $("#visual-form").setAttribute("aria-busy", "true");
  try {
    const result = await requestJson("/api/design/verify", {
      method: "POST",
      body: JSON.stringify({
        url: $("#visual-url").value,
        baseline: $("#visual-baseline").value,
      }),
    });
    if (requestId !== visualVerificationRequestId) return;
    const report = result.report;
    $("#visual-status").textContent = `${report.status}: ${report.blocking_reason || report.differences?.join("; ") || "No differences"} (ID: ${result.id})`;
  } catch (error) {
    if (requestId !== visualVerificationRequestId) return;
    $("#visual-status").textContent = error?.detail || "Visual verification failed";
  } finally {
    if (requestId === visualVerificationRequestId) {
      $("#verify-visual-button").disabled = false;
      $("#visual-form").setAttribute("aria-busy", "false");
    }
  }
});

$("#run-button").addEventListener("click", async () => {
  const runId = state.runId;
  if (!runId || pendingRunExecutionIds.has(runId)) return;
  pendingRunExecutionIds.add(runId);
  syncRunButton();
  try {
    setStatus("Running…", "busy");
    const run = await requestJson(`/api/runs/${runId}/execute`, { method: "POST" });
    if (state.requestId === run.request_id) {
      state.runs = state.runs.map((item) => item.id === run.id ? run : item);
      renderRunHistory(state.runs);
    }
    refreshRecentRuns();
    if (state.runId !== runId) {
      const backgroundStatus = backgroundRunStatus(runId);
      if ($("#status").textContent === backgroundStatus) {
        setStatus(`Run ${runId.slice(0, 8)} ${run.status} in background`, run.status === "completed" ? "success" : "error");
      }
      return;
    }
    renderRun(run);
    setStatus(run.status, run.status === "completed" ? "success" : "error");
  } catch (error) {
    let refreshedRun = null;
    try {
      refreshedRun = await requestJson(`/api/runs/${runId}`);
      if (state.requestId === refreshedRun.request_id) {
        state.runs = state.runs.some((item) => item.id === refreshedRun.id)
          ? state.runs.map((item) => item.id === refreshedRun.id ? refreshedRun : item)
          : [...state.runs, refreshedRun];
        renderRunHistory(state.runs);
      }
      if (state.runId === runId) {
        renderRun(refreshedRun);
        if (refreshedRun.status !== "created") {
          setStatus(
            refreshedRun.status,
            refreshedRun.status === "completed" ? "success" : refreshedRun.status === "running" ? "busy" : "error",
          );
        }
      }
    } catch (_refreshError) {
      // Preserve the execution error if the run status cannot be refreshed.
    }
    if (state.runId !== runId) {
      refreshRecentRuns();
      const backgroundStatus = backgroundRunStatus(runId);
      if ($("#status").textContent === backgroundStatus) {
        setStatus(
          refreshedRun
            ? `Run ${runId.slice(0, 8)} ${refreshedRun.status} in background`
            : `Run ${runId.slice(0, 8)} result unavailable`,
          refreshedRun?.status === "completed" ? "success" : "error",
        );
      }
      return;
    }
    if (!refreshedRun || refreshedRun.status === "created") showError(error);
  } finally {
    pendingRunExecutionIds.delete(runId);
    syncRunButton();
  }
});

$("#restore-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const requestId = $("#restore-request-id").value.trim();
  if (!requestId) return;
  await restoreRequest(requestId);
});

try {
const savedRequestId = localStorage.getItem("oss-product-builder.request-id");
  if (savedRequestId) {
    $("#restore-request-id").value = savedRequestId;
    restoreRequest(savedRequestId, true);
  }
} catch (_error) {
  // Local storage is an optional convenience; the API flow remains usable.
}

restoreRecentRunFilters();
refreshRecentRuns();
$("#load-more-runs").addEventListener("click", loadMoreRecentRuns);
$("#refresh-recent-runs").addEventListener("click", refreshRecentRunsForFilterChange);

let recentRunsSearchTimer;
$("#recent-run-search").addEventListener("input", () => {
  saveRecentRunFilters();
  clearTimeout(recentRunsSearchTimer);
  recentRunsSearchTimer = setTimeout(refreshRecentRuns, 250);
});
$("#recent-run-status-filter").addEventListener("change", () => {
  refreshRecentRunsForFilterChange();
});
$("#recent-run-created-after").addEventListener("change", () => {
  refreshRecentRunsForFilterChange();
});
$("#recent-run-created-before").addEventListener("change", () => {
  refreshRecentRunsForFilterChange();
});
$("#recent-run-page-size").addEventListener("change", refreshRecentRunsForFilterChange);
$("#recent-run-sort").addEventListener("change", refreshRecentRunsForFilterChange);
$("#clear-recent-run-filters").addEventListener("click", clearRunHistoryFilters);

$("#retry-button").addEventListener("click", async () => {
  const runId = state.runId;
  if (!runId) return;
  try {
    const run = await requestJson(`/api/runs/${runId}/retry`, { method: "POST" });
    if (state.requestId === run.request_id) {
      state.runs = state.runs.map((item) => item.id === run.id ? run : item);
      renderRunHistory(state.runs);
    }
    refreshRecentRuns();
    if (state.runId !== runId) return;
    renderRun(run);
    $("#run-summary").textContent = "Retry queued. Check the workspace for partial changes before executing again.";
    setStatus(run.status, "success");
  } catch (error) {
    if (state.runId !== runId) {
      refreshRecentRuns();
      return;
    }
    showError(error);
  }
});
