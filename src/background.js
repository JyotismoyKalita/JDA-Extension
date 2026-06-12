chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(['jdaEnabled'], (result) => {
    const isEnabled = result.hasOwnProperty('jdaEnabled') ? result.jdaEnabled : true;

    if (!isEnabled) {
      suggest(); 
      return;
    }

    chrome.downloads.cancel(item.id);
    chrome.downloads.erase({ id: item.id });

    // Extract the cookies for the specific download URL
    const targetUrl = item.finalUrl || item.url;
    chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      // Determine the Referer. Since we're in a background service worker, item doesn't have referer directly.
      // But we can usually grab it from the active tab if it matches, or from the item.referrer.
      const referer = item.referrer || "";

      const payload = {
        url: targetUrl,
        name: item.filename,
        size: item.fileSize || 0,
        resume: (item.canResume || (item.fileSize > 0)) ? "true" : "false",
        cookie: cookieStr,
        userAgent: navigator.userAgent,
        referer: referer
      };

      fetch("http://127.0.0.1:14732/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }).then(res => {
        if (!res.ok) {
            console.error("JDA server responded with an error");
            // Optionally fallback to deep link if the server is off
        }
      }).catch(err => {
        console.error("Failed to connect to JDA local server. Is JDA running?", err);
        // Fallback to deep link if the local server is totally unreachable
        const params = new URLSearchParams(payload);
        chrome.tabs.update({ url: "jda://" + "?" + params.toString() });
      });
    });
  });

  return true; // Required to keep the message channel open for async operations
});