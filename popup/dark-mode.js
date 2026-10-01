/* Dark reading mode: the header toggle turns the currently active page dark
   via chrome.scripting (the activeTab grant from opening the popup covers the
   tab it was opened on). Sites the extension already has host access to
   (Medium and sites added in Settings) remember the choice in storage.local
   and the background worker re-applies it on navigation. On other sites
   Chrome is asked once for standing access so it can stick too; a denial
   keeps dark mode session-only and never asks again for that site. 
*/

const THEME_KEY = "pageTheme";
const ASKED_KEY = "pageThemeAsked";
const darkToggle = document.getElementById("darkToggle");

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

// Mirrors sitePermissionOrigins() in background.js so a grant earned here
// also satisfies the Add-site flow (and vice versa).
function sitePermissionOrigins(host) {
  const origins = [`https://${host}/*`, `http://${host}/*`];
  if (host.includes(".") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) && !host.startsWith("[")) {
    origins.push(`https://*.${host}/*`, `http://*.${host}/*`);
  }
  return origins;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function pageIsDark(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.classList.contains("ms-page-dark"),
  });
  return Boolean(results && results[0] && results[0].result);
}

function setToggle(on) {
  darkToggle.textContent = on ? "☀️" : "🌙";
  darkToggle.title = on ? "Back to light on this page" : "Dark mode for this page";
  darkToggle.classList.toggle("on", on);
}

async function applyDark(tabId) {
  // insertCSS may stack a duplicate stylesheet after on/off cycles —
  // harmless, the rules are identical and class-gated.
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content/darkpage.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.classList.add("ms-page-dark"),
  });
}

async function removeDark(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.classList.remove("ms-page-dark"),
  });
}

async function rememberTheme(host, dark) {
  if (!host) return;
  const { pageTheme = {}, pageThemeAsked = {} } = await chrome.storage.local.get([
    THEME_KEY,
    ASKED_KEY,
  ]);
  if (!dark) {
    pageTheme[host] = false;
    await chrome.storage.local.set({ [THEME_KEY]: pageTheme });
    return;
  }

  let allowed = false;
  try {
    allowed = await chrome.permissions.contains({ origins: sitePermissionOrigins(host) });
  } catch (e) { /* permissions API unavailable — stay session-only */ }
  if (!allowed && !pageThemeAsked[host]) {
    try {
      allowed = await chrome.permissions.request({ origins: sitePermissionOrigins(host) });
    } catch (e) {
      return; // user gesture lost — leave session-only; try asking again next time
    }
    pageThemeAsked[host] = true;
  }
  if (allowed) pageTheme[host] = true;
  await chrome.storage.local.set({ [THEME_KEY]: pageTheme, [ASKED_KEY]: pageThemeAsked });
}

darkToggle.addEventListener("click", async () => {
  const tab = await activeTab();
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  const isDark = await pageIsDark(tab.id).catch(() => false);
  try {
    if (!isDark) await applyDark(tab.id);
    else await removeDark(tab.id);
  } catch (e) {
    return; 
  }
  await rememberTheme(hostOf(tab.url), !isDark);
  setToggle(!isDark);
});

(async () => {
  const tab = await activeTab();
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) return;
  setToggle(await pageIsDark(tab.id).catch(() => false));
})();
