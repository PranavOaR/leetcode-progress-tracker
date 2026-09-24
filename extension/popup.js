const defaults = {
  siteUrl: "http://localhost:3000",
  profileUrl: "",
  snapshot: null,
};

const $ = (id) => document.getElementById(id);
const storage = chrome.storage.local;

function normaliseSiteUrl(value) {
  return value.trim().replace(/\/$/, "") || defaults.siteUrl;
}

function extractUsername(value) {
  const input = value.trim();
  const match = input.match(/leetcode\.com\/u\/([^/?#]+)/i) || input.match(/leetcode\.com\/([^/?#]+)/i);
  return decodeURIComponent(match?.[1] || input.replace(/^@/, ""));
}

function showMessage(value, ready = false) {
  $("message").textContent = value;
  $("status-dot").classList.toggle("ready", ready);
}

function render(snapshot) {
  $("metrics").hidden = !snapshot;
  $("send").disabled = !snapshot;
  if (!snapshot) return;
  $("solved").textContent = snapshot.stats.solved;
  $("streak").textContent = `${snapshot.stats.streak}d`;
  $("topics").textContent = snapshot.stats.topicStats.length;
  $("recent").textContent = snapshot.recentProblems.length;
}

async function load() {
  const saved = await storage.get(defaults);
  $("site-url").value = saved.siteUrl;
  if (saved.profileUrl) {
    $("profile-url").value = saved.profileUrl;
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url?.match(/^https:\/\/leetcode\.com\/u\/[^/?#]+/i)) $("profile-url").value = activeTab.url;
  }
  render(saved.snapshot);
  if (saved.snapshot) showMessage(`Last synced ${new Date(saved.snapshot.capturedAt).toLocaleString()}`, true);
}

$("sync").addEventListener("click", async () => {
  const siteUrl = normaliseSiteUrl($("site-url").value);
  const profileUrl = $("profile-url").value.trim();
  const username = extractUsername(profileUrl);
  if (!username || !/^[a-zA-Z0-9_-]{1,40}$/.test(username)) {
    showMessage("Enter a valid public LeetCode profile URL.");
    return;
  }
  showMessage("Fetching your profile…");
  $("sync").disabled = true;
  try {
    const response = await fetch(`${siteUrl}/api/leetcode/profile?username=${encodeURIComponent(username)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "LeetCode profile could not be loaded.");
    const snapshot = {
      username: payload.username,
      profileUrl: `https://leetcode.com/u/${payload.username}/`,
      capturedAt: new Date().toISOString(),
      stats: payload.stats,
      recentProblems: payload.recentProblems || [],
    };
    await storage.set({ siteUrl, profileUrl, snapshot });
    render(snapshot);
    showMessage(`Synced ${payload.username}. Ready to send to Brainstorm.`, true);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Sync failed. Check the Brainstorm site URL.");
  } finally {
    $("sync").disabled = false;
  }
});

$("send").addEventListener("click", async () => {
  const saved = await storage.get(defaults);
  if (!saved.snapshot) return;
  await storage.set({ "brainstorm-pending-snapshot": saved.snapshot });
  await chrome.tabs.create({ url: `${normaliseSiteUrl(saved.siteUrl)}/extension/import` });
  showMessage("Import page opened. Review and confirm the snapshot there.", true);
});

$("open").addEventListener("click", async () => {
  const saved = await storage.get(defaults);
  await chrome.tabs.create({ url: normaliseSiteUrl(saved.siteUrl) });
});

load();
