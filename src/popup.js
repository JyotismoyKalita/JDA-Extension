function updateUI(isEnabled) {
  const statusText = document.getElementById("status-text");

  if (statusText) {
    statusText.innerText = isEnabled ? "Accelerator Active" : "Accelerator Off";
    statusText.style.color = isEnabled ? "#00d2ff" : "#888888";
  }
}

function updateLastStatus(result) {
  const lastStatus = document.getElementById("last-status");
  if (!lastStatus) return;

  const status = result.jdaLastStatus || "Waiting for downloads";
  const detail = result.jdaLastDetail ? ` - ${result.jdaLastDetail}` : "";
  const at = result.jdaLastAt ? ` (${result.jdaLastAt})` : "";

  lastStatus.innerText = `${status}${detail}${at}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("power-toggle");

  chrome.storage.local.get(
    ["jdaEnabled", "jdaLastStatus", "jdaLastDetail", "jdaLastAt"],
    (result) => {
      const isEnabled = Object.prototype.hasOwnProperty.call(result, "jdaEnabled")
        ? result.jdaEnabled
        : true;

      if (toggle) toggle.checked = isEnabled;
      updateUI(isEnabled);
      updateLastStatus(result);
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    chrome.storage.local.get(
      ["jdaLastStatus", "jdaLastDetail", "jdaLastAt"],
      updateLastStatus
    );
  });

  if (toggle) {
    toggle.addEventListener("change", () => {
      const isEnabled = toggle.checked;
      chrome.storage.local.set({ jdaEnabled: isEnabled });
      updateUI(isEnabled);
    });
  }
});
