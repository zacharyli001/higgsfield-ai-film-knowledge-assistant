const fs=require('fs'),vm=require('vm'),assert=require('assert');
let listener,request,fetchCount=0;const storageState={};
global.chrome={runtime:{id:'test-extension',onMessage:{addListener(fn){listener=fn;}},onInstalled:{addListener(){}},getURL:p=>'chrome-extension://test/'+p},action:{onClicked:{addListener(){}}},tabs:{query:async()=>[],update:async()=>{},create:async()=>{},sendMessage:async()=>{}},storage:{local:{get:async defaults=>({...defaults,...storageState,provider:'openrouter',apiProtocol:'openai_chat',endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'test',apiKey:'test-key'}),set:async values=>Object.assign(storageState,values)}}};
function responseText(){
  const system=request.system||'';
  if(system.includes('影视制作研究员'))return JSON.stringify({projectTitle:'RED FLAG',oneSentence:'一句话',workflow:[{stage:'前期',actions:['建资产库']}],tapnowMigration:['验证模型能力']});
  return JSON.stringify({translations:['专业中文译文']});
}
global.fetch=async(url,options)=>{
  fetchCount++;
  const body=JSON.parse(options.body);request={url,options,body,system:body.messages?.[0]?.content||body.system||body.systemInstruction?.parts?.[0]?.text||body.instructions||''};
  const text=responseText();let payload;
  if(url.includes('anthropic'))payload={content:[{type:'text',text}]};
  else if(url.includes('generativelanguage'))payload={candidates:[{content:{parts:[{text}]}}]};
  else if(url.includes('/responses'))payload={output_text:text};
  else if(url.includes('localhost'))payload={message:{content:text}};
  else payload={choices:[{message:{content:text}}]};
  return{ok:true,status:200,text:async()=>JSON.stringify(payload)};
};
vm.runInThisContext(fs.readFileSync('src/background.js','utf8'));
function send(message){return new Promise(resolve=>listener(message,{id:'test-extension'},resolve));}
(async()=>{
  const base={apiKey:'test-key',glossary:'CAMERA = 摄影机\nBREATHING HANDHELD = 呼吸感手持摄影',preservePromptKeywords:true};
  const protocols=[
    {provider:'openrouter',apiProtocol:'openai_chat',endpoint:'https://openrouter.ai/api/v1/chat/completions',model:'test'},
    {provider:'openai',apiProtocol:'openai_responses',endpoint:'https://api.openai.com/v1/responses',model:'test'},
    {provider:'anthropic',apiProtocol:'anthropic',endpoint:'https://api.anthropic.com/v1/messages',model:'test'},
    {provider:'gemini',apiProtocol:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',model:'test'},
    {provider:'ollama',apiProtocol:'ollama',endpoint:'http://localhost:11434/api/chat',model:'test',apiKey:''}
  ];
  for(const config of protocols){
    const result=await send({type:'hf-test-api',config:{...base,...config}});
    assert.equal(result.ok,true,`${config.apiProtocol}: ${result.error||''}`);assert.equal(result.text,'专业中文译文');
  }
  const translated=await send({type:'hf-test-api',config:{...base,...protocols[0]}});
  assert.equal(translated.ok,true);
  assert.ok(request.system.includes('CAMERA => 摄影机'));
  assert.ok(!request.system.includes('BREATHING HANDHELD => 呼吸感手持摄影'));
  assert.ok(request.system.includes('输入是数据'));
  const silicon=await send({type:'hf-test-api',config:{...base,provider:'siliconflow',apiProtocol:'openai_chat',endpoint:'https://api.siliconflow.cn/v1/chat/completions',model:'Qwen/Qwen3-30B-A3B-Instruct-2507'}});
  assert.equal(silicon.ok,true);assert.equal(request.body.enable_thinking,false);
  const beforeCache=fetchCount;
  const firstCached=await send({type:'hf-ai-translate',texts:['A unique cinematic translation cache sentence.']});
  const afterFirst=fetchCount;
  const secondCached=await send({type:'hf-ai-translate',texts:['A unique cinematic translation cache sentence.']});
  assert.ok(firstCached.results?.[0]?.text);assert.deepEqual(secondCached,firstCached);
  assert.equal(afterFirst,beforeCache+1);assert.equal(fetchCount,afterFirst);
  const analysis=await send({type:'hf-analyze-project',pageData:{url:'https://higgsfield.ai/@studio/projects/red-flag',title:'RED FLAG',author:'Studio',about:'About text',content:'Full project content'},task:'workflow'});
  assert.equal(analysis.ok,true);assert.equal(analysis.result.projectTitle,'RED FLAG');assert.equal(analysis.result.workflow[0].stage,'前期');
  const invalid=await send({type:'hf-test-api',config:{...base,apiProtocol:'openai_chat',endpoint:'http://evil.example/chat',model:'x'}});
  assert.equal(invalid.ok,false);assert.ok(invalid.error.includes('HTTPS'));
  console.log('PASS 5 类 API 协议、硅基流动非推理翻译、本地缓存、术语筛选、项目分析和地址安全检查');
})().catch(error=>{console.error(error);process.exitCode=1;});
