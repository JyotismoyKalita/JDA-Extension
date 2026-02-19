function updateUI(isEnabled) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.innerText = isEnabled ? "Accelerator Active" : "Accelerator Off";
        statusText.style.color = isEnabled ? "#00d2ff" : "#888888";
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('power-toggle');

    chrome.storage.local.get(['jdaEnabled'], (result) => {
        const isEnabled = result.hasOwnProperty('jdaEnabled') ? result.jdaEnabled : true;
        if (toggle) toggle.checked = isEnabled;
        updateUI(isEnabled);
    });

    if (toggle) {
        toggle.addEventListener('change', () => {
            const isEnabled = toggle.checked;
            chrome.storage.local.set({ jdaEnabled: isEnabled });
            updateUI(isEnabled);
        });
    }
});