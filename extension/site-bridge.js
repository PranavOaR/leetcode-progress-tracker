chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PENDING_SNAPSHOT" && message.snapshot) {
    window.postMessage({ source: "brainstorm-extension", type: "SNAPSHOT", snapshot: message.snapshot }, "*");
  }
});

function requestSnapshot() {
  chrome.runtime.sendMessage({ type: "GET_PENDING_SNAPSHOT" }, (response) => {
    if (response?.snapshot) {
      window.postMessage({ source: "brainstorm-extension", type: "SNAPSHOT", snapshot: response.snapshot }, "*");
    }
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== "brainstorm-site") return;
  if (event.data.type === "REQUEST_PENDING_SNAPSHOT") requestSnapshot();
  if (event.data.type === "IMPORT_COMPLETE") chrome.runtime.sendMessage({ type: "IMPORT_COMPLETE" });
});

requestSnapshot();
