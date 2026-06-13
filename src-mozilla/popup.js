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

document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("power-toggle");

  try {
    const result = await browser.storage.local.get([
      "jdaEnabled",
      "jdaLastStatus",
      "jdaLastDetail",
      "jdaLastAt"
    ]);

    const isEnabled = Object.prototype.hasOwnProperty.call(result, "jdaEnabled")
      ? result.jdaEnabled
      : true;

    if (toggle) toggle.checked = isEnabled;
    updateUI(isEnabled);
    updateLastStatus(result);
  } catch (error) {
    console.error("Error retrieving JDA storage configuration:", error);
  }

  browser.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;

    try {
      const result = await browser.storage.local.get([
        "jdaLastStatus",
        "jdaLastDetail",
        "jdaLastAt"
      ]);
      updateLastStatus(result);
    } catch (error) {
      console.error("Error updating status on storage change:", error);
    }
  });

  if (toggle) {
    toggle.addEventListener("change", async () => {
      const isEnabled = toggle.checked;
      try {
        await browser.storage.local.set({ jdaEnabled: isEnabled });
        updateUI(isEnabled);
      } catch (error) {
        console.error("Error setting JDA enabled state:", error);
      }
    });
  }
});
