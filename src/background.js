chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(['jdaEnabled'], (result) => {
    const isEnabled = result.hasOwnProperty('jdaEnabled') ? result.jdaEnabled : true;

    if (!isEnabled) {
      suggest(); 
      return;
    }

    chrome.downloads.cancel(item.id);
    
    chrome.downloads.erase({ id: item.id });

    const baseUrl = "jda://";
    const params = new URLSearchParams({
      url: item.finalUrl || item.url,
      name: item.filename,
      size: item.fileSize,
      resume: (item.canResume || (item.fileSize > 0)) ? "true" : "false"
    });

    const deepLink = baseUrl + "?" + params.toString();

    chrome.tabs.update({ url: deepLink });
  });

  return true; 
});