(() => {
  'use strict';
  const dictionary = globalThis.HF_ZH_DICTIONARY;
  const records = new Set(), index = new WeakMap(), roots = new Map();
  const translated = new Map(), pending = new Map();
  const attributes = ['title','placeholder','aria-label','alt'];
  const excluded = 'script,style,noscript,textarea,input,select,code,pre,[contenteditable]:not([contenteditable="false"]),[data-hf-zh-ui]';
  let enabled=true, busy=false, generation=0, timer, waiting=false, error='', panel, status, toggle;
  const key = t => t.trim().replace(/\s+/g,' ').replace(/[.…]+$/,'').toLowerCase();
  function eligible(s) {
    const t=s.trim();
    return /[a-zA-Z]{2}/.test(t) && !/^(https?:\/\/|www\.|@|\S+@\S+\.\S+)/i.test(t)
      && !/^(higgsfield|chrome|youtube|instagram|tiktok|discord|4k|1080p)$/i.test(t);
  }
  function owner(node) { return node.nodeType===3 ? node.parentElement : node; }
  function blocked(el) {
    for(let e=el;e;) {
      if(e.matches?.(excluded)) return true;
      e=e.parentElement || e.getRootNode()?.host;
    }
    return false;
  }
  function current(r) { return r.attr ? r.node.getAttribute(r.attr) : r.node.nodeValue; }
  function write(r,text) {
    if(r.attr) r.node.setAttribute(r.attr,text); else r.node.nodeValue=text;
  }
  function display() {
    if(!status) return;
    let count=0; for(const r of records) if(r.node.isConnected && r.applied && current(r)===r.applied) count++;
    const text=!enabled ? '已恢复原文' : error ? `部分未译：${error}` : waiting ? `已译 ${count} 处 · 请启动引擎` : busy || pending.size ? `已译 ${count} 处 · 翻译中` : `已译 ${count} 处 · 持续扫描`;
    if(status.textContent!==text) status.textContent=text;
    toggle.textContent=enabled?'恢复原文':'显示中文';
  }
  function apply(r, zh) {
    if(!enabled || !r.node.isConnected || current(r)!==r.original || blocked(owner(r.node))) return;
    const lead=r.original.match(/^\s*/)[0],tail=r.original.match(/\s*$/)[0];
    r.applied=lead+zh.trim()+tail;
    write(r,r.applied);
  }
  function consider(node,attr=null) {
    const el=owner(node);
    // Translate input hints but never values or user drafts.
    if(!el || (attr ? blocked(el.parentElement) || el.closest('[data-hf-zh-ui]') : blocked(el))) return;
    const text=attr ? node.getAttribute(attr) : node.nodeValue;
    if(!text) return;
    let slots=index.get(node); if(!slots){slots=new Map();index.set(node,slots);}
    const slot=attr||'#text';
    let r=slots.get(slot);
    if(r && (text===r.applied || (text===r.original && r.queued))) return;
    if(!eligible(text)) return;
    if(!r || text!==r.original) {
      if(r) records.delete(r);
      r={node,attr,original:text,applied:null,queued:false}; slots.set(slot,r);records.add(r);
    }
    const known=dictionary[key(text)] || translated.get(text.trim());
    if(known) { apply(r,known);return; }
    if(r.failed) return;
    const source=text.trim();
    if(!pending.has(source)) pending.set(source,new Set());
    pending.get(source).add(r);r.queued=true;
  }
  function schedule() { if(!timer) timer=setTimeout(()=>{timer=null;scan();},220); }
  function observe(root) {
    if(roots.has(root)) return;
    const observer=new MutationObserver(schedule);
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'class','style','hidden']});
    roots.set(root,observer);
  }
  function scanRoot(root) {
    observe(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())) {
      if(n.nodeType===3) consider(n);
      else if(!n.hasAttribute('data-hf-zh-ui')) {
        for(const a of attributes) if(n.hasAttribute(a)) consider(n,a);
        if(n.shadowRoot && !blocked(n)) scanRoot(n.shadowRoot);
      }
    }
  }
  function scan() {
    for(const r of records) if(!r.node.isConnected) records.delete(r);
    for(const [root,o] of roots) if(root.host && !root.host.isConnected){o.disconnect();roots.delete(root);}
    if(enabled) { scanRoot(document.documentElement); flush(); }
    display();
  }
  async function flush() {
    if(busy || waiting || !enabled || !pending.size) return;
    busy=true;const version=generation;
    const batch=[...pending.entries()].slice(0,8);
    for(const [s] of batch) pending.delete(s);
    try {
      const response=await chrome.runtime.sendMessage({type:'hf-translate',texts:batch.map(([s])=>s)});
      if(!response?.results) { waiting=true; throw new Error(response?.error||'请启动本地引擎'); }
      if(version!==generation) return;
      error='';
      batch.forEach(([s,rs],i)=>{
        const result=response.results[i];
        if(result?.text) {
          translated.set(s,result.text);
          if(translated.size>1500) translated.delete(translated.keys().next().value);
          for(const r of rs){r.queued=false;apply(r,result.text);}
        } else {
          error='翻译失败，请重新扫描';
          for(const r of rs){r.queued=false;r.failed=true;}
        }
      });
    } catch(e) {
      waiting=true;
      for(const [s,rs] of batch) {
        if(!pending.has(s)) pending.set(s,new Set());
        for(const r of rs) pending.get(s).add(r);
      }
    } finally { busy=false;display();if(!waiting && enabled) setTimeout(flush,0); }
  }
  function rescan() {
    waiting=false;error='';
    for(const r of records) r.failed=false;
    scan();
  }
  function setEnabled(value) {
    enabled=value;generation++;pending.clear();waiting=false;error='';
    for(const r of records) {
      r.queued=false;r.failed=false;
      if(!enabled && r.applied && current(r)===r.applied) write(r,r.original);
      r.applied=null;
    }
    scan();
  }
  function mountPanel() {
    if(window.top!==window) return;
    panel=document.createElement('div');panel.setAttribute('data-hf-zh-ui','');
    panel.style.cssText='position:fixed;bottom:16px;right:16px;z-index:2147483647;';
    const shadow=panel.attachShadow({mode:'open'});
    // All markup is static extension UI; translated text is written with nodeValue.
    shadow.innerHTML='<style>:host{all:initial}.box{font:12px/1.5 -apple-system,"PingFang SC",sans-serif;background:#172014;color:#e7f1df;border:1px solid #526347;border-radius:12px;padding:10px 12px;box-shadow:0 5px 24px #0004;max-width:280px}p{margin:0 0 7px}button{font:inherit;color:#e9f6dc;background:#34432a;border:0;border-radius:5px;padding:5px 8px;cursor:pointer;margin-right:4px}button:focus-visible{outline:2px solid #c2ed9a}</style><div class="box"><p role="status"></p><button id="toggle"></button><button id="scan">重新扫描</button><button id="engine">启动引擎</button></div>';
    status=shadow.querySelector('p');toggle=shadow.querySelector('#toggle');
    toggle.onclick=()=>chrome.storage.local.set({enabled:!enabled});
    shadow.querySelector('#scan').onclick=rescan;
    shadow.querySelector('#engine').onclick=()=>chrome.runtime.sendMessage({type:'hf-open'}).catch(()=>{status.textContent='扩展已更新，请刷新网页';});
    document.documentElement.append(panel);
  }
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(m?.type==='hf-rescan') {rescan();reply({ok:true});}
  });
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && changes.enabled) setEnabled(changes.enabled.newValue!==false);
  });
  chrome.storage.local.get({enabled:true}).then(s=>{
    enabled=s.enabled;mountPanel();scan();
    // Finds late-attached shadow roots and changes that do not trigger an observed mutation.
    setInterval(()=>{if(!document.hidden) scan();},2500);
  });
})();
