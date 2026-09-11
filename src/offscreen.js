'use strict';

let session=null;
async function stop(){
  if(!session)return;session.active=false;clearInterval(session.monitor);session.processor?.disconnect();session.silent?.disconnect();session.stream.getTracks().forEach(track=>track.stop());await session.context.close().catch(()=>{});session=null;
}
const asDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});

async function start(streamId,tabId){
  await stop();
  const stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false});
  const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();source.connect(analyser);source.connect(context.destination);analyser.fftSize=1024;await context.resume();
  const samples=new Uint8Array(analyser.fftSize),queue=[],processor=context.createScriptProcessor(4096,1,1),silent=context.createGain();silent.gain.value=0;source.connect(processor);processor.connect(silent);silent.connect(context.destination);
  const state=session={active:true,tabId,stream,context,source,analyser,processor,silent,samples,queue,running:0,sequence:0,pcm:[],started:performance.now(),speech:false,silence:0,monitor:null};
  const process=()=>{while(state.active&&state.running<2&&state.queue.length){const item=state.queue.shift();state.running++;(async()=>{try{await chrome.runtime.sendMessage({type:'hf-offscreen-audio-chunk',tabId,sequence:item.sequence,dataUrl:await asDataUrl(item.blob)});}finally{state.running--;process();}})();}};
  const wav=chunks=>{let sourceLength=0;for(const chunk of chunks)sourceLength+=chunk.length;const merged=new Float32Array(sourceLength);let cursor=0;for(const chunk of chunks){merged.set(chunk,cursor);cursor+=chunk.length;}const rate=16000,ratio=context.sampleRate/rate,length=Math.max(1,Math.floor(sourceLength/ratio)),pcm=new Float32Array(length);for(let i=0;i<length;i++){const from=Math.floor(i*ratio),to=Math.max(from+1,Math.min(sourceLength,Math.floor((i+1)*ratio)));let sum=0;for(let j=from;j<to;j++)sum+=merged[j];pcm[i]=sum/(to-from);}const buffer=new ArrayBuffer(44+length*2),view=new DataView(buffer),write=(offset,text)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};write(0,'RIFF');view.setUint32(4,36+length*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,length*2,true);let offset=44;for(let value of pcm){value=Math.max(-1,Math.min(1,value));view.setInt16(offset,value<0?value*32768:value*32767,true);offset+=2;}return new Blob([buffer],{type:'audio/wav'});};
  processor.onaudioprocess=event=>{if(state.active)state.pcm.push(new Float32Array(event.inputBuffer.getChannelData(0)));};
  const cut=()=>{const heardSpeech=state.speech,blob=heardSpeech?wav(state.pcm):null;state.pcm=[];state.started=performance.now();state.speech=false;state.silence=0;if(blob&&blob.size>1000){if(state.queue.length>=3)state.queue.shift();state.queue.push({blob,sequence:++state.sequence});process();}};
  state.monitor=setInterval(()=>{
    if(!state.active)return;analyser.getByteTimeDomainData(samples);let energy=0;for(const value of samples){const n=(value-128)/128;energy+=n*n;}const rms=Math.sqrt(energy/samples.length),now=performance.now(),elapsed=now-state.started;
    if(rms>.018){state.speech=true;state.silence=0;}else if(state.speech&&!state.silence)state.silence=now;
    if((state.speech&&state.silence&&now-state.silence>320&&elapsed>550)||elapsed>4000)cut();
  },60);return {ok:true};
}

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message?.type==='hf-offscreen-start'){start(message.streamId,message.tabId).then(reply,error=>reply({ok:false,error:error.message}));return true;}
  if(message?.type==='hf-offscreen-stop'){if(!session||!message.tabId||session.tabId===message.tabId)stop().then(()=>reply({ok:true}));else reply({ok:true});return true;}
});
