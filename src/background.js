// Only open/focus the local engine document. No translation leaves this extension.
async function openEngine() {
  const url = chrome.runtime.getURL('engine.html');
  const tabs = await chrome.tabs.query({url});
  if (tabs.length) await chrome.tabs.update(tabs[0].id, {active: true});
  else await chrome.tabs.create({url});
}
chrome.action.onClicked.addListener(openEngine);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || msg?.type !== 'hf-open') return;
  openEngine().then(() => reply({ok:true}), () => reply({ok:false}));
  return true;
});
