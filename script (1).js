"use strict";


/* ================================================================
   STATE
   ================================================================ */
const DB_KEY = "meet_ai_db_v1";
const STATUSES = ["backlog", "in_progress", "blocked", "done"];
const STATUS_LABEL = { backlog: "Backlog", in_progress: "In progress", blocked: "Blocked", done: "Done" };

let db = loadDB();
if (!db || !db.meetings || db.meetings.length === 0) {
  db = seedData();
  saveDB();
}

let currentSection = "home";
let charts = {};

function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)); } catch(e) { return null; }
}
function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

/* ================================================================
   ROUTING / NAVIGATION
   ================================================================ */
function navigateTo(section) {
  if (!section) section = "home";
  // hide all sections, show target
  document.querySelectorAll("section.page").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("page-" + section);
  if (!target) {
    // safety fallback — never show 404
    navigateTo("home");
    return;
  }
  target.classList.add("active");
  // update sidebar active state
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const navItem = document.querySelector(`.nav-item[data-go="${section}"]`);
  if (navItem) navItem.classList.add("active");
  currentSection = section;
  // update URL hash without reload (so shared links work)
  if (location.hash !== "#" + section) {
    history.pushState({ section }, "", "#" + section);
  }
  // re-render relevant section
  if (section === "home") renderHome();
  if (section === "summary") renderSummary();
  if (section === "board") renderBoard();
  if (section === "tasks") renderTasks();
  if (section === "dashboard") renderDashboard();
  if (section === "upload") {
    // reset upload card hidden state when re-entering
    document.getElementById("up-result-card").style.display = "none";
    if (!document.getElementById("up-date").value) {
      document.getElementById("up-date").value = new Date().toISOString().slice(0,10);
    }
  }
  // ensure newest sample list is in the dropdown
  refreshSampleDropdown();
}

window.addEventListener("popstate", () => {
  const s = (location.hash || "#home").slice(1);
  navigateTo(s);
});

/* ================================================================
   SAMPLE DATA
   ================================================================ */
function seedData() {
  const meetA = makeMeeting({
    title: "Q3 Product Roadmap Sync",
    date: "2024-09-12",
    attendees: ["Priya R.", "Marcus L.", "Elena V.", "Jordan K.", "Sam T."],
    risks: 1,
    decisions: 3,
    actions: 5,
    body: `Decided: ship the new analytics module in waves, starting with cohort A next week.
Agreed that the mobile web parity fix must land before Q4.
Priya will draft the analytics rollout plan by Friday.
Marcus will own the mobile parity spec and circulate it to the team.
Concern: the vendor integration may slip because the partner has not confirmed scope — risk of delay.
Elena will set up a working session with the partner on Monday.
Decision: defer the dark-mode redesign until after the holidays.
Sam will track the vendor integration risk in the weekly review.
Action: Jordan to update the public roadmap page once Elena's session concludes.`,
    riskBase: 42,
  });

  const meetB = makeMeeting({
    title: "Customer Escalation — Acme Corp",
    date: "2024-09-22",
    attendees: ["Marcus L.", "Lin H.", "Anika S.", "Devon B."],
    risks: 3,
    decisions: 2,
    actions: 4,
    body: `Critical risk: Acme's SSO outage is blocking their go-live, and our runbook has not been validated end-to-end.
Risk: SLA breach could trigger a contractual penalty if not resolved this week.
Risk: the customer success team is unclear on ownership of the escalation channel.
Decision: assign Devon as the dedicated owner for the Acme relationship through resolution.
Decision: provide a daily status update to Acme's CIO.
Lin will reproduce the SSO outage in staging and capture logs by Tuesday.
Anika will draft the SLA-penalty mitigation memo for legal review.
Devon will host a working session with Acme's IT lead on Wednesday.
Marcus will publish a verified runbook by Friday to remove the operational risk.`,
    riskBase: 78,
  });

  const meetC = makeMeeting({
    title: "Hiring & Onboarding Review",
    date: "2024-10-04",
    attendees: ["Jordan K.", "Elena V.", "Priya R."],
    risks: 0,
    decisions: 1,
    actions: 3,
    body: `Decision: standardize the take-home exercise across all engineering loops.
Jordan will publish the updated rubric.
Elena will coordinate the new-hire onboarding checklist update.
Priya will interview candidates next week and report back Friday.`,
    riskBase: 18,
  });

  const meetD = makeMeeting({
    title: "Compliance Posture — October",
    date: "2024-10-18",
    attendees: ["Sam T.", "Lin H."],
    risks: 2,
    decisions: 2,
    actions: 3,
    body: `Risk: a new SOC 2 control is not yet covered by our access-review process.
Risk: the recent vendor change introduced an un-assessed third-party dependency.
Decision: include both gaps in the next quarterly risk register.
Decision: pause the vendor rollout until the assessment is complete.
Sam will draft a remediation plan for the access-review gap.
Lin will run the third-party assessment before next Tuesday.
Sam will file the updated risk register with the security committee.`,
    riskBase: 64,
  });

  return { meetings: [meetA, meetB, meetC, meetD], createdAt: Date.now() };
}

function makeMeeting({ title, date, attendees, risks, decisions, actions, body, riskBase }) {
  const extraction = extractAll(body);
  // align densities to declared ones, then add deterministic risk
  const id = "mtg_" + Math.random().toString(36).slice(2, 9);
  const decisionItems = extraction.decisions.slice(0, decisions).map((t, i) => taskFromText(id, t, "decision", i));
  const actionItems = extraction.actions.slice(0, actions).map((t, i) => taskFromText(id, t, "action", i));
  const riskItems = extraction.risks.slice(0, risks).map((t, i) => taskFromText(id, t, "risk", i));

  const allTasks = [...decisionItems, ...actionItems, ...riskItems];
  // assign statuses: cycle through to make board realistic
  allTasks.forEach((t, i) => {
    t.status = STATUSES[i % 4];
    if (i % 5 === 0) t.status = "in_progress";
    if (i % 7 === 0) t.status = "blocked";
  });
  return {
    id,
    title,
    date,
    attendees,
    body,
    tasks: allTasks,
    riskScore: riskBase,
    createdAt: Date.now() - (Math.floor(Math.random() * 30) + 1) * 86400000,
  };
}

function taskFromText(meetingId, text, kind, idx) {
  const ownerMatch = text.match(/^([A-Z][a-z]+(?:\s[A-Z]\.?)?\s?[A-Z]?[a-z]*)\b/);
  const owner = ownerMatch ? ownerMatch[1].replace(/\s+/g, " ").trim() : "Unassigned";
  const dueMatch = text.match(/\b(by\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|today|tonight|tomorrow|next\s\w+|end\s+of\s+\w+|Friday|EOD))\b/i);
  const due = dueMatch ? dueMatch[2] : null;
  const priority = kind === "risk" ? "high" : kind === "decision" ? "med" : (idx % 3 === 0 ? "high" : idx % 3 === 1 ? "med" : "low");
  return {
    id: meetingId + "_t_" + idx + "_" + Math.random().toString(36).slice(2, 7),
    meetingId,
    text: text.trim(),
    kind, // decision | action | risk
    owner,
    due,
    priority,
    status: "backlog",
  };
}

/* ================================================================
   EXTRACTION LOGIC
   ================================================================ */
function extractAll(body) {
  return {
    attendees: extractAttendees(body),
    decisions: extractByPrefix(body, ["Decided:", "Agreed", "Decision:", "We will", "We agreed", "Concluded"]),
    actions: extractActionItems(body),
    risks: extractByPrefix(body, ["Risk:", "Concern:", "Blocker:", "Issue:", "Critical risk:"]),
    summary: makeSummary(body),
  };
}

function extractAttendees(body) {
  // Look for an "Attendees:" line OR first comma-separated list, OR capitalized names in intro
  const out = new Set();
  const m = body.match(/Attendees\s*[:\-]\s*([^\n]+)/i);
  if (m) {
    m[1].split(/,|;|\band\b|\&/).forEach(n => { const s = n.trim(); if (s.length) out.add(s); });
  }
  // Plus capitalized Name. pairs in first few lines
  const lines = body.split(/\n+/).slice(0, 12);
  lines.forEach(l => {
    const matches = l.match(/\b([A-Z][a-z]+(?:\s[A-Z]\.?)?\s?[A-Z]?[a-z]*)\b/g);
    if (matches) matches.forEach(n => { if (n.length > 3 && n.split(" ").length <= 3) out.add(n); });
  });
  return Array.from(out).slice(0, 12);
}

function extractByPrefix(body, prefixes) {
  const results = [];
  const lines = body.split(/\n+/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const p of prefixes) {
      const re = new RegExp(`(^|\\W)${escapeRegExp(p)}`, "i");
      if (re.test(trimmed)) {
        results.push(trimmed.replace(/\.$/, "").trim());
        break;
      }
    }
  }
  // de-dupe (case-insensitive)
  const seen = new Set();
  return results.filter(x => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractActionItems(body) {
  // patterns: "Name will ..." or bullet "- [ ]" or "TODO:" or "Action: Name to ..."
  const out = [];
  const lines = body.split(/\n+/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // bullets / todos
    if (/^(\-|•|\*|\[\s\]|TODO)\s+/i.test(t)) { out.push(t.replace(/^(\-|•|\*|\[\s\]|TODO)\s+/i, "")); continue; }
    // Action: prefix
    if (/^Action\s*[:\-]/i.test(t)) { out.push(t.replace(/^Action\s*[:\-]\s*/i, "")); continue; }
    // "[Name] will [verb] ..."
    const willMatch = t.match(/^([A-Z][a-z]+(?:\s[A-Z]\.?)?\s?[A-Z]?[a-z]*)\s+(will|to)\s+(.+)/);
    if (willMatch) { out.push(t); continue; }
  }
  // de-dupe
  const seen = new Set();
  return out.filter(x => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function makeSummary(body) {
  const lines = body.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (lines.length === 0) return "No transcript provided.";
  const sents = body.split(/(?<=[.!?])\s+/).filter(s => s.length > 12);
  if (sents.length) {
    const head = sents.slice(0, 2).join(" ");
    const decCount = (body.match(/\b(decided|agreed|decision)\b/gi) || []).length;
    const riskCount = (body.match(/\b(risk|concern|blocker|issue)\b/gi) || []).length;
    const actionCount = (body.match(/\bwill\s+(?!not)\w+/g) || []).length;
    return `${head} The meeting produced ${decCount} decision${decCount === 1 ? "" : "s"}, ${actionCount} action item${actionCount === 1 ? "" : "s"}, and ${riskCount} flagged concern${riskCount === 1 ? "" : "s"}.`;
  }
  return lines.slice(0, 2).join(" ");
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* ================================================================
   RISK PREDICTION
   ================================================================ */
function scoreRisk(meeting) {
  if (typeof meeting.riskScore === "number") return Math.max(0, Math.min(100, meeting.riskScore));
  const body = meeting.body || "";
  const risks = (body.match(/\b(risk|concern|blocker|issue)\b/gi) || []).length;
  const overdue = (meeting.tasks || []).filter(t => t.status !== "done" && t.due).length;
  const opens = (meeting.tasks || []).filter(t => t.status !== "done").length;
  const neg = (body.match(/\b(delay|slip|breach|escalation|critical|blocker|fail|risk)\b/gi) || []).length;
  const score = Math.min(100, risks * 10 + overdue * 8 + opens * 3 + neg * 5);
  return Math.round(score);
}

function riskBand(score) {
  if (score < 30) return { label: "Low", cls: "badge-ok", bar: "risk-low" };
  if (score < 60) return { label: "Medium", cls: "badge-warn", bar: "risk-mid" };
  return { label: "High", cls: "badge-danger", bar: "risk-high" };
}

/* ================================================================
   RENDER — HOME
   ================================================================ */
function renderHome() {
  const meetings = db.meetings;
  const tasks = meetings.flatMap(m => m.tasks || []);
  const opens = tasks.filter(t => t.status !== "done").length;
  const completes = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const risks = meetings.reduce((acc, m) => acc + (m.tasks || []).filter(t => t.kind === "risk").length, 0);
  const completionRate = total ? Math.round((completes / total) * 100) : 0;
  document.getElementById("kpi-meetings").textContent = meetings.length;
  document.getElementById("kpi-open").textContent = opens;
  document.getElementById("kpi-risks").textContent = risks;
  document.getElementById("kpi-complete").textContent = completionRate + "%";

  // recent meetings
  const recent = meetings.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const recentEl = document.getElementById("home-recent");
  if (recent.length === 0) {
    recentEl.innerHTML = '<li class="empty">No meetings yet.</li>';
  } else {
    recentEl.innerHTML = recent.map(m => `
      <li>
        <div class="row between">
          <div>
            <div class="grow"><strong>${escapeHtml(m.title)}</strong></div>
            <div class="muted small">${formatDate(m.date)} · ${m.attendees.length} attendees · ${(m.tasks || []).length} items</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="goToMeetingSummary('${m.id}')">Open →</button>
        </div>
      </li>
    `).join("");
  }

  // top risks across meetings
  const riskList = [];
  meetings.forEach(m => {
    (m.tasks || []).filter(t => t.kind === "risk").slice(0, 2).forEach(t => {
      riskList.push({ m, t, score: scoreRisk(m) });
    });
  });
  riskList.sort((a, b) => b.score - a.score);
  const risksEl = document.getElementById("home-risks");
  if (riskList.length === 0) {
    risksEl.innerHTML = '<li class="empty">No risks flagged yet.</li>';
  } else {
    risksEl.innerHTML = riskList.slice(0, 6).map(({ m, t, score }) => {
      const b = riskBand(score);
      return `<li>
        <div class="row between">
          <div class="grow">${escapeHtml(t.text)}</div>
          <span class="badge ${b.cls}">${b.label}</span>
        </div>
        <div class="muted small">${escapeHtml(m.title)}</div>
      </li>`;
    }).join("");
  }
}

/* ================================================================
   RENDER — UPLOAD (interaction)
   ================================================================ */
function switchUploadTab(tab, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("up-tab-file").style.display = tab === "file" ? "" : "none";
  document.getElementById("up-tab-paste").style.display = tab === "paste" ? "" : "none";
  document.getElementById("up-tab-sample").style.display = tab === "sample" ? "" : "none";
  // reset dropzone when leaving
  if (tab === "file") {
    document.getElementById("dz").classList.remove("over");
  }
}

function setupDropzone() {
  const dz = document.getElementById("dz");
  const fi = document.getElementById("up-file");
  ["dragenter","dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave","drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("over"); }));
  dz.addEventListener("drop", e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fi.addEventListener("change", e => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById("up-text").value = ev.target.result;
    if (!document.getElementById("up-title").value) {
      document.getElementById("up-title").value = file.name.replace(/\.[^.]+$/, "");
    }
    showToast("Loaded " + file.name);
    // also switch view to preview
    switchUploadTab("paste", document.querySelector('[data-tab="paste"]'));
  };
  reader.readAsText(file);
}

function refreshSampleDropdown() {
  const sel = document.getElementById("up-sample");
  if (!sel) return;
  const samples = [
    { title: "Engineering postmortem — incident #214", body: `Attendees: Priya R., Marcus L., Devon B., Lin H.
Decision: ship the new runbook to all customers next week.
Decision: add a circuit breaker on the vendor integration.
Risk: the incident our runbook does not yet cover multi-region failover.
Concern: we still lack an on-call rotation for the new mobile web team.
Priya will draft the postmortem doc by Friday.
Marcus will write the circuit-breaker design doc by Tuesday.
Devon will set up an on-call rotation document.
Lin will publish the postmortem once reviewed.` },
    { title: "Pricing & packaging workshop", body: `Attendees: Elena V., Jordan K., Sam T.
Decision: launch the Pro tier at $39 per seat.
Decision: keep the Starter tier free for up to 3 users.
Elena will draft the pricing page copy.
Jordan will coordinate the launch announcement.
Sam will set up the billing integration for the Pro tier.
Risk: Stripe tax calculation is not yet supported in EU regions.` }
  ];
  sel.innerHTML = samples.map((s,i) => `<option value="${i}">${escapeHtml(s.title)}</option>`).join("");
  sel.onchange = () => {
    const s = samples[sel.value];
    document.getElementById("up-title").value = s.title;
    document.getElementById("up-text").value = s.body;
  };
  // pre-fill first by default
  const first = samples[0];
  if (first) {
    document.getElementById("up-title").value = first.title;
    document.getElementById("up-text").value = first.body;
  }
}

function clearUpload() {
  document.getElementById("up-title").value = "";
  document.getElementById("up-text").value = "";
  document.getElementById("up-result-card").style.display = "none";
  document.getElementById("up-status").textContent = "";
}

function processUpload() {
  const title = (document.getElementById("up-title").value || "").trim() || "Untitled meeting";
  const date = document.getElementById("up-date").value || new Date().toISOString().slice(0,10);
  const body = (document.getElementById("up-text").value || "").trim();
  if (!body) { showToast("Add some meeting text first."); return; }
  const ex = extractAll(body);
  const id = "mtg_" + Date.now();
  const tasks = [];
  ex.decisions.forEach((t, i) => tasks.push(taskFromText(id, t, "decision", i)));
  ex.actions.forEach((t, i) => tasks.push(taskFromText(id, t, "action", i + 100)));
  ex.risks.forEach((t, i) => tasks.push(taskFromText(id, t, "risk", i + 200)));
  const meeting = { id, title, date, attendees: ex.attendees, body: body, tasks, createdAt: Date.now() };
  meeting.riskScore = scoreRisk(meeting);
  db.meetings.push(meeting);
  saveDB();
  showUploadResult(meeting, ex);
  showToast("Meeting saved · risk " + meeting.riskScore);
  refreshSampleDropdown();
}

function showUploadResult(meeting, ex) {
  document.getElementById("up-result-card").style.display = "";
  document.getElementById("up-result-title").textContent = meeting.title + " — " + formatDate(meeting.date);
  document.getElementById("up-result-attendees").innerHTML = ex.attendees.length
    ? ex.attendees.map(a => `<span class="pill">${escapeHtml(a)}</span>`).join("")
    : '<span class="muted small">No attendees detected.</span>';
  document.getElementById("up-result-decisions").textContent = ex.decisions.length + " decisions";
  document.getElementById("up-result-actions").textContent = ex.actions.length + " actions";
  document.getElementById("up-result-risks").textContent = ex.risks.length + " risks";
  document.getElementById("up-result-d-list").innerHTML = bulletList(ex.decisions);
  document.getElementById("up-result-a-list").innerHTML = bulletList(ex.actions);
  document.getElementById("up-result-r-list").innerHTML = bulletList(ex.risks);
  const r = riskBand(meeting.riskScore);
  document.getElementById("up-result-rating").innerHTML = `<span class="badge ${r.cls}">Risk ${meeting.riskScore} · ${r.label}</span>`;
}

/* ================================================================
   RENDER — SUMMARY
   ================================================================ */
function refreshSummaryPicker() {
  const sel = document.getElementById("sum-pick");
  if (!sel) return;
  const opts = db.meetings.slice().sort((a,b) => b.createdAt - a.createdAt).map(m => `<option value="${m.id}">${escapeHtml(m.title)} · ${formatDate(m.date)}</option>`).join("");
  sel.innerHTML = opts;
}

function renderSummary() {
  refreshSummaryPicker();
  const sel = document.getElementById("sum-pick");
  if (!sel.value) {
    document.getElementById("sum-empty").style.display = "";
    document.getElementById("sum-content").style.display = "none";
    return;
  }
  const m = db.meetings.find(x => x.id === sel.value);
  if (!m) return;
  document.getElementById("sum-empty").style.display = "none";
  document.getElementById("sum-content").style.display = "";
  document.getElementById("sum-title").textContent = m.title;
  document.getElementById("sum-meta").textContent = formatDate(m.date) + " · " + m.attendees.length + " attendees · " + (m.tasks || []).length + " items extracted";
  document.getElementById("sum-text").textContent = makeSummary(m.body);
  document.getElementById("sum-attendees").innerHTML = m.attendees.length
    ? m.attendees.map(a => `<span class="pill">${escapeHtml(a)}</span>`).join("")
    : '<span class="muted small">No attendees detected.</span>';
  const decisions = (m.tasks || []).filter(t => t.kind === "decision").map(t => t.text);
  const actions = (m.tasks || []).filter(t => t.kind === "action").map(t => t.text);
  const risks = (m.tasks || []).filter(t => t.kind === "risk").map(t => t.text);
  document.getElementById("sum-d").innerHTML = bulletList(decisions);
  document.getElementById("sum-a").innerHTML = bulletList(actions);
  document.getElementById("sum-r").innerHTML = bulletList(risks);
  const r = riskBand(scoreRisk(m));
  document.getElementById("sum-rating").innerHTML = `<span class="badge ${r.cls}">Risk ${scoreRisk(m)} · ${r.label}</span>`;
}

function goToMeetingSummary(id) {
  refreshSummaryPicker();
  document.getElementById("sum-pick").value = id;
  navigateTo("summary");
}

/* ================================================================
   RENDER — BOARD
   ================================================================ */
function renderBoard() {
  const tasks = db.meetings.flatMap(m => (m.tasks || []).map(t => ({ ...t, meetingTitle: m.title })));
  for (let i = 0; i < STATUSES.length; i++) {
    const col = STATUSES[i];
    const list = tasks.filter(t => t.status === col);
    document.getElementById("col-" + i + "-count").textContent = list.length;
    document.getElementById("col-" + i).innerHTML = list.length
      ? list.map(t => boardCard(t)).join("")
      : `<div class="muted small" style="padding:12px 4px">No items.</div>`;
  }
}

function boardCard(t) {
  const pr = t.priority === "high" ? "danger" : t.priority === "med" ? "warn" : "muted";
  return `<div class="kanban-card" id="kc-${t.id}">
    <div class="kc-title">${escapeHtml(t.text)}</div>
    <div class="kc-meta">
      <span>${escapeHtml(t.owner)}</span>
      <span class="badge badge-${pr}">${t.priority}</span>
    </div>
    <div class="kc-meta">
      <span>${escapeHtml(t.meetingTitle)}</span>
      <span>${t.due ? escapeHtml(t.due) : ""}</span>
    </div>
    <div class="kc-actions">
      ${STATUSES.map((s,idx) => idx === STATUSES.indexOf(t.status) ? "" : `<button class="btn btn-sm" onclick="moveTask('${t.id}','${s}')">→ ${STATUS_LABEL[s]}</button>`).join("")}
    </div>
  </div>`;
}

function moveTask(taskId, newStatus) {
  for (const m of db.meetings) {
    const t = (m.tasks || []).find(x => x.id === taskId);
    if (t) { t.status = newStatus; break; }
  }
  saveDB();
  renderBoard();
  showToast("Moved → " + STATUS_LABEL[newStatus]);
}

/* ================================================================
   RENDER — TASKS
   ================================================================ */
function renderTasks() {
  const status = document.getElementById("task-filter-status").value;
  const priority = document.getElementById("task-filter-priority").value;
  const q = (document.getElementById("task-filter-q").value || "").toLowerCase();
  const all = [];
  db.meetings.forEach(m => (m.tasks || []).forEach(t => all.push({ ...t, meetingTitle: m.title })));
  const filtered = all.filter(t => {
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (q && !((t.text || "").toLowerCase().includes(q) || (t.owner || "").toLowerCase().includes(q))) return false;
    return true;
  });
  const tbody = document.getElementById("task-rows");
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">No tasks match.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(t => {
    const pr = t.priority === "high" ? "danger" : t.priority === "med" ? "warn" : "muted";
    const st = t.status === "done" ? "ok" : t.status === "blocked" ? "danger" : t.status === "in_progress" ? "info" : "muted";
    return `<tr>
      <td>${escapeHtml(t.text)}</td>
      <td>${escapeHtml(t.owner)}</td>
      <td><span class="badge badge-${pr}">${t.priority}</span></td>
      <td><span class="badge badge-${st}">${STATUS_LABEL[t.status]}</span></td>
      <td class="nowrap">${t.due ? escapeHtml(t.due) : '<span class="muted">—</span>'}</td>
      <td class="muted">${escapeHtml(t.meetingTitle)}</td>
      <td class="nowrap">
        ${STATUSES.map(s => s !== t.status ? `<button class="btn btn-sm btn-ghost" onclick="moveTask('${t.id}','${s}')">→ ${s === 'in_progress' ? 'IP' : s === 'done' ? '✓' : s === 'blocked' ? 'B' : 'Bkl'}</button>` : '').join("")}
      </td>
    </tr>`;
  }).join("");
}

/* ================================================================
   RENDER — DASHBOARD
   ================================================================ */
function destroyChart(k) { if (charts[k]) { charts[k].destroy(); charts[k] = null; } }

function renderDashboard() {
  const meetings = db.meetings;
  const tasks = meetings.flatMap(m => m.tasks || []);
  const opens = tasks.filter(t => t.status !== "done").length;
  const completes = tasks.filter(t => t.status === "done").length;
  const avg = meetings.length ? Math.round(meetings.reduce((a,m) => a + scoreRisk(m), 0) / meetings.length) : 0;
  document.getElementById("d-meetings").textContent = meetings.length;
  document.getElementById("d-open").textContent = opens;
  document.getElementById("d-avg-risk").textContent = avg;
  document.getElementById("d-completion").textContent = (tasks.length ? Math.round((completes/tasks.length)*100) : 0) + "%";

  // tasks per meeting bar
  destroyChart("perMtg");
  const ctx1 = document.getElementById("c-per-mtg").getContext("2d");
  charts.perMtg = new Chart(ctx1, {
    type: "bar",
    data: {
      labels: meetings.map(m => trim(m.title, 18)),
      datasets: [{
        label: "Tasks",
        data: meetings.map(m => (m.tasks || []).length),
        backgroundColor: "#b88a2e",
        borderRadius: 6,
      }]
    },
    options: chartOpts(false)
  });

  // risk distribution (doughnut)
  destroyChart("riskDist");
  const buckets = { Low: 0, Medium: 0, High: 0 };
  meetings.forEach(m => { buckets[riskBand(scoreRisk(m)).label]++; });
  const ctx2 = document.getElementById("c-risk-dist").getContext("2d");
  charts.riskDist = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: Object.keys(buckets),
      datasets: [{ data: Object.values(buckets), backgroundColor: ["#5c7a53","#c2853f","#b04a3a"], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  // tasks by status
  destroyChart("status");
  const byStatus = STATUSES.map(s => tasks.filter(t => t.status === s).length);
  const ctx3 = document.getElementById("c-status").getContext("2d");
  charts.status = new Chart(ctx3, {
    type: "bar",
    data: {
      labels: STATUSES.map(s => STATUS_LABEL[s]),
      datasets: [{ data: byStatus, backgroundColor: ["#6f6658","#3b6ea5","#b04a3a","#5c7a53"], borderRadius: 6 }]
    },
    options: chartOpts(true)
  });

  // top at-risk meetings
  const top = meetings.slice()
    .map(m => ({ m, score: scoreRisk(m), taskCount: (m.tasks || []).length, riskCount: (m.tasks || []).filter(t => t.kind === "risk").length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const rrows = document.getElementById("d-risk-rows");
  if (top.length === 0 || (top[0].taskCount === 0)) {
    rrows.innerHTML = `<tr><td colspan="6" class="empty">Upload a meeting to see at-risk signals.</td></tr>`;
  } else {
    rrows.innerHTML = top.map(({ m, score, taskCount, riskCount }) => {
      const b = riskBand(score);
      return `<tr>
        <td><strong>${escapeHtml(m.title)}</strong></td>
        <td class="nowrap">${formatDate(m.date)}</td>
        <td>${taskCount}</td>
        <td>${riskCount}</td>
        <td>
          <div class="row" style="gap:8px">
            <span class="badge ${b.cls}">${score} · ${b.label}</span>
            <div class="risk-meter" style="flex:1"><div class="risk-bar ${b.bar}" style="width:${score}%"></div></div>
          </div>
        </td>
        <td><button class="btn btn-sm" onclick="goToMeetingSummary('${m.id}')">Open →</button></td>
      </tr>`;
    }).join("");
  }
}

function chartOpts(horizontal) {
  return {
    indexAxis: horizontal ? "y" : "x",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false } }, y: { grid: { color: "#ece6da" }, beginAtZero: true, ticks: { precision: 0 } } }
  };
}

/* ================================================================
   UTIL
   ================================================================ */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}
function trim(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function formatDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" }); } catch(e) { return d; }
}
function bulletList(arr) {
  if (!arr || !arr.length) return '<li class="empty">—</li>';
  return arr.map(x => `<li>${escapeHtml(x)}</li>`).join("");
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
function resetSampleData() {
  if (!confirm("Reset all data to sample meetings?")) return;
  localStorage.removeItem(DB_KEY);
  db = seedData();
  saveDB();
  navigateTo(currentSection);
  showToast("Sample data restored.");
}

/* ================================================================
   BOOT
   ================================================================ */
(function boot() {
  setupDropzone();
  refreshSampleDropdown();
  // initial section from hash, default home
  const initial = (location.hash || "#home").slice(1);
  navigateTo(initial);
})();
