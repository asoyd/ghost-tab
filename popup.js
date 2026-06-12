// Ghost Tab v1 - popup.js

const $ = id => document.getElementById(id);

// ── Toast ─────────────────────────────────────────────────────────────────────

function toast(msg, color = "#4ade80") {
  const t = $("toast");
  t.textContent = msg;
  t.style.background = color;
  t.style.color = color === "#4ade80" ? "#000" : "#fff";
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ── Messaging ─────────────────────────────────────────────────────────────────

function send(action, data = {}) {
  return new Promise(resolve =>
    chrome.runtime.sendMessage({ action, ...data }, resolve)
  );
}

function normalizeUrl(raw) {
  raw = (raw || "").trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  try { new URL(raw); return raw; } catch { return ""; }
}

function parseUrlLines(text) {
  return text.split("\n")
    .map(l => normalizeUrl(l.trim()))
    .filter(Boolean);
}

// ── Colors ────────────────────────────────────────────────────────────────────

const GHOST_COLORS = ["#7c6aff","#a78bfa","#818cf8","#c084fc","#e879f9"];
const WORK_COLORS  = ["#34d399","#2dd4bf","#4ade80","#86efac","#6ee7b7"];

function colorFor(id, palette) {
  let n = 0;
  for (const c of id) n += c.charCodeAt(0);
  return palette[n % palette.length];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Mode tabs ─────────────────────────────────────────────────────────────────

let currentMode = "ghost";

$("tabGhost").addEventListener("click", () => switchMode("ghost"));
$("tabWork").addEventListener("click",  () => switchMode("work"));

function switchMode(mode) {
  currentMode = mode;
  $("tabGhost").className = "mode-tab" + (mode === "ghost" ? " active-ghost" : "");
  $("tabWork").className  = "mode-tab" + (mode === "work"  ? " active-work"  : "");
  $("panelGhost").classList.toggle("active", mode === "ghost");
  $("panelWork").classList.toggle("active",  mode === "work");
}

// ── Incognito tip ─────────────────────────────────────────────────────────────

// Show a tip banner the first time until user dismisses
chrome.storage.local.get("incognitoTipDismissed", r => {
  if (!r.incognitoTipDismissed) {
    $("incognitoTip").style.display = "block";
  }
});

$("incognitoHelpLink").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/onboarding.html") });
  chrome.storage.local.set({ incognitoTipDismissed: true });
  $("incognitoTip").style.display = "none";
});

// ── Ghost Sessions ────────────────────────────────────────────────────────────

async function renderGhostSessions() {
  const list = $("ghostList");
  const sessions = await send("getGhostSessions");

  if (!sessions || sessions.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-icon">👻</span>
        No ghost sessions yet.<br>
        Hit <strong>+ New</strong> to create one.
      </div>`;
    return;
  }

  list.innerHTML = sessions.map(s => {
    const urlCount = s.urls.length;
    const sub = urlCount === 0
      ? "No URLs saved"
      : urlCount === 1
        ? s.urls[0].replace(/^https?:\/\//, "")
        : `${urlCount} URLs`;
    return `
      <div class="item-card" data-id="${s.id}">
        <div class="item-dot" style="background:${colorFor(s.id, GHOST_COLORS)}"></div>
        <div class="item-info">
          <div class="item-name">${escHtml(s.name)}</div>
          <div class="item-sub">${escHtml(sub)}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn launch-ghost" data-id="${s.id}" title="Launch">↗</button>
          <button class="icon-btn danger del-ghost" data-id="${s.id}" title="Delete">✕</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".item-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".icon-btn")) return;
      send("launchGhostSession", { id: card.dataset.id });
      toast("Ghost session launched 👻");
    });
  });

  list.querySelectorAll(".launch-ghost").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      send("launchGhostSession", { id: btn.dataset.id });
      toast("Ghost session launched 👻");
    });
  });

  list.querySelectorAll(".del-ghost").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await send("deleteGhostSession", { id: btn.dataset.id });
      await renderGhostSessions();
      toast("Deleted", "#ff5c6a");
    });
  });
}

// Quick launch ghost
$("ghostLaunchBtn").addEventListener("click", () => {
  const url = normalizeUrl($("ghostUrlInput").value);
  if (!url) { toast("Enter a valid URL", "#ff5c6a"); return; }
  send("launchGhostUrls", { urls: [url] });
  toast("Ghost tab launched 👻");
  $("ghostUrlInput").value = "";
});

$("ghostUrlInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("ghostLaunchBtn").click();
});

// Ghost modal
$("addGhostBtn").addEventListener("click", () => {
  $("ghostName").value = "";
  $("ghostUrls").value = "";
  $("ghostModal").classList.add("open");
  setTimeout(() => $("ghostName").focus(), 50);
});

$("ghostCancelBtn").addEventListener("click", () => $("ghostModal").classList.remove("open"));
$("ghostModal").addEventListener("click", e => {
  if (e.target === $("ghostModal")) $("ghostModal").classList.remove("open");
});

$("ghostSaveBtn").addEventListener("click", async () => {
  const name = $("ghostName").value.trim();
  const urls = parseUrlLines($("ghostUrls").value);
  if (!name) { toast("Give this session a name", "#ff5c6a"); return; }

  const session = await send("createGhostSession", { name, urls });
  $("ghostModal").classList.remove("open");
  await renderGhostSessions();

  if (urls.length > 0) {
    send("launchGhostUrls", { urls });
    toast(`"${name}" launched 👻`);
  } else {
    toast(`"${name}" saved`);
  }
});

[$("ghostName"), $("ghostUrls")].forEach(el =>
  el.addEventListener("keydown", e => { if (e.key === "Enter" && e.ctrlKey) $("ghostSaveBtn").click(); })
);

// ── Workspaces ────────────────────────────────────────────────────────────────

async function renderWorkspaces() {
  const list = $("workList");
  const ws = await send("getWorkspaces");

  if (!ws || ws.length === 0) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🗂</span>
        No workspaces yet.<br>
        Hit <strong>+ New</strong> or save your current tabs.
      </div>`;
    return;
  }

  list.innerHTML = ws.map(w => {
    const urlCount = w.urls.length;
    const sub = urlCount === 0
      ? "No URLs saved"
      : urlCount === 1
        ? w.urls[0].replace(/^https?:\/\//, "")
        : `${urlCount} tabs`;
    return `
      <div class="item-card" data-id="${w.id}">
        <div class="item-dot" style="background:${colorFor(w.id, WORK_COLORS)}"></div>
        <div class="item-info">
          <div class="item-name">${escHtml(w.name)}</div>
          <div class="item-sub">${escHtml(sub)}</div>
        </div>
        <div class="item-actions">
          <button class="icon-btn launch-work" data-id="${w.id}" title="Open">↗</button>
          <button class="icon-btn danger del-work" data-id="${w.id}" title="Delete">✕</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".item-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest(".icon-btn")) return;
      send("launchWorkspace", { id: card.dataset.id });
      toast("Workspace opened 🗂");
    });
  });

  list.querySelectorAll(".launch-work").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      send("launchWorkspace", { id: btn.dataset.id });
      toast("Workspace opened 🗂");
    });
  });

  list.querySelectorAll(".del-work").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      await send("deleteWorkspace", { id: btn.dataset.id });
      await renderWorkspaces();
      toast("Deleted", "#ff5c6a");
    });
  });
}

// Quick launch workspace
$("workLaunchBtn").addEventListener("click", () => {
  const url = normalizeUrl($("workUrlInput").value);
  if (!url) { toast("Enter a valid URL", "#ff5c6a"); return; }
  chrome.windows.create({ url, focused: true });
  toast("Opened in new window 🗂");
  $("workUrlInput").value = "";
});

$("workUrlInput").addEventListener("keydown", e => {
  if (e.key === "Enter") $("workLaunchBtn").click();
});

// Save current tabs
$("saveTabsBtn").addEventListener("click", async () => {
  const name = prompt("Name for this workspace?");
  if (!name) return;
  await send("saveCurrentTabs", { name: name.trim() });
  await renderWorkspaces();
  toast(`"${name}" saved 📌`);
});

// Workspace modal
$("addWorkBtn").addEventListener("click", () => {
  $("workName").value = "";
  $("workUrls").value = "";
  $("workModal").classList.add("open");
  setTimeout(() => $("workName").focus(), 50);
});

$("workCancelBtn").addEventListener("click", () => $("workModal").classList.remove("open"));
$("workModal").addEventListener("click", e => {
  if (e.target === $("workModal")) $("workModal").classList.remove("open");
});

$("workSaveBtn").addEventListener("click", async () => {
  const name = $("workName").value.trim();
  const urls = parseUrlLines($("workUrls").value);
  if (!name) { toast("Give this workspace a name", "#ff5c6a"); return; }

  const workspace = await send("createWorkspace", { name, urls });
  $("workModal").classList.remove("open");
  await renderWorkspaces();

  if (urls.length > 0) {
    send("launchWorkspace", { id: workspace.id });
    toast(`"${name}" opened 🗂`);
  } else {
    toast(`"${name}" saved`);
  }
});

[$("workName"), $("workUrls")].forEach(el =>
  el.addEventListener("keydown", e => { if (e.key === "Enter" && e.ctrlKey) $("workSaveBtn").click(); })
);

// ── Help ──────────────────────────────────────────────────────────────────────

$("helpBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("pages/onboarding.html") });
});

// ── Init ──────────────────────────────────────────────────────────────────────

renderGhostSessions();
renderWorkspaces();
