// Ghost Tab v1 - background.js

function normalizeUrl(url) {
  if (!url) return null;
  url = url.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try { new URL(url); return url; } catch { return null; }
}

// ── Mode 1: Ghost Sessions (incognito launchers) ───────────────────────────────

async function getGhostSessions() {
  const r = await chrome.storage.local.get("ghostSessions");
  return r.ghostSessions || [];
}

async function saveGhostSessions(sessions) {
  await chrome.storage.local.set({ ghostSessions: sessions });
}

async function createGhostSession(name, urls) {
  const sessions = await getGhostSessions();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const session = { id, name, urls: urls.filter(Boolean), createdAt: Date.now() };
  sessions.push(session);
  await saveGhostSessions(sessions);
  return session;
}

async function deleteGhostSession(id) {
  const sessions = await getGhostSessions();
  await saveGhostSessions(sessions.filter(s => s.id !== id));
}

async function updateGhostSession(id, name, urls) {
  const sessions = await getGhostSessions();
  const s = sessions.find(s => s.id === id);
  if (s) { s.name = name; s.urls = urls.filter(Boolean); }
  await saveGhostSessions(sessions);
}

function launchGhostSession(urls) {
  // Open all URLs as tabs inside one new incognito window
  const valid = urls.map(normalizeUrl).filter(Boolean);
  if (!valid.length) valid.push(undefined); // blank incognito window
  chrome.windows.create({ incognito: true, focused: true, url: valid });
}

// ── Mode 2: Workspaces (persistent tab groups) ────────────────────────────────

async function getWorkspaces() {
  const r = await chrome.storage.local.get("workspaces");
  return r.workspaces || [];
}

async function saveWorkspaces(ws) {
  await chrome.storage.local.set({ workspaces: ws });
}

async function createWorkspace(name, urls) {
  const ws = await getWorkspaces();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const workspace = { id, name, urls: urls.filter(Boolean), createdAt: Date.now() };
  ws.push(workspace);
  await saveWorkspaces(ws);
  return workspace;
}

async function deleteWorkspace(id) {
  const ws = await getWorkspaces();
  await saveWorkspaces(ws.filter(w => w.id !== id));
}

async function updateWorkspace(id, name, urls) {
  const ws = await getWorkspaces();
  const w = ws.find(w => w.id === id);
  if (w) { w.name = name; w.urls = urls.filter(Boolean); }
  await saveWorkspaces(ws);
}

function launchWorkspace(urls) {
  const valid = urls.map(normalizeUrl).filter(Boolean);
  if (!valid.length) return;
  // Open first URL in a new normal window, rest as additional tabs
  chrome.windows.create({ url: valid, focused: true });
}

// ── Save current tabs to workspace ────────────────────────────────────────────

async function saveCurrentTabs(name) {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs.map(t => t.url).filter(u => u && u.startsWith("http"));
  return createWorkspace(name || "My Workspace", urls);
}

// ── Context menu ──────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: "ghost-open-page",
    title: "Open page in Ghost Tab (incognito)",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: "ghost-open-link",
    title: "Open link in Ghost Tab (incognito)",
    contexts: ["link"]
  });

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/onboarding.html") });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl || tab?.url;
  launchGhostSession([url]);
});

// ── Message router ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.action) {

    // Ghost sessions
    case "getGhostSessions":
      getGhostSessions().then(sendResponse); return true;

    case "createGhostSession":
      createGhostSession(msg.name, msg.urls).then(sendResponse); return true;

    case "deleteGhostSession":
      deleteGhostSession(msg.id).then(() => sendResponse({ ok: true })); return true;

    case "updateGhostSession":
      updateGhostSession(msg.id, msg.name, msg.urls).then(() => sendResponse({ ok: true })); return true;

    case "launchGhostSession":
      getGhostSessions().then(sessions => {
        const s = sessions.find(s => s.id === msg.id);
        if (s) launchGhostSession(s.urls);
        sendResponse({ ok: true });
      }); return true;

    case "launchGhostUrls":
      launchGhostSession(msg.urls);
      sendResponse({ ok: true }); break;

    // Workspaces
    case "getWorkspaces":
      getWorkspaces().then(sendResponse); return true;

    case "createWorkspace":
      createWorkspace(msg.name, msg.urls).then(sendResponse); return true;

    case "deleteWorkspace":
      deleteWorkspace(msg.id).then(() => sendResponse({ ok: true })); return true;

    case "updateWorkspace":
      updateWorkspace(msg.id, msg.name, msg.urls).then(() => sendResponse({ ok: true })); return true;

    case "launchWorkspace":
      getWorkspaces().then(ws => {
        const w = ws.find(w => w.id === msg.id);
        if (w) launchWorkspace(w.urls);
        sendResponse({ ok: true });
      }); return true;

    case "saveCurrentTabs":
      saveCurrentTabs(msg.name).then(sendResponse); return true;
  }
});
