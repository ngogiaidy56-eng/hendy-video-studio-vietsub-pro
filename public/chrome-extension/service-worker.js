chrome.action.onClicked.addListener(async (tab) => {
  const { studioUrl } = await chrome.storage.local.get({ studioUrl: 'http://localhost:5173' });
  if (!tab.url) return;
  const target = new URL(studioUrl);
  target.searchParams.set('sourceUrl', tab.url);
  await chrome.tabs.create({ url: target.toString() });
});
