'use strict';

const DEFAULTS = {
  enabled: true,
  displayMode: 'bilingual',
  translationEngine: 'ai',
  translationScope: 'full',
  provider: 'openrouter',
  apiProtocol: 'openai_chat',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'google/gemini-3.1-flash-lite',
  apiKey: '',
  audioTranscriptionEndpoint: 'https://api.siliconflow.cn/v1/audio/transcriptions',
  audioTranscriptionModel: 'FunAudioLLM/SenseVoiceSmall',
  subtitleRecognizer:'apple',subtitleTranslator:'current',deeplEndpoint:'https://api-free.deepl.com/v2/translate',deeplApiKey:'',
  subtitleConcurrency:4,
  subtitleDelaySeconds: 8,
  glossary: 'Higgsfield = Higgsfield\nSeedance = Seedance\nSeedream = Seedream\nSoul Cinema = Soul Cinema\nCinema Studio = Cinema Studio',
  preservePromptKeywords: true
};
const PRESETS = {
  openrouter:{apiProtocol:'openai_chat',endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'google/gemini-3.1-flash-lite'},
  deepseek:{apiProtocol:'openai_chat',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-v4-flash'},
  openai:{apiProtocol:'openai_responses',endpoint:'https://api.openai.com/v1/responses',model:'gpt-5.5'},
  anthropic:{apiProtocol:'anthropic',endpoint:'https://api.anthropic.com/v1/messages',model:'claude-sonnet-4-6'},
  gemini:{apiProtocol:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',model:'gemini-3.1-flash-lite'},
  qwen:{apiProtocol:'openai_chat',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',model:'qwen-plus'},
  siliconflow:{apiProtocol:'openai_chat',endpoint:'https://api.siliconflow.cn/v1/chat/completions',model:'deepseek-ai/DeepSeek-V4-Flash'},
  moonshot:{apiProtocol:'openai_chat',endpoint:'https://api.moonshot.cn/v1/chat/completions',model:'kimi-k2.5'},
  groq:{apiProtocol:'openai_chat',endpoint:'https://api.groq.com/openai/v1/chat/completions',model:'openai/gpt-oss-120b'},
  mistral:{apiProtocol:'openai_chat',endpoint:'https://api.mistral.ai/v1/chat/completions',model:'mistral-small-latest'},
  ollama:{apiProtocol:'ollama',endpoint:'http://localhost:11434/api/chat',model:'qwen3:8b'}
};
const $ = id => document.getElementById(id);
let translator = null;
let localChain = Promise.resolve();
const localCache = new Map();

function formConfig() {
  return {
    enabled: $('enabled').checked,
    displayMode: $('displayMode').value,
    translationEngine: $('translationEngine').value,
    translationScope: $('translationScope').value,
    provider: $('provider').value,
    apiProtocol: $('apiProtocol').value,
    endpoint: $('endpoint').value.trim(),
    model: $('model').value.trim(),
    apiKey: $('apiKey').value.trim(),
    audioTranscriptionEndpoint: $('audioTranscriptionEndpoint').value.trim(),
    audioTranscriptionModel: $('audioTranscriptionModel').value.trim(),
    subtitleRecognizer:$('subtitleRecognizer').value,subtitleTranslator:$('subtitleTranslator').value,deeplEndpoint:$('deeplEndpoint').value.trim(),deeplApiKey:$('deeplApiKey').value.trim(),
    subtitleConcurrency:Math.max(1,Math.min(6,Number($('subtitleConcurrency').value)||4)),
    subtitleDelaySeconds: Math.max(4,Math.min(30,Number($('subtitleDelaySeconds').value)||8)),
    glossary: $('glossary').value,
    preservePromptKeywords: $('preservePromptKeywords').checked
  };
}

function endpointPermission(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new Error('接口必须使用 HTTPS；本机 localhost 可使用 HTTP');
  }
  return `${url.protocol}//${url.hostname}/*`;
}

async function requestEndpointPermission(endpoint) {
  const origin = endpointPermission(endpoint);
  if (await chrome.permissions.contains({origins:[origin]})) return true;
  return chrome.permissions.request({origins:[origin]});
}

async function notifyPages() {
  return chrome.runtime.sendMessage({type:'hf-notify-pages'});
}

async function saveConfig(showStatus = true) {
  const config = formConfig();
  if (config.translationEngine === 'ai') {
    if (!config.endpoint || !config.model) throw new Error('请填写接口地址和模型名');
    const allowed = await requestEndpointPermission(config.endpoint);
    if (!allowed) throw new Error('未获得该 API 域名的访问权限');
    if(config.subtitleRecognizer==='online'&&config.audioTranscriptionEndpoint){const audioAllowed=await requestEndpointPermission(config.audioTranscriptionEndpoint);if(!audioAllowed)throw new Error('未获得语音转写 API 的访问权限');}
    if(config.subtitleTranslator==='deepl'){if(!config.deeplApiKey)throw new Error('请填写 DeepL API Key');const deeplAllowed=await requestEndpointPermission(config.deeplEndpoint);if(!deeplAllowed)throw new Error('未获得 DeepL 接口的访问权限');}
  }
  await chrome.storage.local.set(config);
  await notifyPages();
  if (showStatus) $('apiStatus').textContent = '设置已保存，已打开的 Higgsfield 页面正在重新翻译。';
  return config;
}

async function loadConfig() {
  const config = await chrome.storage.local.get(DEFAULTS);
  Object.entries(config).forEach(([id,value]) => {
    const el = $(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  });
}

$('provider').addEventListener('change', () => {
  const preset = PRESETS[$('provider').value];
  if (preset) {
    $('translationEngine').value = 'ai';
    $('endpoint').value = preset.endpoint;
    $('model').value = preset.model;
    $('apiProtocol').value = preset.apiProtocol;
  }
});

$('save').addEventListener('click', async () => {
  $('save').disabled = true;
  try {
    $('translationEngine').value = 'ai';
    await saveConfig();
  }
  catch (error) { $('apiStatus').textContent = `保存失败：${error.message}`; }
  finally { $('save').disabled = false; }
});

$('test').addEventListener('click', async () => {
  $('test').disabled = true;
  $('apiStatus').textContent = '正在测试接口…';
  try {
    const config = formConfig();
    if (config.apiProtocol !== 'ollama' && !config.apiKey) throw new Error('请填写 API Key');
    const allowed = await requestEndpointPermission(config.endpoint);
    if (!allowed) throw new Error('未获得该 API 域名的访问权限');
    const result = await chrome.runtime.sendMessage({type:'hf-test-api',config});
    if (!result?.ok) throw new Error(result?.error || '接口没有返回结果');
    $('translationEngine').value = 'ai';
    await chrome.storage.local.set({...config,translationEngine:'ai'});
    await notifyPages();
    $('apiStatus').textContent = `测试成功，已自动启用第三方 AI：${result.text}`;
  } catch (error) {
    $('apiStatus').textContent = `测试失败：${error.message}`;
  } finally { $('test').disabled = false; }
});

for (const id of ['enabled','displayMode','translationEngine','translationScope','subtitleDelaySeconds','subtitleRecognizer','subtitleTranslator','subtitleConcurrency']) {
  $(id).addEventListener('change', async () => {
    try { await saveConfig(false); }
    catch (error) { $('apiStatus').textContent = `设置未应用：${error.message}`; }
  });
}
$('testNative').addEventListener('click',async()=>{const button=$('testNative');button.disabled=true;$('subtitleStatus').textContent='正在连接 Apple 本地语音助手…';try{const result=await chrome.runtime.sendMessage({type:'hf-test-native'});if(!result?.ok)throw new Error(result?.error||'连接失败');$('subtitleStatus').textContent=result.message;}catch(error){$('subtitleStatus').textContent=`连接失败：${error.message}。请运行下方安装程序。`;}finally{button.disabled=false;}});

$('saveGlossary').addEventListener('click', async () => {
  await chrome.storage.local.set({glossary:$('glossary').value});
  await notifyPages();
  $('glossaryStatus').textContent = '术语库已保存，页面正在按新术语重新翻译。';
});

$('importGlossary').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        $('glossary').value = data.map(row => Array.isArray(row) ? `${row[0]} = ${row[1]}` : `${row.source} = ${row.target}`).join('\n');
      } else {
        $('glossary').value = Object.entries(data).map(([source,target]) => `${source} = ${target}`).join('\n');
      }
    } else $('glossary').value = text;
    $('glossaryStatus').textContent = `已载入 ${file.name}，点击“保存术语库”后生效。`;
  } catch (error) { $('glossaryStatus').textContent = `导入失败：${error.message}`; }
  event.target.value = '';
});

$('exportGlossary').addEventListener('click', () => {
  const blob = new Blob([$('glossary').value], {type:'text/plain;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'higgsfield-术语库.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  $('glossaryStatus').textContent = '术语库已导出。';
});

function cardMarkdown(card) {
  function walk(value,depth=2) {
    if(Array.isArray(value)) return value.map(item=>typeof item==='object'?walk(item,depth+1):`- ${item}`).join('\n');
    if(value&&typeof value==='object') return Object.entries(value).map(([key,item])=>`${'#'.repeat(Math.min(depth,4))} ${key}\n\n${walk(item,depth+1)}`).join('\n\n');
    return String(value??'');
  }
  return `# ${card.title}\n\n- 来源：${card.url}\n- 保存时间：${card.savedAt}\n- 分析类型：${card.task}\n\n${walk(card.result)}`;
}
function downloadFile(name,text,type='text/plain') {
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
async function renderLibrary() {
  const {knowledgeLibrary=[]}=await chrome.storage.local.get({knowledgeLibrary:[]});
  const query=$('librarySearch').value.trim().toLowerCase(),root=$('library');root.textContent='';
  const cards=knowledgeLibrary.filter(card=>JSON.stringify(card).toLowerCase().includes(query));
  $('libraryStatus').textContent=`共 ${knowledgeLibrary.length} 张知识卡${query?`，匹配 ${cards.length} 张`:''}`;
  for(const card of cards){
    const article=document.createElement('article');article.className='library-card';
    const h=document.createElement('h3'),link=document.createElement('a');link.href=card.url;link.target='_blank';link.textContent=card.title;h.append(link);article.append(h);
    const meta=document.createElement('div');meta.className='meta';meta.textContent=`${new Date(card.savedAt).toLocaleString()} · ${card.task}`;article.append(meta);
    if(card.result?.tags?.length){const tags=document.createElement('div');tags.className='tags';tags.textContent=card.result.tags.join(' · ');article.append(tags);}
    if(card.result?.oneSentence){const summary=document.createElement('p');summary.className='summary';summary.textContent=card.result.oneSentence;article.append(summary);}
    const exportButton=document.createElement('button');exportButton.className='secondary';exportButton.textContent='导出 Markdown';exportButton.onclick=()=>downloadFile(`${card.title}.md`,cardMarkdown(card),'text/markdown');article.append(exportButton);
    const deleteButton=document.createElement('button');deleteButton.className='secondary';deleteButton.textContent='删除';deleteButton.onclick=async()=>{if(!confirm(`删除知识卡“${card.title}”？`))return;await chrome.storage.local.set({knowledgeLibrary:knowledgeLibrary.filter(item=>item.id!==card.id)});renderLibrary();};article.append(deleteButton);
    root.append(article);
  }
}
$('librarySearch').addEventListener('input',renderLibrary);
$('refreshLibrary').addEventListener('click',renderLibrary);
$('exportLibraryJson').addEventListener('click',async()=>{const {knowledgeLibrary=[]}=await chrome.storage.local.get({knowledgeLibrary:[]});downloadFile('higgsfield-影视知识库.json',JSON.stringify(knowledgeLibrary,null,2),'application/json');});
$('exportLibraryMd').addEventListener('click',async()=>{const {knowledgeLibrary=[]}=await chrome.storage.local.get({knowledgeLibrary:[]});downloadFile('higgsfield-影视知识库.md',knowledgeLibrary.map(cardMarkdown).join('\n\n---\n\n'),'text/markdown');});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.knowledgeLibrary)renderLibrary();});

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  try {
    if (!('Translator' in self)) throw new Error('当前 Chrome 未开放本地翻译 API，请更新桌面 Chrome 或使用第三方 AI。');
    $('status').textContent = '正在准备语言包，首次下载可能需要几分钟…';
    translator = await Translator.create({sourceLanguage:'en',targetLanguage:'zh',monitor(m) {
      m.addEventListener('downloadprogress', event => {
        $('progress').hidden = false;
        $('progress').value = event.loaded;
        $('status').textContent = `正在下载语言包：${Math.round(event.loaded * 100)}%`;
      });
    }});
    $('progress').hidden = true;
    $('status').textContent = '本地翻译已启动。请保留本标签页。';
    $('start').textContent = '本地引擎已就绪';
    await chrome.storage.local.set({translationEngine:'local'});
    $('translationEngine').value = 'local';
    await notifyPages();
  } catch (error) {
    $('status').textContent = `启动失败：${error.message}`;
    $('start').disabled = false;
  }
});

function chunks(text, limit=1800) {
  const result=[];
  while (text.length > limit) {
    let end=text.lastIndexOf(' ',limit);
    if (end < limit/2) end=limit; else end++;
    result.push(text.slice(0,end)); text=text.slice(end);
  }
  if (text) result.push(text);
  return result;
}

async function localTranslate(text) {
  if (localCache.has(text)) return localCache.get(text);
  const parts=[];
  for (const part of chunks(text)) parts.push(await translator.translate(part));
  const result=parts.join('');
  if (!result.trim()) throw new Error('本地翻译返回空内容');
  localCache.set(text,result);
  if (localCache.size > 1500) localCache.delete(localCache.keys().next().value);
  return result;
}

chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'hf-local-translate') return;
  if (!translator) { reply({error:'请在设置页启动 Chrome 本地翻译'}); return; }
  if (!Array.isArray(message.texts) || message.texts.length > 8) { reply({error:'翻译请求过大'}); return; }
  const job=localChain.then(async () => {
    const results=[];
    for (const text of message.texts) {
      try { results.push({text:await localTranslate(text)}); }
      catch (error) { results.push({error:error.message}); }
    }
    return {results};
  });
  localChain=job.catch(()=>{});
  job.then(reply,error=>reply({error:error.message}));
  return true;
});

loadConfig().catch(error => {
  $('apiStatus').textContent = `读取设置失败：${error.message}`;
});
renderLibrary().catch(error=>{
  $('libraryStatus').textContent=`读取知识库失败：${error.message}`;
});

$('rescan').addEventListener('click', async () => {
  const result=await notifyPages();
  $('actionStatus').textContent=result?.count ? `已通知 ${result.count} 个页面重新翻译。` : '没有找到已打开的 Higgsfield 页面。';
});

$('reloadExtension').addEventListener('click', () => {
  chrome.runtime.reload();
});
