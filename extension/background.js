const pendingKey = "brainstorm-pending-snapshot";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PENDING_SNAPSHOT") {
    chrome.storage.local.get([pendingKey]).then((result) => {
      sendResponse({ snapshot: result[pendingKey] || null });
    });
    return true;
  }
  if (message?.type === "IMPORT_COMPLETE") {
    chrome.storage.local.remove(pendingKey);
  }
  return false;
});
