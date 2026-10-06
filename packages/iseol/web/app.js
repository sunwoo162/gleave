const TOKEN_KEY = "iseol.web.token";
const OPERATOR_TOKEN_KEY = "iseol.operator.token";
const state = {
  mode: "idea-lab",
  ideaLab: { prototypes: [], campaigns: [], productions: [] },
  projects: [],
  evaluation: { quick: null, soak: null },
  selectedProjectId: "",
  project: null,
  portfolio: null,
  executionProfile: null,
  loading: false,
  lastEventId: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setStatus(kind, message) {
  const banner = $("#status-banner");
  if (!message) {
    banner.hidden = true;
    banner.textContent = "";
    banner.dataset.kind = "";
    return;
  }
  banner.hidden = false;
  banner.dataset.kind = kind;
  banner.textContent = message;
}

function setLoading(loading, message = "Loading Iseol state…") {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  if (loading) setStatus("loading", message);
}

function savedToken() {
  return sessionStorage.getItem(TOKEN_KEY)?.trim() ?? "";
}

function savedOperatorToken() {
  return sessionStorage.getItem(OPERATOR_TOKEN_KEY)?.trim() ?? "";
}

function clearLegacyPersistentTokens() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OPERATOR_TOKEN_KEY);
  } catch {
    // Storage can be unavailable in a hardened browser context.
  }
}

function authHeaders() {
  const token = savedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function operatorAuthHeaders() {
  const token = savedOperatorToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJson(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...authHeaders(), ...options.headers } });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = response.status === 401 ? "unauthorized" : "error";
    throw error;
  }
  return body;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function shortSha(value = "") {
  return value ? value.slice(0, 9) : "—";
}

function prototypeCard(prototype, index) {
  const card = element("article", "prototype-card");
  const top = element("div", "prototype-topline");
  top.append(element("span", "prototype-index", String(index + 1).padStart(2, "0")));
  top.append(element("span", `prototype-state state-${prototype.status}`, prototype.status));
  card.append(top);

  card.append(element("h3", "prototype-title", prototype.title));
  card.append(element("p", "prototype-concept", prototype.concept));

  const facts = element("dl", "prototype-facts");
  const factRows = [
    ["Branch", prototype.repository.branch],
    ["Commit", shortSha(prototype.repository.commitSha)],
    ["Deploy", prototype.deployment.provider || "live"],
  ];
  for (const [label, value] of factRows) {
    const row = element("div", "fact-row");
    row.append(element("dt", "", label), element("dd", "", value));
    facts.append(row);
  }
  card.append(facts);

  const actions = element("div", "prototype-actions");
  const details = element("button", "ghost-button", "Details");
  details.type = "button";
  details.addEventListener("click", () => loadPrototypeDetail(prototype.id));
  actions.append(details);
  const deployment = element("a", "primary-link", "Open prototype ↗");
  deployment.href = prototype.deployment.url;
  deployment.target = "_blank";
  deployment.rel = "noopener noreferrer";
  actions.append(deployment);

  if (prototype.status === "candidate") {
    const promote = element("button", "secondary-button promote-button", "Promote to project");
    promote.type = "button";
    promote.addEventListener("click", () => promotePrototype(prototype.id));
    actions.append(promote);
    const archive = element("button", "ghost-button", "Archive");
    archive.type = "button";
    archive.addEventListener("click", () => archivePrototype(prototype.id));
    actions.append(archive);
  } else if (prototype.promotedProjectId) {
    const openProject = element("button", "secondary-button", "Open workspace");
    openProject.type = "button";
    openProject.addEventListener("click", () => {
      switchMode("project-workspace");
      selectProject(prototype.promotedProjectId);
    });
    actions.append(openProject);
  }
  card.append(actions);
  return card;
}

function campaignCard(campaign) {
  const card = element("article", "campaign-card");
  const head = element("div", "run-head");
  head.append(element("strong", "", "Campaign progress"));
  head.append(element("span", `prototype-state state-${campaign.status}`, campaign.status));
  card.append(head);
  const details = element("button", "secondary-button", "Open campaign");
  details.type = "button";
  details.addEventListener("click", () => loadCampaignDetail(campaign.id));
  card.append(details);
  card.append(element("p", "campaign-seed", campaign.seed));
  card.append(element("p", "muted", `${campaign.readyCount}/${campaign.targetReadyCount} ready · ${campaign.productionCount} productions · concurrency ${campaign.productionConcurrency}`));
  if (campaign.blockerSummary) card.append(element("p", "campaign-blocker", campaign.blockerSummary));
  if (!["complete", "cancelled"].includes(campaign.status)) {
    const cancel = element("button", "ghost-button", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => cancelCampaign(campaign.id));
    card.append(cancel);
  }
  return card;
}

function productionCard(production) {
  const card = element("article", "production-card");
  const head = element("div", "run-head");
  head.append(element("strong", "mono", production.id));
  head.append(element("span", `prototype-state state-${production.status}`, production.status));
  card.append(head);
  card.append(element("p", "muted", `Run ${production.runId} · ${production.run?.stage ?? "pending"} · ${production.run?.status ?? "not created"}`));
  card.append(element("p", "mono muted", `${production.branch} · ${shortSha(production.commitSha)}`));
  if (production.blockerSummary) card.append(element("p", "campaign-blocker", production.blockerSummary));
  if (production.deploymentUrl) {
    const open = element("a", "primary-link", "Open prototype ↗");
    open.href = production.deploymentUrl;
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    card.append(open);
  }
  return card;
}

function renderCampaignDetail(detail) {
  const section = $("#campaign-detail");
  const content = $("#campaign-detail-content");
  section.hidden = false;
  content.replaceChildren();
  content.append(element("h3", "", detail.campaign.seed));
  content.append(element("p", "muted", `${detail.campaign.id} · ${detail.campaign.status} · ${detail.campaign.readyCount}/${detail.campaign.targetReadyCount} ready`));
  if (detail.campaign.blockerSummary) content.append(element("p", "campaign-blocker", detail.campaign.blockerSummary));
  const productions = element("div", "production-grid");
  for (const production of detail.productions) productions.append(productionCard(production));
  content.append(productions);
  const prototypes = element("div", "prototype-grid");
  detail.prototypes.forEach((prototype, index) => prototypes.append(prototypeCard(prototype, index)));
  if (!detail.prototypes.length) prototypes.append(element("p", "muted", "No prototypes are ready yet."));
  content.append(prototypes);
}

function renderPrototypeDetail(detail) {
  const section = $("#prototype-detail");
  const content = $("#prototype-detail-content");
  section.hidden = false;
  content.replaceChildren();
  content.append(element("h3", "", detail.prototype.title));
  content.append(element("p", "", detail.prototype.concept));
  content.append(element("p", "muted", `${detail.prototype.id} · ${detail.prototype.status}`));
  if (detail.origin) content.append(element("p", "mono muted", `Campaign ${detail.origin.campaignId} · Production ${detail.origin.productionId}`));
  const runs = element("div", "run-list");
  if (!detail.runs.length) runs.append(element("p", "muted", "No genesis Run evidence is available."));
  for (const run of detail.runs) runs.append(element("p", "mono muted", `${run.runId} · ${run.stage} · ${run.status} · ${run.evidenceCount} evidence`));
  content.append(runs);
  if (detail.prototype.deployment.url) {
    const link = element("a", "primary-link", "Open preview ↗");
    link.href = detail.prototype.deployment.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    content.append(link);
  }
  const promote = element("button", "secondary-button", "Promote selected prototype");
  promote.type = "button";
  promote.disabled = detail.prototype.status !== "candidate";
  promote.addEventListener("click", () => promotePrototype(detail.prototype.id));
  content.append(promote);
}

async function loadCampaignDetail(campaignId) {
  state.selectedCampaignId = campaignId;
  setLoading(true, "Loading campaign detail…");
  try { renderCampaignDetail(await fetchJson(`/api/idea-lab/campaigns/${encodeURIComponent(campaignId)}`)); setStatus("success", "Campaign detail loaded."); }
  catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function loadPrototypeDetail(prototypeId) {
  state.selectedPrototypeId = prototypeId;
  setLoading(true, "Loading prototype detail…");
  try { renderPrototypeDetail(await fetchJson(`/api/prototypes/${encodeURIComponent(prototypeId)}`)); setStatus("success", "Prototype detail loaded."); }
  catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

function renderIdeaLab() {
  const prototypes = state.ideaLab.prototypes ?? [];
  const campaigns = state.ideaLab.campaigns ?? [];
  const productions = state.ideaLab.productions ?? [];
  const campaignList = $("#campaign-list");
  const productionGrid = $("#production-grid");
  campaignList.replaceChildren(...campaigns.map(campaignCard));
  productionGrid.replaceChildren(...productions.map(productionCard));
  if (!campaigns.length) campaignList.append(element("p", "muted", "No active Campaigns."));
  if (!productions.length) productionGrid.append(element("p", "muted", "No production Runs yet."));
  const grid = $("#prototype-grid");
  grid.replaceChildren();
  $("#prototype-count").textContent = String(prototypes.length);
  $("#promoted-count").textContent = String(prototypes.filter((item) => item.status === "promoted").length);
  $("#candidate-count").textContent = String(prototypes.filter((item) => item.status === "candidate").length);
  if (!prototypes.length) {
    const empty = element("div", "empty-state empty-card");
    empty.append(element("strong", "", "Idea Lab is empty."));
    empty.append(element("span", "", "READY prototypes appear here after verified preview deployment."));
    grid.append(empty);
  } else {
    prototypes.forEach((prototype, index) => grid.append(prototypeCard(prototype, index)));
  }
}

function refreshProjectOptions() {
  const select = $("#project-select");
  const current = state.selectedProjectId;
  select.replaceChildren(new Option("Select a project", ""));
  const projects = new Map(state.projects.map(project => [project.id, project.name]));
  for (const prototype of state.ideaLab.prototypes ?? []) {
    if (!prototype.promotedProjectId) continue;
    if (!projects.has(prototype.promotedProjectId)) projects.set(prototype.promotedProjectId, prototype.title);
  }
  for (const [id, name] of projects) select.append(new Option(`${name} (${id})`, id));
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

let projectListGeneration = 0;
async function loadProjects() {
  const generation = ++projectListGeneration;
  const notice = $("#project-list-status");
  const select = $("#project-select");
  notice.dataset.kind = "loading";
  notice.textContent = "Loading projects…";
  select.disabled = true;
  try {
    const result = await fetchJson("/api/projects");
    if (generation !== projectListGeneration) return false;
    state.projects = result.projects;
    refreshProjectOptions();
    const count = select.options.length - 1;
    notice.dataset.kind = count ? "success" : "empty";
    notice.textContent = count ? `${count} projects loaded.` : "No projects available.";
    select.disabled = count === 0;
    return true;
  } catch (error) {
    if (generation !== projectListGeneration) return false;
    notice.dataset.kind = "error";
    notice.textContent = `Project list unavailable: ${error.message}`;
    return false;
  }
}

async function loadIdeaLab({ quiet = false } = {}) {
  if (!quiet) setLoading(true, "Loading Idea Lab…");
  try {
    state.ideaLab = await fetchJson("/api/idea-lab");
    renderIdeaLab();
    refreshProjectOptions();
    if (!quiet) setStatus("success", "Idea Lab synced with durable Iseol state.");
  } catch (error) {
    setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message);
  } finally {
    setLoading(false);
  }
}

async function createCampaign(makeMore = false) {
  const latestSeed = state.ideaLab.campaigns?.at(-1)?.seed ?? "";
  const seed = $("#campaign-seed").value.trim() || (makeMore ? latestSeed : "");
  const targetReadyCount = Number($("#campaign-target").value || 3);
  if (!seed) { setStatus("error", "Enter a Campaign seed first."); return; }
  setLoading(true, makeMore ? "Creating another Idea Lab Campaign…" : "Creating Idea Lab Campaign…");
  try {
    await fetchJson("/api/idea-lab/campaigns", {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ seed, targetReadyCount, productionConcurrency: 1 }),
    });
    await loadIdeaLab({ quiet: true });
    setStatus("success", makeMore ? "New Campaign queued for more candidates." : "Campaign created.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function cancelCampaign(campaignId) {
  setLoading(true, "Cancelling Campaign…");
  try {
    await fetchJson(`/api/idea-lab/campaigns/${encodeURIComponent(campaignId)}/cancel`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    await loadIdeaLab({ quiet: true });
    setStatus("success", `Campaign cancelled: ${campaignId}`);
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function archivePrototype(prototypeId) {
  setLoading(true, "Archiving prototype…");
  try {
    await fetchJson(`/api/prototypes/${encodeURIComponent(prototypeId)}/archive`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    await loadIdeaLab({ quiet: true });
    setStatus("success", `Archived ${prototypeId}.`);
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function promotePrototype(prototypeId) {
  setLoading(true, "Promoting prototype and importing Genesis…");
  try {
    const project = await fetchJson(`/api/prototypes/${encodeURIComponent(prototypeId)}/promote`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await loadIdeaLab({ quiet: true });
    await loadProjects();
    switchMode("project-workspace");
    await selectProject(project.id);
    setStatus("success", `Promoted ${prototypeId} to ${project.id}.`);
  } catch (error) {
    const kind = error.code === "unauthorized" ? "unauthorized" : "error";
    const message = error.status === 401
      ? "Unauthorized. Save the Iseol Web token and try again."
      : error.message;
    setStatus(kind, message);
  } finally {
    setLoading(false);
  }
}

function switchMode(mode) {
  state.mode = mode;
  $$(".mode-tab").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#idea-lab-view").hidden = mode !== "idea-lab";
  $("#project-workspace-view").hidden = mode !== "project-workspace";
  $("#evaluation-view").hidden = mode !== "evaluation";
  if (mode === "project-workspace") void loadProjects();
  if (mode === "evaluation") void loadEvaluation();
}

function clearProjectView() {
  state.project = null;
  state.portfolio = null;
  state.executionProfile = null;
  $("#project-empty").hidden = false;
  $("#project-content").hidden = true;
  $("#execution-profile-content").replaceChildren();
  $("#portfolio-content").replaceChildren();
}

function infoRow(label, value, mono = false) {
  const row = element("div", "info-row");
  row.append(element("span", "info-label", label));
  const content = element("strong", mono ? "mono" : "", value || "—");
  row.append(content);
  return row;
}

function renderGenesis(genesis) {
  const root = $("#genesis-content");
  root.replaceChildren();
  const grid = element("div", "genesis-grid");
  grid.append(infoRow("Prototype", genesis.prototypeId, true));
  grid.append(infoRow("Branch", genesis.repository.branch, true));
  grid.append(infoRow("Origin commit", genesis.repository.commitSha, true));
  grid.append(infoRow("Promoted", new Date(genesis.promotedAt).toLocaleString()));
  grid.append(infoRow("Genesis Runs", String(genesis.runs?.length ?? 0)));
  root.append(grid);

  const links = element("div", "inline-links");
  const repository = element("a", "text-link", "Repository ↗");
  repository.href = genesis.repository.url;
  repository.target = "_blank";
  repository.rel = "noopener noreferrer";
  const deployment = element("a", "text-link", "Genesis deployment ↗");
  deployment.href = genesis.deployment.url;
  deployment.target = "_blank";
  deployment.rel = "noopener noreferrer";
  links.append(repository, deployment);
  root.append(links);
}

function treeBranch(nodes, parentId) {
  const children = nodes.filter((node) => (node.parentId ?? null) === parentId);
  const list = element("ul", parentId === null ? "tree-root" : "tree-children");
  for (const node of children) {
    const item = element("li", "tree-node");
    const line = element("div", "tree-line");
    line.append(element("span", `tree-kind kind-${node.kind}`, node.kind));
    line.append(element("strong", "tree-title", node.title));
    line.append(element("span", `tree-status status-${node.status}`, node.status));
    if (node.runIds?.length) {
      line.append(element("span", "tree-run-count", `${node.runIds.length} run${node.runIds.length === 1 ? "" : "s"}`));
    }
    item.append(line);
    const nested = treeBranch(nodes, node.id);
    if (nested.childElementCount) item.append(nested);
    list.append(item);
  }
  return list;
}

function renderTree(nodes) {
  const root = $("#tree-content");
  root.replaceChildren();
  if (!nodes?.length) {
    root.append(element("p", "muted", "Project tree is empty."));
    return;
  }
  root.append(treeBranch(nodes, null));
}

function renderRuns(runs) {
  const root = $("#runs-content");
  root.replaceChildren();
  if (!runs?.length) {
    root.append(element("p", "muted", "No active attached Runs."));
    return;
  }
  const list = element("div", "run-list");
  for (const run of runs) {
    const card = element("article", "run-card");
    const head = element("div", "run-head");
    head.append(element("strong", "mono", run.runId));
    head.append(element("span", `run-status run-${run.status.toLowerCase()}`, run.status));
    card.append(head);
    card.append(element("p", "run-objective", run.objective));
    const meta = element("div", "run-meta");
    meta.append(element("span", "", `Stage ${run.stage}`));
    meta.append(element("span", "", `${run.evidenceCount} evidence`));
    if (run.policySha256) meta.append(element("span", "mono", `policy ${shortSha(run.policySha256)}`));
    card.append(meta);
    if (run.reason) card.append(element("p", "run-reason muted", run.reason));
    if (run.agentPlan?.length) {
      const roles = element("p", "run-roles muted");
      roles.textContent = `Roles: ${run.agentPlan.map((item) => `${item.role} (${item.status})`).join(", ")}`;
      card.append(roles);
    }
    if (run.evidence?.length) {
      const evidence = element("ul", "run-evidence");
      for (const item of run.evidence) {
        evidence.append(element("li", "muted", `${item.kind} · ${item.stage} · ${item.summary}`));
      }
      card.append(evidence);
    }
    list.append(card);
  }
  root.append(list);
}

function renderHistory(history) {
  const root = $("#history-content");
  root.replaceChildren();
  if (!history?.length) {
    root.append(element("p", "muted", "No durable history yet."));
    return;
  }
  const timeline = element("ol", "history-list");
  for (const event of [...history].sort((a, b) => a.at.localeCompare(b.at))) {
    const item = element("li", "history-item");
    const dot = element("span", "history-dot");
    const body = element("div", "history-body");
    const top = element("div", "history-top");
    top.append(element("strong", "", event.summary));
    top.append(element("time", "", new Date(event.at).toLocaleString()));
    body.append(top);
    const refs = [event.type, event.nodeId, event.runId, event.prototypeId].filter(Boolean);
    if (refs.length) body.append(element("p", "mono muted", refs.join(" · ")));
    item.append(dot, body);
    timeline.append(item);
  }
  root.append(timeline);
}

function renderProject(view) {
  state.project = view;
  $("#project-empty").hidden = true;
  $("#project-content").hidden = false;
  $("#project-name").textContent = view.project.name;
  $("#project-status").textContent = view.project.status.toUpperCase();
  $("#project-meta").textContent = `${view.project.id} · updated ${new Date(view.project.updatedAt).toLocaleString()}`;
  const deployment = $("#project-deployment");
  deployment.href = view.genesis.deployment.url;
  renderGenesis(view.genesis);
  renderTree(view.tree);
  renderRuns(view.runs);
  renderHistory(view.history);
  $("#project-objective").value = view.project.name;
  $("#project-target-root").value = "";
  $("#project-purpose").value = "";
  $("#execution-profile-content").replaceChildren(element("p", "muted", "목적을 선택하고 실행 프로필을 확인하세요."));
  $("#portfolio-content").replaceChildren(element("p", "muted", "실제 개발 기록으로 생성한 초안을 불러오세요."));
  if (view.purposeSelection) {
    $("#project-purpose").value = view.purposeSelection.purpose;
    $("#project-objective").value = view.purposeSelection.profile.objective;
    renderExecutionProfile(view.purposeSelection.profile);
  }
}

function renderExecutionProfile(profile) {
  state.executionProfile = profile;
  const root = $("#execution-profile-content");
  root.replaceChildren();
  root.append(element("p", "profile-summary", profile.koreanSummary));
  const grid = element("div", "profile-grid");
  const executable = element("div", "profile-role-group");
  executable.append(element("strong", "", "현재 실행 가능한 역할"));
  executable.append(element("p", "mono muted", profile.executableRoles.join(" · ") || "없음"));
  const planned = element("div", "profile-role-group");
  planned.append(element("strong", "", "계획 또는 추천 역할"));
  planned.append(element("p", "mono muted", profile.plannedRoles.join(" · ") || "없음"));
  const gates = element("div", "profile-role-group");
  gates.append(element("strong", "", "검증 범위"));
  gates.append(element("p", "mono muted", profile.verificationStages.join(" → ")));
  grid.append(executable, planned, gates);
  root.append(grid);
}

async function previewExecutionProfile() {
  const objective = $("#project-objective").value.trim();
  const purpose = $("#project-purpose").value;
  if (!purpose || !objective) { setStatus("error", "프로젝트 목적과 개발 목표를 입력해 주세요."); return; }
  setLoading(true, "실행 프로필을 계산하는 중입니다.");
  try {
    const profile = await fetchJson("/api/execution-profile", {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, objective }),
    });
    renderExecutionProfile(profile);
    setStatus("success", "실행 가능한 역할과 계획 역할을 구분했습니다.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function saveExecutionProfile() {
  const objective = $("#project-objective").value.trim();
  const purpose = $("#project-purpose").value;
  if (!state.selectedProjectId || !objective) { setStatus("error", "프로젝트와 개발 목표를 확인해 주세요."); return; }
  setLoading(true, "프로젝트 목적과 실행 계획을 저장하는 중입니다.");
  try {
    const view = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/purpose`, {
      method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ purpose, objective }),
    });
    renderProject(view);
    setStatus("success", "프로젝트 목적과 실행 계획을 저장했습니다.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function startEventStream() {
  if (state.eventAbort) state.eventAbort.abort();
  const controller = new AbortController();
  state.eventAbort = controller;
  try {
    const headers = authHeaders();
    if (state.lastEventId) headers["Last-Event-ID"] = state.lastEventId;
    const response = await fetch("/api/events", { headers, signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`event stream unavailable (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!controller.signal.aborted) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((value) => value.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type !== "connected" && event.id) state.lastEventId = String(event.id);
          if (event.type !== "connected") {
            const scope = event.scope ?? {};
            const ideaLabEvent = Boolean(scope.campaignId || scope.prototypeId) || String(event.type).startsWith("campaign.") || String(event.type).startsWith("prototype.");
            const projectEvent = Boolean(scope.projectId) || String(event.type).startsWith("project.") || String(event.type).startsWith("run.") || String(event.type).startsWith("work-request.");
            if (ideaLabEvent || (!ideaLabEvent && !projectEvent)) await loadIdeaLab({ quiet: true });
            if (state.selectedProjectId && (!scope.projectId || scope.projectId === state.selectedProjectId) && (projectEvent || (!ideaLabEvent && !projectEvent))) await selectProject(state.selectedProjectId);
          }
        } catch { /* next durable snapshot repairs stale state */ }
      }
    }
  } catch {
    if (!controller.signal.aborted) setTimeout(startEventStream, 3000);
  }
}

async function startProjectRun() {
  const objective = $("#project-objective").value.trim();
  const targetRoot = $("#project-target-root").value.trim();
  if (!state.selectedProjectId || !objective || !targetRoot) {
    setStatus("error", "프로젝트 목적, 개발 목표와 작업 폴더를 확인해 주세요.");
    return;
  }
  setLoading(true, "기존 Harness로 개발 Run을 시작하는 중입니다.");
  try {
    const runId = `project-${state.selectedProjectId}-run-1`;
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/execution-start`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ runId, objective, targetRoot }),
    });
    const view = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}`);
    renderProject(view);
    setStatus("success", result.status === "already-active" ? "기존 개발 Run을 계속 사용합니다." : "개발 Run이 시작되었습니다.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

function renderPortfolio(result) {
  state.portfolio = result;
  const root = $("#portfolio-content");
  root.replaceChildren();
  const document = result.document;
  if (!document) { root.append(element("p", "muted", "포트폴리오 evidence가 아직 없습니다.")); return; }
  if (!result.grounding?.grounded || result.grounding?.documentGrounded === false) root.append(element("p", "portfolio-warning", "일부 항목의 근거가 부족하거나 사용자 수정본이 있어 검토가 필요합니다."));
  for (const section of document.sections) {
    const card = element("article", "portfolio-section");
    const head = element("div", "portfolio-section-head");
    const label = element("label", "portfolio-include");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = section.included;
    checkbox.dataset.sectionId = section.id;
    label.append(checkbox, element("strong", "", section.title));
    head.append(label);
    card.append(head);
    const editor = element("textarea", "portfolio-editor", section.content);
    editor.dataset.sectionId = section.id;
    editor.rows = 4;
    card.append(editor);
    if (section.evidenceIds.length) {
      const details = element("details", "portfolio-evidence");
      details.append(element("summary", "", `근거 ${section.evidenceIds.length}개 보기`));
      const evidenceList = element("ul", "portfolio-evidence-list");
      for (const evidenceId of section.evidenceIds) {
        const evidence = (result.evidence ?? []).find((item) => item.id === evidenceId);
        const item = element("li", "mono muted", evidence ? `${evidenceId}: ${evidence.summary}` : `${evidenceId}: evidence를 찾을 수 없습니다.`);
        evidenceList.append(item);
      }
      details.append(evidenceList);
      card.append(details);
    } else card.append(element("p", "muted", "연결된 evidence가 없습니다."));
    root.append(card);
  }
  const readmeLabel = element("label", "portfolio-readme-label", "README 초안");
  const readme = element("textarea", "portfolio-readme", document.readme);
  readme.id = "portfolio-readme-editor";
  readme.rows = 8;
  readmeLabel.append(readme);
  root.append(readmeLabel);
  const save = element("button", "secondary-button", "포트폴리오 수정 저장");
  save.type = "button";
  save.addEventListener("click", savePortfolioEdits);
  root.append(save);
}

async function loadPortfolio() {
  if (!state.selectedProjectId) return;
  setLoading(true, "포트폴리오 evidence를 모으는 중입니다.");
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/portfolio`);
    renderPortfolio(result);
    setStatus("success", "검증된 개발 기록으로 포트폴리오 초안을 불러왔습니다.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function savePortfolioEdits() {
  if (!state.selectedProjectId) return;
  const sections = [...document.querySelectorAll(".portfolio-section")].map((card) => ({
    id: card.querySelector(".portfolio-editor")?.dataset.sectionId,
    content: card.querySelector(".portfolio-editor")?.value ?? "",
    included: card.querySelector("input[type=checkbox]")?.checked ?? false,
  }));
  const readme = $("#portfolio-readme-editor")?.value ?? "";
  setLoading(true, "포트폴리오 수정사항을 저장하는 중입니다.");
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/portfolio`, {
      method: "PUT", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ sections, readme }),
    });
    state.portfolio = { ...(state.portfolio ?? {}), document: result.document };
    setStatus("success", "사용자 수정본을 저장했습니다. 원본 evidence는 유지됩니다.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function copyReadme() {
  const text = $("#portfolio-readme-editor")?.value;
  if (!text) { setStatus("error", "먼저 README 초안을 불러오세요."); return; }
  try { await navigator.clipboard.writeText(text); setStatus("success", "README를 클립보드에 복사했습니다."); }
  catch { setStatus("error", "브라우저에서 클립보드 접근을 허용하지 않았습니다."); }
}

async function selectProject(projectId) {
  state.selectedProjectId = projectId || "";
  $("#project-select").value = state.selectedProjectId;
  if (!state.selectedProjectId) {
    clearProjectView();
    return;
  }
  setLoading(true, "Loading Project Workspace…");
  try {
    const view = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}`);
    renderProject(view);
    await loadPortfolio();
    await loadWorkRequests();
    setStatus("success", `Project Workspace loaded: ${view.project.name}`);
  } catch (error) {
    clearProjectView();
    setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message);
  } finally {
    setLoading(false);
  }
}

async function loadWorkRequests() {
  const list = $("#work-request-list");
  if (!list || !state.selectedProjectId) return;
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests`);
    list.replaceChildren();
    if (!result.requests.length) list.append(element("p", "muted", "No queued work requests."));
    for (const request of result.requests) {
      const row = element("div", "work-request-row");
      row.append(element("span", "mono muted", `${request.title} · ${request.status} · ${request.attempts} attempts`));
      if (request.runId) row.append(element("span", "mono muted", ` · ${request.runId}`));
      if (request.dependencies?.length) row.append(element("span", "mono muted", ` · depends on ${request.dependencies.join(", ")}`));
      if (request.status === "queued") {
        const execute = element("button", "secondary-button", "Execute");
        execute.type = "button";
        execute.addEventListener("click", () => resumeWorkRequest(request));
        row.append(execute);
        const cancel = element("button", "ghost-button", "Cancel");
        cancel.type = "button";
        cancel.addEventListener("click", () => cancelWorkRequest(request.id));
        row.append(cancel);
      }
      if (request.status === "waiting" && request.requestedRunId) {
        const resume = element("button", "secondary-button", "Resume");
        resume.type = "button";
        resume.addEventListener("click", () => resumeWorkRequest(request));
        row.append(resume);
      }
      if (request.status === "failed" && request.requestedRunId) {
        const retry = element("button", "secondary-button", "Retry Run");
        retry.type = "button";
        retry.addEventListener("click", () => retryWorkRequest(request));
        row.append(retry);
      }
      if (request.status === "running" || request.status === "failed" || request.status === "waiting") {
        const inspect = element("button", "ghost-button", "Inspect");
        inspect.type = "button";
        inspect.addEventListener("click", () => inspectWorkRequest(request.id));
        row.append(inspect);
      }
      list.append(row);
    }
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
}

async function inspectWorkRequest(workRequestId) {
  if (!state.selectedProjectId) return;
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests/${encodeURIComponent(workRequestId)}/reconciliation`);
    const detail = result.run
      ? `Execution ${result.execution}: ${result.run.runId} ${result.run.stage}/${result.run.status}`
      : `Execution ${result.execution}: ${result.blocker ?? "no authoritative Run result"}`;
    setStatus(result.execution === "unknown" ? "error" : "success", `${workRequestId} @ ${result.revision} · ${detail}`);
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
}

async function resumeWorkRequest(request) {
  if (!state.selectedProjectId) return;
  const targetRoot = $("#project-target-root").value.trim();
  if (!targetRoot) { setStatus("error", "Enter a project workspace root before executing."); return; }
  const workRequestId = request.id;
  const runId = request.requestedRunId || `project-${state.selectedProjectId}-${workRequestId}`;
  const expectedRevision = `${request.updatedAt}:${request.attempts}`;
  setLoading(true, "Starting the queued Project Workspace request...");
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests/${encodeURIComponent(workRequestId)}/resume`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, runId, targetRoot }),
    });
    await selectProject(state.selectedProjectId);
    setStatus(result.status === "waiting" ? "error" : "success", result.blocker ?? "Work request execution connected to the Project Workspace Run.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function retryWorkRequest(request) {
  if (!state.selectedProjectId || !request.requestedRunId) return;
  if (!savedOperatorToken()) {
    setStatus("unauthorized", "Enter and save an operator token before retrying a failed Run.");
    return;
  }
  if (!window.confirm(`Retry failed Run ${request.requestedRunId} using the same durable Run identity?`)) return;
  const expectedRevision = `${request.updatedAt}:${request.attempts}`;
  setLoading(true, "Retrying the failed Project Workspace Run...");
  try {
    const result = await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests/${encodeURIComponent(request.id)}/retry`, {
      method: "POST",
      headers: { ...operatorAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, runId: request.requestedRunId }),
    });
    await selectProject(state.selectedProjectId);
    setStatus("success", result.status === "already-active" ? "The Project Workspace Run is already active." : "The failed Project Workspace Run was queued again.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

async function cancelWorkRequest(workRequestId) {
  if (!state.selectedProjectId) return;
  try {
    await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests/${encodeURIComponent(workRequestId)}/cancel`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: "{}",
    });
    await loadWorkRequests();
    setStatus("success", "Work request cancelled; any existing Run remains durable.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
}

async function queueCurrentWorkRequest() {
  if (!state.selectedProjectId) return;
  const objective = $("#project-objective").value.trim();
  if (!objective) { setStatus("error", "Enter a project objective first."); return; }
  setLoading(true, "Queueing work request…");
  try {
    await fetchJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/work-requests`, {
      method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ title: objective.slice(0, 120), objective, idempotencyKey: `${state.selectedProjectId}:${objective}` }),
    });
    await loadWorkRequests();
    setStatus("success", "Work request queued.");
  } catch (error) { setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message); }
  finally { setLoading(false); }
}

function saveToken() {
  const value = $("#web-token").value.trim();
  if (value) sessionStorage.setItem(TOKEN_KEY, value);
  else sessionStorage.removeItem(TOKEN_KEY);
  setStatus("success", value ? "Web token saved for this tab." : "Web token cleared.");
}

function saveOperatorToken() {
  const value = $("#operator-token").value.trim();
  if (value) sessionStorage.setItem(OPERATOR_TOKEN_KEY, value);
  else sessionStorage.removeItem(OPERATOR_TOKEN_KEY);
  setStatus("success", value ? "Operator token saved for this tab." : "Operator token cleared.");
}

function bindEvents() {
  $$(".mode-tab").forEach((button) =>
    button.addEventListener("click", () => switchMode(button.dataset.mode)),
  );
  $("#save-token").addEventListener("click", saveToken);
  $("#save-operator-token").addEventListener("click", saveOperatorToken);
  $("#refresh-ideas").addEventListener("click", () => loadIdeaLab());
  $("#create-campaign").addEventListener("click", () => createCampaign(false));
  $("#make-more").addEventListener("click", () => createCampaign(true));
  $("#refresh-project").addEventListener("click", async () => {
    if (await loadProjects()) await selectProject(state.selectedProjectId);
  });
  $("#refresh-evaluation").addEventListener("click", () => loadEvaluation());
  $("#project-select").addEventListener("change", (event) => selectProject(event.target.value));
  $("#preview-execution-profile").addEventListener("click", () => previewExecutionProfile());
  $("#save-execution-profile").addEventListener("click", () => saveExecutionProfile());
  $("#start-project-run").addEventListener("click", () => startProjectRun());
  $("#load-portfolio").addEventListener("click", () => loadPortfolio());
  $("#copy-readme").addEventListener("click", () => copyReadme());
  $("#queue-work-request").addEventListener("click", () => queueCurrentWorkRequest());
  $("#close-campaign-detail").addEventListener("click", () => { $("#campaign-detail").hidden = true; });
  $("#close-prototype-detail").addEventListener("click", () => { $("#prototype-detail").hidden = true; });
}

async function init() {
  clearLegacyPersistentTokens();
  $("#web-token").value = savedToken();
  $("#operator-token").value = savedOperatorToken();
  bindEvents();
  switchMode("idea-lab");
  clearProjectView();
  await loadIdeaLab();
  void startEventStream();
}

init().catch((error) => setStatus("error", error.message));
function evaluationCard(label, summary) {
  const card = element("article", "evaluation-card");
  const head = element("div", "run-head");
  head.append(element("strong", "", label));
  head.append(element("span", `prototype-state state-${summary.status}`, summary.status));
  card.append(head);
  card.append(element("p", "mono muted", `${summary.evaluationId} · ${new Date(summary.completedAt).toLocaleString()}`));
  const metrics = element("div", "evaluation-metrics");
  metrics.append(element("span", "", `${summary.counts.passed} passed`));
  metrics.append(element("span", "", `${summary.counts.failed} failed`));
  metrics.append(element("span", "", `${summary.counts.blocked} blocked`));
  metrics.append(element("span", "", `recovery p95 ${summary.recoveryLatencyMs}ms`));
  card.append(metrics);
  if (summary.failedInvariantIds?.length) {
    card.append(element("p", "evaluation-invariant", `Failed invariants: ${summary.failedInvariantIds.join(", ")}`));
  }
  for (const item of summary.failedScenarios ?? []) {
    card.append(element("p", "evaluation-failure mono", `${item.scenarioId} · seed ${item.seed} · ${item.status}`));
  }
  for (const blocker of summary.liveBlockers ?? []) {
    card.append(element("p", "evaluation-live-blocker", `Live blocker · ${blocker}`));
  }
  return card;
}
function renderEvaluation() {
  const grid = $("#evaluation-grid");
  const reports = [["Quick", state.evaluation.quick], ["Soak", state.evaluation.soak]].filter(([, value]) => value);
  $("#evaluation-empty").hidden = reports.length > 0;
  $("#evaluation-content").hidden = reports.length === 0;
  grid.replaceChildren(...reports.map(([label, summary]) => evaluationCard(label, summary)));
}

async function loadEvaluation() {
  setLoading(true, "Loading Evaluation reports…");
  try {
    state.evaluation = await fetchJson("/api/evaluation");
    renderEvaluation();
    setStatus("success", "Evaluation reports loaded.");
  } catch (error) {
    setStatus(error.code === "unauthorized" ? "unauthorized" : "error", error.message);
  } finally {
    setLoading(false);
  }
}
