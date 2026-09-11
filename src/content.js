(() => {
  'use strict';

  const DEFAULTS={enabled:true,displayMode:'bilingual',translationEngine:'ai',translationScope:'full'};
  const dictionary=globalThis.HF_ZH_DICTIONARY || {};
  const records=new Set(), textIndex=new WeakMap(), attrIndex=new WeakMap(), codeIndex=new WeakMap(), richIndex=new WeakMap(),richRoots=new WeakSet();
  const roots=new Map(), pending=new Map(), cache=new Map();
  const attributes=['title','placeholder','aria-label','alt'];
  const blockedSelector='script,style,noscript,textarea,input,select,[contenteditable]:not([contenteditable="false"]),[data-hf-zh-ui]';
  let settings={...DEFAULTS},busy=false,waiting=false,error='',generation=0,timer,panel,status,modeButton,lastAnalysis=null,lastTask='summary',forceFull=false;

  const normalized=text=>text.trim().replace(/\s+/g,' ').replace(/[.…]+$/,'').toLowerCase();
  function eligible(value) {
    const text=String(value||'').trim();
    return /[a-zA-Z]/.test(text)
      && !/^(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(text);
  }
  function blocked(element) {
    for(let current=element;current;) {
      if(current.matches?.(blockedSelector)) return true;
      current=current.parentElement || current.getRootNode()?.host;
    }
    return false;
  }
  function visible(element){
    if(!element?.isConnected||element.closest?.('[hidden],[aria-hidden="true"]'))return false;
    const style=getComputedStyle(element);
    return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0;
  }
  function nearViewport(record){
    const element=record.kind==='text'?record.node.parentElement:record.node;
    if(!visible(element))return false;
    const rect=element.getBoundingClientRect();
    return rect.bottom>=-1200&&rect.top<=innerHeight+1200;
  }
  function codeContainer(node) {
    const parent=node.nodeType===3?node.parentElement:node;
    const direct=parent?.closest?.('pre,code,[data-language],[class*="code-block"],[class*="codeBlock"],[class*="highlight"]');
    if(!direct || blocked(direct)) return null;
    const pre=direct.closest?.('pre');
    return pre || direct;
  }
  function currentText(record) {
    if(record.kind==='text') return record.node.nodeValue;
    if(record.kind==='attribute') return record.node.getAttribute(record.attribute);
    return record.node.innerText;
  }
  function removeTranslation(record) {
    record.translation?.remove();
    record.translation=null;
    if((record.kind==='code'||record.kind==='rich') && record.hidden) {
      record.node.style.display=record.previousDisplay;
      record.hidden=false;
    }
  }
  function createTranslation(record, text) {
    if(record.translation?.isConnected) {
      record.translation.textContent=text;
      return record.translation;
    }
    const el=document.createElement(record.kind==='code'||record.kind==='rich'?'div':'span');
    el.setAttribute('data-hf-zh-ui','translation');
    el.className=record.block?'hf-zh-translation hf-zh-block':'hf-zh-translation hf-zh-inline';
    el.textContent=text;
    if(record.kind==='code'||record.kind==='rich') record.node.insertAdjacentElement('afterend',el);
    else record.node.parentNode?.insertBefore(el,record.node.nextSibling);
    record.translation=el;
    return el;
  }
  function restore(record) {
    if(record.kind==='text' && record.applied && record.node.nodeValue===record.applied) record.node.nodeValue=record.original;
    if(record.kind==='attribute' && record.applied && record.node.getAttribute(record.attribute)===record.applied) record.node.setAttribute(record.attribute,record.original);
    removeTranslation(record);
    record.applied=null;
  }
  function apply(record, chinese) {
    if(!record.node.isConnected || (record.kind!=='rich'&&blocked(record.kind==='text'?record.node.parentElement:record.node))) return;
    record.chinese=String(chinese).trim();
    if(!record.chinese) return;
    if(!settings.enabled || settings.displayMode==='original') { restore(record); return; }
    if(record.kind==='attribute') {
      const value=settings.displayMode==='bilingual'?`${record.original} / ${record.chinese}`:record.chinese;
      record.applied=value;
      record.node.setAttribute(record.attribute,value);
      return;
    }
    if(record.kind==='code'||record.kind==='rich') {
      const translated=createTranslation(record,record.chinese);
      translated.style.display='block';
      if(settings.displayMode==='zh') {
        if(!record.hidden) { record.previousDisplay=record.node.style.display;record.node.style.display='none';record.hidden=true; }
      } else if(record.hidden) {
        record.node.style.display=record.previousDisplay;record.hidden=false;
      }
      return;
    }
    if(settings.displayMode==='zh') {
      removeTranslation(record);
      const lead=record.original.match(/^\s*/)?.[0]||'',tail=record.original.match(/\s*$/)?.[0]||'';
      record.applied=lead+record.chinese+tail;
      record.node.nodeValue=record.applied;
    } else {
      if(record.applied && record.node.nodeValue===record.applied) record.node.nodeValue=record.original;
      record.applied=null;
      createTranslation(record,record.chinese).style.display=record.block?'block':'inline';
    }
  }
  function queue(record) {
    const source=record.original.trim();
    const known=dictionary[normalized(source)] || cache.get(source);
    if(known) { apply(record,known); return; }
    if(record.failed || record.queued) return;
    if(settings.translationEngine==='ai'&&settings.translationScope==='viewport'&&!forceFull&&!nearViewport(record))return;
    if(!pending.has(source)) pending.set(source,new Set());
    pending.get(source).add(record);record.queued=true;
  }
  function textRecord(node) {
    const text=node.nodeValue;
    if(!text || !eligible(text) || blocked(node.parentElement) || codeContainer(node) || inRichDocument(node.parentElement)) return;
    let record=textIndex.get(node);
    if(record && (text===record.original || text===record.applied)) {
      if(record.chinese) apply(record,record.chinese); else queue(record);
      return;
    }
    if(record) { restore(record);records.delete(record); }
    const tag=node.parentElement?.tagName||'';
    const block=text.trim().length>70 || /\n/.test(text) || /^(P|DIV|LI|H[1-6]|SECTION|ARTICLE|BLOCKQUOTE|TD|TH)$/.test(tag);
    record={kind:'text',node,original:text,applied:null,chinese:null,translation:null,queued:false,failed:false,block};
    textIndex.set(node,record);records.add(record);queue(record);
  }
  function attributeRecord(node,attribute) {
    const text=node.getAttribute(attribute);
    const safeInputAttribute=node.matches?.('input,textarea,select,[contenteditable]')&&attributes.includes(attribute);
    if(!text || !eligible(text) || (blocked(node)&&!safeInputAttribute)) return;
    let map=attrIndex.get(node);if(!map){map=new Map();attrIndex.set(node,map);}
    let record=map.get(attribute);
    if(record && (text===record.original || text===record.applied)) {
      if(record.chinese) apply(record,record.chinese); else queue(record);
      return;
    }
    if(record) {restore(record);records.delete(record);}
    record={kind:'attribute',node,attribute,original:text,applied:null,chinese:null,translation:null,queued:false,failed:false,block:false};
    map.set(attribute,record);records.add(record);queue(record);
  }
  function codeRecord(node) {
    if(codeIndex.has(node)) {
      const record=codeIndex.get(node),text=node.innerText;
      if(text===record.original || record.hidden) {if(record.chinese) apply(record,record.chinese);else queue(record);return;}
      restore(record);records.delete(record);codeIndex.delete(node);
    }
    const text=node.innerText;
    if(!eligible(text)) return;
    const record={kind:'code',node,original:text,applied:null,chinese:null,translation:null,queued:false,failed:false,block:true,hidden:false,previousDisplay:''};
    codeIndex.set(node,record);records.add(record);queue(record);
  }
  function inRichDocument(element){
    for(let current=element;current;current=current.parentElement||current.getRootNode()?.host)if(richRoots.has(current))return true;
    return false;
  }
  function richRecord(node){
    const text=node.innerText?.trim();
    if(!eligible(text))return;
    let record=richIndex.get(node);
    if(record&&text===record.original){if(record.chinese)apply(record,record.chinese);else queue(record);return;}
    if(record){restore(record);records.delete(record);}
    record={kind:'rich',node,original:text,applied:null,chinese:null,translation:null,queued:false,failed:false,block:true,hidden:false,previousDisplay:''};
    richIndex.set(node,record);records.add(record);queue(record);
  }
  function scanRichDocuments(root){
    const documents=[];
    const selector='.rde-content,.ProseMirror,[data-lexical-editor],[role="textbox"],[contenteditable="true"],[contenteditable="false"]';
    if(root.nodeType===1&&root.matches?.(selector))documents.push(root);
    if(root.querySelectorAll)documents.push(...root.querySelectorAll(selector));
    if(root.querySelectorAll){
      const heading=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(node=>/^about\s+the\s+project$/i.test(node.textContent?.trim()||''));
      const projectRoot=heading?.closest?.('.rde-content,.ProseMirror,[role="textbox"],[contenteditable],article,main')||heading?.parentElement;
      if(projectRoot)documents.push(projectRoot);
    }
    for(const documentRoot of new Set(documents)){
      richRoots.add(documentRoot);
      const blocks=documentRoot.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,code.rde-code,blockquote');
      if(!blocks.length){richRecord(documentRoot);continue;}
      for(const block of blocks){
        if(block.closest('li')&&block.tagName!=='LI')continue;
        if(block.closest('pre')&&block.tagName!=='PRE')continue;
        richRecord(block);
      }
    }
  }
  function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;scan();},240);}
  function observe(root) {
    if(roots.has(root)) return;
    const observer=new MutationObserver(schedule);
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'class','style','hidden']});
    roots.set(root,observer);
  }
  function scanRoot(root) {
    observe(root);
    scanRichDocuments(root);
    const handledCode=new Set();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      if(node.nodeType===3) {
        if(inRichDocument(node.parentElement))continue;
        const code=codeContainer(node);
        if(code) {if(!handledCode.has(code)){handledCode.add(code);codeRecord(code);}}
        else textRecord(node);
      } else if(!node.hasAttribute('data-hf-zh-ui')) {
        for(const attribute of attributes) if(node.hasAttribute(attribute)) attributeRecord(node,attribute);
        if(node.shadowRoot && !blocked(node)) scanRoot(node.shadowRoot);
      }
    }
  }
  function cleanup() {
    for(const record of records) if(!record.node.isConnected){removeTranslation(record);records.delete(record);}
    for(const [root,observer] of roots) if(root.host&&!root.host.isConnected){observer.disconnect();roots.delete(root);}
  }
  function display() {
    if(!status) return;
    const translated=[...records].filter(record=>record.node.isConnected&&record.chinese).length;
    const label=!settings.enabled||settings.displayMode==='original'?'仅显示原文':error?`部分未译：${error}`:waiting?`已译 ${translated} 处 · 需要启动或配置引擎`:busy||pending.size?`已译 ${translated} 处 · 翻译中`:`已译 ${translated} 处 · 中英对照`;
    status.textContent=label;
    modeButton.textContent=settings.displayMode==='bilingual'?'切换仅中文':'切换中英对照';
  }
  function scan() {
    cleanup();
    if(settings.enabled&&settings.displayMode!=='original'){scanRoot(document.documentElement);flush();}
    display();
  }
  async function flush() {
    if(busy||waiting||!settings.enabled||settings.displayMode==='original'||!pending.size)return;
    busy=true;const version=generation;
    const batch=[];let total=0;
    for(const entry of pending.entries()){
      const length=entry[0].length;
      if(batch.length&&total+length>12000)break;
      batch.push(entry);total+=length;
      if(batch.length>=20)break;
    }
    for(const [source] of batch)pending.delete(source);
    try {
      const type=settings.translationEngine==='ai'?'hf-ai-translate':'hf-local-translate';
      const response=await chrome.runtime.sendMessage({type,texts:batch.map(([source])=>source)});
      if(!response?.results){waiting=true;throw new Error(response?.error||'翻译引擎未就绪');}
      if(version!==generation)return;
      error='';waiting=false;
      batch.forEach(([source,set],index)=>{
        const result=response.results[index];
        if(result?.text){cache.set(source,result.text);for(const record of set){record.queued=false;apply(record,result.text);}}
        else{error=result?.error||'翻译失败';for(const record of set){record.queued=false;record.failed=true;}}
      });
      if(cache.size>2000)cache.delete(cache.keys().next().value);
    }catch(caught){error=caught.message;waiting=true;for(const [source,set]of batch){if(!pending.has(source))pending.set(source,new Set());for(const record of set)pending.get(source).add(record);}}
    finally{busy=false;display();if(!waiting)setTimeout(flush,0);}
  }
  function resetTranslations() {
    generation++;pending.clear();cache.clear();waiting=false;error='';
    for(const record of records){restore(record);record.chinese=null;record.queued=false;record.failed=false;}
    scan();
  }
  function refreshDisplay() {
    generation++;waiting=false;error='';
    for(const record of records) {
      if(record.chinese) apply(record,record.chinese);
      else if(!settings.enabled||settings.displayMode==='original') restore(record);
    }
    scan();
  }
  function mountStyles() {
    const style=document.createElement('style');style.setAttribute('data-hf-zh-ui','style');
    style.textContent='.hf-zh-translation{color:#b9e98d!important;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif!important;font-style:normal!important;text-transform:none!important}.hf-zh-inline{font-size:.86em!important;margin-left:.42em!important;opacity:.9}.hf-zh-inline:before{content:"译：";opacity:.55}.hf-zh-block{white-space:pre-wrap!important;font-size:.92em!important;line-height:1.65!important;margin:.45em 0 .8em!important;padding:.5em .75em!important;border-left:3px solid #a8d47d!important;background:rgba(157,205,111,.08)!important;border-radius:0 6px 6px 0!important}.hf-zh-block:before{content:"中文译文";display:block;font-size:11px;letter-spacing:.12em;opacity:.62;margin-bottom:.3em}';
    document.documentElement.append(style);
  }
  function extractProject(){
    const cleanText=element=>{const clone=element.cloneNode(true);clone.querySelectorAll('[data-hf-zh-ui]').forEach(el=>el.remove());return clone.textContent.trim();};
    const heading=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(el=>cleanText(el).toLowerCase()==='about the project');
    const about=[];
    if(heading){
      const level=Number(heading.tagName.slice(1));
      let node=heading.nextElementSibling;
      while(node&&about.length<12){
        if(/^H[1-6]$/.test(node.tagName)&&Number(node.tagName.slice(1))<=level)break;
        const text=node.innerText?.trim();if(text)about.push(text);node=node.nextElementSibling;
      }
    }
    const root=document.querySelector('main')||document.body,clone=root.cloneNode(true);
    clone.querySelectorAll('[data-hf-zh-ui],script,style,textarea,input,[contenteditable],video').forEach(el=>el.remove());
    const title=(document.querySelector('h1')?.textContent||document.title).trim();
    const author=[...document.querySelectorAll('a[href*="/@"]')].map(a=>a.textContent.trim()).find(Boolean)||'';
    return {url:location.href,title,author,about:about.join('\n\n'),content:(clone.innerText||'').replace(/\n{3,}/g,'\n\n').slice(0,60000)};
  }
  const FIELD_LABELS={projectTitle:'项目名称',projectType:'项目类型',tags:'检索标签',oneSentence:'一句话理解',storyAndIntent:'故事与创作意图',visualLanguage:'视觉语言',tools:'工具与用途',workflow:'制作工作流',promptPatterns:'提示词方法',problemsAndSolutions:'问题与解法',continuitySystem:'连续性系统',reusableAssets:'可复用资产',transferablePrinciples:'可迁移原则',productionChecklist:'制作检查表',vendorNeutralWorkflow:'平台无关工作流',tapnowMigration:'迁移到 TapNow',unknowns:'待验证信息',sourceCoverage:'来源覆盖',stage:'阶段',actions:'执行动作',inputs:'输入',outputs:'输出',name:'名称',purpose:'用途',template:'模板',why:'原理',problem:'问题',solution:'解法',principle:'底层原则',aboutFound:'找到 About',sections:'来源章节'};
  function appendValue(parent,value,key=''){
    if(value==null||value==='')return;
    if(Array.isArray(value)){
      const list=document.createElement('ul');
      for(const item of value){const li=document.createElement('li');appendValue(li,item);list.append(li);}parent.append(list);return;
    }
    if(typeof value==='object'){
      const box=document.createElement('div');box.className='analysis-group';
      for(const [childKey,childValue]of Object.entries(value)){
        const label=document.createElement('strong');label.textContent=(FIELD_LABELS[childKey]||childKey)+'：';box.append(label);appendValue(box,childValue,childKey);
      }parent.append(box);return;
    }
    const text=document.createElement('span');text.textContent=String(value);parent.append(text);
  }
  function renderAnalysis(root,result){
    root.textContent='';
    for(const [key,value]of Object.entries(result||{})){
      const section=document.createElement('section');const h=document.createElement('h3');h.textContent=FIELD_LABELS[key]||key;section.append(h);appendValue(section,value,key);root.append(section);
    }
  }
  function markdown(value,depth=1){
    if(Array.isArray(value))return value.map(item=>typeof item==='object'?markdown(item,depth+1):`- ${item}`).join('\n');
    if(value&&typeof value==='object')return Object.entries(value).map(([key,item])=>`${'#'.repeat(Math.min(depth,4))} ${FIELD_LABELS[key]||key}\n\n${markdown(item,depth+1)}`).join('\n\n');
    return String(value??'');
  }
  async function runAssistant(task,drawer){
    const pageData=extractProject();
    if(!location.pathname.includes('/projects/')){drawer.querySelector('#assistantStatus').textContent='请先打开 Higgsfield Community 的 Project 页面。';return;}
    const question=drawer.querySelector('#question').value.trim();
    if(task==='ask'&&!question){drawer.querySelector('#assistantStatus').textContent='请先输入问题。';return;}
    drawer.querySelectorAll('[data-task]').forEach(button=>button.disabled=true);
    drawer.querySelector('#assistantStatus').textContent=pageData.about?'已提取 About the project，正在分析…':'没有定位到 About 标题，将分析当前项目可见内容…';
    try{
      const response=await chrome.runtime.sendMessage({type:'hf-analyze-project',pageData,task,question});
      if(!response?.ok)throw new Error(response?.error||'分析失败');
      lastAnalysis=response.result;lastTask=task;renderAnalysis(drawer.querySelector('#analysis'),lastAnalysis);
      drawer.querySelector('#assistantStatus').textContent=`分析完成 · ${pageData.title}`;
      drawer.querySelector('#resultActions').hidden=false;
    }catch(caught){drawer.querySelector('#assistantStatus').textContent=`分析失败：${caught.message}`;}
    finally{drawer.querySelectorAll('[data-task]').forEach(button=>button.disabled=false);}
  }
  async function saveAnalysis(){
    if(!lastAnalysis)return;
    const stored=await chrome.storage.local.get({knowledgeLibrary:[]});
    const card={id:crypto.randomUUID(),savedAt:new Date().toISOString(),url:location.href,title:lastAnalysis.projectTitle||document.title,task:lastTask,result:lastAnalysis};
    const previous=stored.knowledgeLibrary.filter(item=>!(item.url===card.url&&item.task===card.task));
    await chrome.storage.local.set({knowledgeLibrary:[card,...previous].slice(0,100)});return card;
  }
  function download(name,text,type='text/plain'){
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type}));link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  function mountPanel() {
    if(window.top!==window)return;
    panel=document.createElement('div');panel.setAttribute('data-hf-zh-ui','panel');panel.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647';
    const shadow=panel.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{all:initial}.box,.drawer{font:12px/1.55 -apple-system,"PingFang SC",sans-serif;background:#172014;color:#e7f1df;border:1px solid #526347;border-radius:12px;box-shadow:0 5px 24px #0007}.box{padding:10px 12px;max-width:420px}.box p{margin:0 0 7px}.drawer{position:fixed;right:16px;bottom:76px;width:min(500px,calc(100vw - 32px));height:min(780px,calc(100vh - 100px));padding:18px;overflow:auto}.drawer[hidden]{display:none}h2{font-size:20px;margin:0 0 4px}h3{font-size:14px;color:#b9e98d;margin:0 0 6px}section{border-top:1px solid #34432a;padding:12px 0}.analysis-group{display:block;border-left:2px solid #526347;padding-left:9px;margin:7px 0}.analysis-group strong{display:block;color:#dfead8}ul{margin:6px 0;padding-left:20px}li{margin:4px 0}button{font:inherit;color:#e9f6dc;background:#34432a;border:0;border-radius:6px;padding:6px 9px;cursor:pointer;margin:2px}button.primary{background:#b9e98d;color:#172014}button:disabled{opacity:.5}textarea{box-sizing:border-box;width:100%;min-height:70px;margin:8px 0;background:#0d120c;color:#eef5e9;border:1px solid #526347;border-radius:8px;padding:9px;font:12px/1.5 inherit}.muted{color:#99a990}.actions{display:flex;flex-wrap:wrap;gap:3px;margin:8px 0}</style><div class="drawer" id="drawer" hidden><button id="close" style="float:right">关闭</button><h2>Community 项目助手</h2><p class="muted">提炼当前 Higgsfield Project，沉淀为可复用影视工作流。</p><div class="actions"><button class="primary" data-task="summary">快速提炼</button><button data-task="workflow">工作流还原</button><button data-task="migrate">迁移到 TapNow</button></div><textarea id="question" placeholder="针对当前项目提问，例如：它如何保持角色和空间连续性？"></textarea><button data-task="ask">询问当前项目</button><p id="assistantStatus" class="muted"></p><div id="analysis"></div><div id="resultActions" class="actions" hidden><button id="saveCard">保存知识卡</button><button id="copyResult">复制 Markdown</button><button id="exportMd">导出 Markdown</button><button id="exportJson">导出 JSON</button></div></div><div class="box"><p role="status"></p><button class="primary" id="assistant">AI 项目助手</button><button id="mode"></button><button id="scan">重新扫描</button><button id="full">强制全局翻译</button><button id="settings">设置</button></div>';
    status=shadow.querySelector('p');modeButton=shadow.querySelector('#mode');
    modeButton.onclick=()=>chrome.storage.local.set({displayMode:settings.displayMode==='bilingual'?'zh':'bilingual'});
    shadow.querySelector('#scan').onclick=()=>{forceFull=false;resetTranslations();};
    shadow.querySelector('#full').onclick=()=>{forceFull=true;resetTranslations();};
    shadow.querySelector('#settings').onclick=()=>chrome.runtime.sendMessage({type:'hf-open'});
    const drawer=shadow.querySelector('#drawer');shadow.querySelector('#assistant').onclick=()=>drawer.hidden=!drawer.hidden;shadow.querySelector('#close').onclick=()=>drawer.hidden=true;
    drawer.querySelectorAll('[data-task]').forEach(button=>button.onclick=()=>runAssistant(button.dataset.task,drawer));
    drawer.querySelector('#saveCard').onclick=async()=>{const card=await saveAnalysis();drawer.querySelector('#assistantStatus').textContent=`已保存知识卡：${card.title}`;};
    drawer.querySelector('#copyResult').onclick=async()=>{await navigator.clipboard.writeText(markdown(lastAnalysis));drawer.querySelector('#assistantStatus').textContent='已复制 Markdown。';};
    drawer.querySelector('#exportMd').onclick=()=>download(`${lastAnalysis?.projectTitle||'higgsfield-project'}.md`,markdown(lastAnalysis),'text/markdown');
    drawer.querySelector('#exportJson').onclick=()=>download(`${lastAnalysis?.projectTitle||'higgsfield-project'}.json`,JSON.stringify(lastAnalysis,null,2),'application/json');
    document.documentElement.append(panel);
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type==='hf-settings-changed'||message?.type==='hf-rescan'){
      chrome.storage.local.get(DEFAULTS).then(next=>{settings=next;scan();});reply({ok:true});
    }
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'){
      const affectsTranslation=['translationEngine','translationScope','provider','model','endpoint','glossary','preservePromptKeywords'].some(key=>changes[key]);
      const affectsDisplay=['enabled','displayMode'].some(key=>changes[key]);
      if(affectsTranslation||affectsDisplay) chrome.storage.local.get(DEFAULTS).then(next=>{
        settings=next;
        if(affectsTranslation) resetTranslations(); else refreshDisplay();
      });
    }
  });
  chrome.storage.local.get(DEFAULTS).then(saved=>{
    settings=saved;mountStyles();mountPanel();scan();
    setInterval(()=>{if(!document.hidden)scan();},2500);
  });
})();
