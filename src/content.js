(() => {
  'use strict';

  const DEFAULTS={enabled:true,displayMode:'bilingual',translationEngine:'local'};
  const dictionary=globalThis.HF_ZH_DICTIONARY || {};
  const records=new Set(), textIndex=new WeakMap(), attrIndex=new WeakMap(), codeIndex=new WeakMap();
  const roots=new Map(), pending=new Map(), cache=new Map();
  const attributes=['title','placeholder','aria-label','alt'];
  const blockedSelector='script,style,noscript,textarea,input,select,[contenteditable]:not([contenteditable="false"]),[data-hf-zh-ui]';
  let settings={...DEFAULTS},busy=false,waiting=false,error='',generation=0,timer,panel,status,modeButton;

  const normalized=text=>text.trim().replace(/\s+/g,' ').replace(/[.…]+$/,'').toLowerCase();
  function eligible(value) {
    const text=String(value||'').trim();
    return /[a-zA-Z]{2}/.test(text)
      && !/^(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(text)
      && !/^(higgsfield|chrome|youtube|instagram|tiktok|discord|4k|1080p)$/i.test(text);
  }
  function blocked(element) {
    for(let current=element;current;) {
      if(current.matches?.(blockedSelector)) return true;
      current=current.parentElement || current.getRootNode()?.host;
    }
    return false;
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
    if(record.kind==='code' && record.hidden) {
      record.node.style.display=record.previousDisplay;
      record.hidden=false;
    }
  }
  function createTranslation(record, text) {
    if(record.translation?.isConnected) {
      record.translation.textContent=text;
      return record.translation;
    }
    const el=document.createElement(record.kind==='code'?'div':'span');
    el.setAttribute('data-hf-zh-ui','translation');
    el.className=record.block?'hf-zh-translation hf-zh-block':'hf-zh-translation hf-zh-inline';
    el.textContent=text;
    if(record.kind==='code') record.node.insertAdjacentElement('afterend',el);
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
    if(!record.node.isConnected || blocked(record.kind==='text'?record.node.parentElement:record.node)) return;
    record.chinese=String(chinese).trim();
    if(!record.chinese) return;
    if(!settings.enabled || settings.displayMode==='original') { restore(record); return; }
    if(record.kind==='attribute') {
      const value=settings.displayMode==='bilingual'?`${record.original} / ${record.chinese}`:record.chinese;
      record.applied=value;
      record.node.setAttribute(record.attribute,value);
      return;
    }
    if(record.kind==='code') {
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
    if(!pending.has(source)) pending.set(source,new Set());
    pending.get(source).add(record);record.queued=true;
  }
  function textRecord(node) {
    const text=node.nodeValue;
    if(!text || !eligible(text) || blocked(node.parentElement) || codeContainer(node)) return;
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
    if(!text || !eligible(text) || blocked(node)) return;
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
  function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;scan();},240);}
  function observe(root) {
    if(roots.has(root)) return;
    const observer=new MutationObserver(schedule);
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'class','style','hidden']});
    roots.set(root,observer);
  }
  function scanRoot(root) {
    observe(root);
    const handledCode=new Set();
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())) {
      if(node.nodeType===3) {
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
    const batch=[...pending.entries()].slice(0,8);
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
  function mountPanel() {
    if(window.top!==window)return;
    panel=document.createElement('div');panel.setAttribute('data-hf-zh-ui','panel');panel.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647';
    const shadow=panel.attachShadow({mode:'open'});
    shadow.innerHTML='<style>:host{all:initial}.box{font:12px/1.5 -apple-system,"PingFang SC",sans-serif;background:#172014;color:#e7f1df;border:1px solid #526347;border-radius:12px;padding:10px 12px;box-shadow:0 5px 24px #0005;max-width:300px}p{margin:0 0 7px}button{font:inherit;color:#e9f6dc;background:#34432a;border:0;border-radius:5px;padding:5px 8px;cursor:pointer;margin:2px}</style><div class="box"><p role="status"></p><button id="mode"></button><button id="scan">重新翻译</button><button id="settings">设置</button></div>';
    status=shadow.querySelector('p');modeButton=shadow.querySelector('#mode');
    modeButton.onclick=()=>chrome.storage.local.set({displayMode:settings.displayMode==='bilingual'?'zh':'bilingual'});
    shadow.querySelector('#scan').onclick=resetTranslations;
    shadow.querySelector('#settings').onclick=()=>chrome.runtime.sendMessage({type:'hf-open'});
    document.documentElement.append(panel);
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type==='hf-settings-changed'||message?.type==='hf-rescan'){
      chrome.storage.local.get(DEFAULTS).then(next=>{settings=next;scan();});reply({ok:true});
    }
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'){
      const affectsTranslation=['translationEngine','provider','model','endpoint','glossary','preservePromptKeywords'].some(key=>changes[key]);
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
