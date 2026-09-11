'use strict';

let session=null;
async function stop(){
  if(!session)return;session.active=false;clearInterval(session.monitor);if(session.recorder?.state!=='inactive')session.recorder.stop();session.stream.getTracks().forEach(track=>track.stop());await session.context.close().catch(()=>{});session=null;
}
const asDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});

async function start(streamId,tabId){
  await stop();
  const stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:false});
  const context=new AudioContext(),source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();source.connect(analyser);source.connect(context.destination);analyser.fftSize=1024;await context.resume();
  const audioStream=new MediaStream(stream.getAudioTracks()),mime=['audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'',samples=new Uint8Array(analyser.fftSize),queue=[];
  const state=session={active:true,tabId,stream,context,source,analyser,audioStream,mime,samples,queue,processing:false,recorder:null,chunks:[],started:0,speech:false,silence:0,stopping:false,monitor:null};
  const process=async()=>{if(!state.active||state.processing||!state.queue.length)return;state.processing=true;const blob=state.queue.shift();try{await chrome.runtime.sendMessage({type:'hf-offscreen-audio-chunk',tabId,dataUrl:await asDataUrl(blob)});}finally{state.processing=false;if(state.queue.length)process();}};
  const next=()=>{
    if(!state.active)return;state.chunks=[];state.started=performance.now();state.speech=false;state.silence=0;state.stopping=false;state.recorder=new MediaRecorder(audioStream,mime?{mimeType:mime}:undefined);
    state.recorder.ondataavailable=event=>{if(event.data.size)state.chunks.push(event.data);};
    state.recorder.onstop=()=>{const blob=new Blob(state.chunks,{type:mime||'audio/webm'});if(state.active&&blob.size>800){if(state.queue.length>=10)state.queue.shift();state.queue.push(blob);process();}next();};state.recorder.start();
  };
  state.monitor=setInterval(()=>{
    if(!state.active||state.recorder?.state!=='recording'||state.stopping)return;analyser.getByteTimeDomainData(samples);let energy=0;for(const value of samples){const n=(value-128)/128;energy+=n*n;}const rms=Math.sqrt(energy/samples.length),now=performance.now(),elapsed=now-state.started;
    if(rms>.018){state.speech=true;state.silence=0;}else if(state.speech&&!state.silence)state.silence=now;
    if((state.speech&&state.silence&&now-state.silence>650&&elapsed>1100)||elapsed>8000){state.stopping=true;state.recorder.stop();}
  },100);next();return {ok:true};
}

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  if(message?.type==='hf-offscreen-start'){start(message.streamId,message.tabId).then(reply,error=>reply({ok:false,error:error.message}));return true;}
  if(message?.type==='hf-offscreen-stop'){if(!session||!message.tabId||session.tabId===message.tabId)stop().then(()=>reply({ok:true}));else reply({ok:true});return true;}
});
