const JDA_ENDPOINT = "http://127.0.0.1:14732/download";
const REQUEST_TTL_MS = 2 * 60 * 1000;
const FALLBACK_INTERCEPT_DELAY_MS = 500;

const requestsById = new Map();
const requestsByUrl = new Map();
const handledDownloadIds = new Set();

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url || "";
  }
}

function headerArrayToObject(headers = []) {
  const result = {};

  for (const header of headers) {
    if (!header.name) continue;
    result[header.name.toLowerCase()] = header.value || "";
  }

  return result;
}

function getHeader(headers, name) {
  return headers?.[name.toLowerCase()] || "";
}

function parseContentRange(value) {
  if (!value) return 0;

  const match = value.match(/bytes\s+\d+-\d+\/(\d+|\*)/i);
  if (!match || match[1] === "*") return 0;

  const total = Number.parseInt(match[1], 10);
  return Number.isFinite(total) ? total : 0;
}

function parseContentLength(value) {
  if (!value) return 0;

  const size = Number.parseInt(value, 10);
  return Number.isFinite(size) && size > 0 ? size : 0;
}

function isResumeSupported(record) {
  const responseHeaders = record?.responseHeaders || {};
  const acceptRanges = getHeader(responseHeaders, "accept-ranges").toLowerCase();
  const contentRange = getHeader(responseHeaders, "content-range").toLowerCase();

  return (
    record?.statusCode === 206 ||
    acceptRanges.includes("bytes") ||
    contentRange.startsWith("bytes")
  );
}

function getSize(record, item) {
  const responseHeaders = record?.responseHeaders || {};
  const contentRangeSize = parseContentRange(getHeader(responseHeaders, "content-range"));

  if (contentRangeSize > 0) return contentRangeSize;
  if (item?.fileSize && item.fileSize > 0) return item.fileSize;
  if (item?.totalBytes && item.totalBytes > 0) return item.totalBytes;

  return parseContentLength(getHeader(responseHeaders, "content-length"));
}

function cleanupOldRequests() {
  const cutoff = Date.now() - REQUEST_TTL_MS;

  for (const [requestId, record] of requestsById.entries()) {
    if (record.seenAt < cutoff) requestsById.delete(requestId);
  }

  for (const [url, records] of requestsByUrl.entries()) {
    const fresh = records.filter((record) => record.seenAt >= cutoff);
    if (fresh.length > 0) requestsByUrl.set(url, fresh);
    else requestsByUrl.delete(url);
  }
}

function rememberRequest(details) {
  if (!details.url || details.method !== "GET") return;

  cleanupOldRequests();

  const url = normalizeUrl(details.url);
  const requestHeaders = headerArrayToObject(details.requestHeaders);
  const record = {
    requestId: details.requestId,
    url,
    originalUrl: details.url,
    method: details.method,
    tabId: details.tabId,
    type: details.type,
    initiator: details.initiator || "",
    seenAt: Date.now(),
    requestHeaders,
    responseHeaders: {},
    statusCode: 0
  };

  requestsById.set(details.requestId, record);

  const records = requestsByUrl.get(url) || [];
  records.push(record);
  requestsByUrl.set(url, records.slice(-12));
}

function rememberResponse(details) {
  const record = requestsById.get(details.requestId);
  if (!record) return;

  record.responseHeaders = headerArrayToObject(details.responseHeaders);
  record.statusCode = details.statusCode || 0;
  record.seenAt = Date.now();
}

function findRequestForDownload(item) {
  cleanupOldRequests();

  const candidates = [item.finalUrl, item.url]
    .filter(Boolean)
    .map(normalizeUrl);

  for (const url of candidates) {
    const records = requestsByUrl.get(url);
    if (records?.length) return records[records.length - 1];
  }

  if (item.referrer) {
    const itemTime = item.startTime ? new Date(item.startTime).getTime() : Date.now();
    let best = null;

    for (const records of requestsByUrl.values()) {
      for (const record of records) {
        if (Math.abs(record.seenAt - itemTime) > REQUEST_TTL_MS) continue;
        if (!best || record.seenAt > best.seenAt) best = record;
      }
    }

    if (best) return best;
  }

  return null;
}

function sanitizeHeadersForJda(headers) {
  const blocked = new Set([
    "host",
    "connection",
    "content-length",
    "accept-encoding",
    "range"
  ]);

  const result = {};

  for (const [name, value] of Object.entries(headers || {})) {
    const lowerName = name.toLowerCase();
    if (!value || blocked.has(lowerName)) continue;
    result[lowerName] = value;
  }

  return result;
}

async function getCookiesForUrl(url) {
  try {
    const cookies = await browser.cookies.getAll({ url });
    if (!cookies) return "";
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  } catch {
    return "";
  }
}

async function getStorage(keys) {
  return await browser.storage.local.get(keys);
}

async function setStorage(value) {
  return await browser.storage.local.set(value);
}

async function downloadsSearch(query) {
  return await browser.downloads.search(query);
}

async function cancelDownload(id) {
  return await browser.downloads.cancel(id);
}

async function eraseDownload(id) {
  return await browser.downloads.erase({ id });
}

async function isEnabled() {
  const result = await getStorage(["jdaEnabled"]);
  return Object.prototype.hasOwnProperty.call(result, "jdaEnabled") ? result.jdaEnabled : true;
}

async function setStatus(status, detail = "") {
  await setStorage({
    jdaLastStatus: status,
    jdaLastDetail: detail,
    jdaLastAt: new Date().toLocaleTimeString()
  });
}

async function sendToJda(payload) {
  const response = await fetch(JDA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`JDA returned HTTP ${response.status}`);
}

async function openDeepLinkFallback(payload) {
  const params = new URLSearchParams();

  params.set("url", payload.url || "");
  params.set("name", payload.name || "");
  params.set("size", String(payload.size || 0));
  params.set("resume", payload.resume || "false");
  params.set("cookie", payload.cookie || "");
  params.set("userAgent", payload.userAgent || "");
  params.set("referer", payload.referer || "");

  await browser.tabs.create({ url: `jda://?${params.toString()}` });
}

async function buildPayload(item) {
  const targetUrl = item.finalUrl || item.url;
  const record = findRequestForDownload(item);
  const requestHeaders = record?.requestHeaders || {};
  const headerCookie = getHeader(requestHeaders, "cookie");
  const cookie = headerCookie || await getCookiesForUrl(targetUrl);
  const userAgent = getHeader(requestHeaders, "user-agent") || navigator.userAgent;
  const referer = getHeader(requestHeaders, "referer") || item.referrer || "";

  return {
    url: targetUrl,
    name: item.filename || "download",
    size: getSize(record, item),
    resume: isResumeSupported(record) ? "true" : "false",
    cookie,
    userAgent,
    referer,
    headers: sanitizeHeadersForJda({
      ...requestHeaders,
      cookie,
      "user-agent": userAgent,
      referer
    })
  };
}

async function handOffDownload(item, source) {
  if (!item?.id || handledDownloadIds.has(item.id)) return;
  if (!item.url && !item.finalUrl) return;
  if (!(await isEnabled())) return;
  if (item.state && item.state !== "in_progress") return;

  if (item.startTime) {
    const startTime = new Date(item.startTime).getTime();
    if (Date.now() - startTime > 15 * 1000) {
      return;
    }
  }
  handledDownloadIds.add(item.id);

  try {
    const payload = await buildPayload(item);
    await sendToJda(payload);
    await cancelDownload(item.id);
    await eraseDownload(item.id);
    await setStatus("Caught download", `${payload.name} (${source})`);
  } catch (error) {
    handledDownloadIds.delete(item.id);
    await setStatus("JDA handoff failed", error?.message || String(error));

    try {
      const payload = await buildPayload(item);
      await openDeepLinkFallback(payload);
    } catch {
      // Keep the browser download alive if we cannot build a payload.
    }
  }
}

browser.runtime.onInstalled.addListener(async () => {
  const result = await getStorage(["jdaEnabled"]);
  if (!Object.prototype.hasOwnProperty.call(result, "jdaEnabled")) {
    await setStorage({ jdaEnabled: true });
  }
  await setStatus("Ready", "Waiting for downloads");
});

browser.webRequest.onBeforeSendHeaders.addListener(
  rememberRequest,
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

browser.webRequest.onHeadersReceived.addListener(
  rememberResponse,
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

if (browser.downloads.onDeterminingFilename) {
  browser.downloads.onDeterminingFilename.addListener((item, suggest) => {
    isEnabled().then((enabled) => {
      suggest({
        filename: item.filename || "download",
        conflictAction: "uniquify"
      });

      if (enabled) handOffDownload(item, "filename");
    });

    return true;
  });
}

browser.downloads.onCreated.addListener((item) => {
  const delay = browser.downloads.onDeterminingFilename ? FALLBACK_INTERCEPT_DELAY_MS : 50;
  setTimeout(async () => {
    if (handledDownloadIds.has(item.id) || !(await isEnabled())) return;

    try {
      const matches = await downloadsSearch({ id: item.id });
      const current = matches?.[0] || item;
      await handOffDownload(current, "created-fallback");
    } catch (error) {
      console.error("Error handling onCreated in JDA extension:", error);
    }
  }, delay);
});
