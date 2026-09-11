'use strict';
let translator = null;
let chain = Promise.resolve();
const cache = new Map();
const $ = id => document.getElementById(id);
async function broadcast(type) {
  const tabs = await chrome.tabs.query({url:['https://higgsfield.ai/*','https://*.higgsfield.ai/*']});
  await Promise.allSettled(tabs.map(t => chrome.tabs.sendMessage(t.id, {type})));
  return tabs.length;
}
$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  try {
    if (!('Translator' in self)) throw new Error('当前 Chrome 没有开放本地翻译 API。请更新桌面 Chrome 后重试；若受设备或组织策略限制，本版只能翻译内置界面词条。');
    $('status').textContent = '正在准备语言包，首次下载可能需要几分钟…';
    // Call create directly inside the user gesture, before any awaited checks.
    translator = await Translator.create({sourceLanguage:'en', targetLanguage:'zh', monitor(m) {
      m.addEventListener('downloadprogress', e => {
        $('progress').hidden = false;
        $('progress').value = e.loaded;
        $('status').textContent = `正在下载语言包：${Math.round(e.loaded * 100)}%`;
      });
    }});
    $('progress').hidden = true;
    $('status').textContent = '本地翻译已启动。现在可以切回 Higgsfield，请保留本标签页。';
    $('start').textContent = '本地引擎已就绪';
    await broadcast('hf-rescan');
  } catch (e) {
    $('status').textContent = `启动失败：${e.message}\n可检查 Chrome 更新和语言包下载网络后重试。界面词条仍可使用。`;
    $('start').disabled = false;
  }
});
chrome.storage.local.get({enabled:true}).then(s => { $('enabled').checked = s.enabled; });
$('enabled').addEventListener('change', () => chrome.storage.local.set({enabled:$('enabled').checked}));
$('rescan').addEventListener('click', async () => {
  const n = await broadcast('hf-rescan');
  $('actionStatus').textContent = n ? `已通知 ${n} 个页面重新扫描。刚安装时请先刷新网页。` : '请先打开 Higgsfield 页面。';
});
// Break long paragraphs into bounded chunks without dropping characters.
function chunks(text, limit=1800) {
  const out=[];
  while (text.length > limit) {
    let end=text.lastIndexOf(' ',limit);
    if(end < limit/2) end=limit;
    else end++;
    out.push(text.slice(0,end)); text=text.slice(end);
  }
  if(text) out.push(text);
  return out;
}
async function translate(text) {
  if(cache.has(text)) return cache.get(text);
  const parts=[];
  for(const part of chunks(text)) parts.push(await translator.translate(part));
  const result=parts.join('');
  if(!result.trim()) throw new Error('翻译引擎返回空内容');
  cache.set(text,result);
  if(cache.size > 1500) cache.delete(cache.keys().next().value);
  return result;
}
chrome.runtime.onMessage.addListener((msg,sender,reply) => {
  if(sender.id !== chrome.runtime.id) return;
  if(msg?.type === 'hf-ping') { reply({ready:!!translator}); return; }
  if(msg?.type !== 'hf-translate') return;
  if(!translator) { reply({error:'请在扩展控制台启动本地翻译'}); return; }
  if(!Array.isArray(msg.texts) || msg.texts.length>8 || msg.texts.some(t=>typeof t!=='string'||t.length>100000)) {
    reply({error:'翻译请求过大'}); return;
  }
  const job = chain.then(async () => {
    const results=[];
    for(const t of msg.texts) {
      try { results.push({text:await translate(t)}); }
      catch(e) { results.push({error:e.message}); }
    }
    return {results};
  });
  chain=job.catch(()=>{});
  job.then(reply, e=>reply({error:e.message}));
  return true;
});
