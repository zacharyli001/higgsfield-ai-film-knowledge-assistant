#import <Foundation/Foundation.h>
#import <Speech/Speech.h>

static void Send(NSDictionary *object) {
  NSData *data=[NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  uint32_t size=CFSwapInt32HostToLittle((uint32_t)data.length);
  fwrite(&size,4,1,stdout);fwrite(data.bytes,1,data.length,stdout);fflush(stdout);
}

static BOOL ReadBytes(void *buffer,size_t length) {
  uint8_t *cursor=buffer;size_t total=0;
  while(total<length){size_t count=fread(cursor+total,1,length-total,stdin);if(!count)return NO;total+=count;}return YES;
}

static BOOL Authorize(NSError **error) {
  __block SFSpeechRecognizerAuthorizationStatus status=[SFSpeechRecognizer authorizationStatus];
  if(status==SFSpeechRecognizerAuthorizationStatusNotDetermined){dispatch_semaphore_t semaphore=dispatch_semaphore_create(0);[SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus value){status=value;dispatch_semaphore_signal(semaphore);}];dispatch_semaphore_wait(semaphore,dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC));}
  if(status==SFSpeechRecognizerAuthorizationStatusAuthorized)return YES;
  if(error)*error=[NSError errorWithDomain:@"AppleSpeechHost" code:1 userInfo:@{NSLocalizedDescriptionKey:@"请在 macOS 系统设置 → 隐私与安全性 → 语音识别中允许 Apple Speech Host"}];return NO;
}

static NSString *Transcribe(NSString *base64,NSString *locale,NSError **error) {
  if(!Authorize(error))return nil;
  NSData *audio=[[NSData alloc] initWithBase64EncodedString:base64 options:NSDataBase64DecodingIgnoreUnknownCharacters];
  if(!audio){if(error)*error=[NSError errorWithDomain:@"AppleSpeechHost" code:2 userInfo:@{NSLocalizedDescriptionKey:@"无法解码 WAV 音频"}];return nil;}
  NSURL *url=[[NSURL fileURLWithPath:NSTemporaryDirectory()] URLByAppendingPathComponent:[NSString stringWithFormat:@"higgsfield-%@.wav",NSUUID.UUID.UUIDString]];
  if(![audio writeToURL:url options:NSDataWritingAtomic error:error])return nil;
  SFSpeechRecognizer *recognizer=[[SFSpeechRecognizer alloc] initWithLocale:[[NSLocale alloc] initWithLocaleIdentifier:locale?:@"en-US"]];
  if(!recognizer.available){if(error)*error=[NSError errorWithDomain:@"AppleSpeechHost" code:3 userInfo:@{NSLocalizedDescriptionKey:@"Apple 英文语音识别当前不可用"}];[[NSFileManager defaultManager] removeItemAtURL:url error:nil];return nil;}
  if(@available(macOS 10.15,*)){if(!recognizer.supportsOnDeviceRecognition){if(error)*error=[NSError errorWithDomain:@"AppleSpeechHost" code:4 userInfo:@{NSLocalizedDescriptionKey:@"尚未安装英文离线听写模型，请在系统设置的键盘/听写语言中添加 English (US)"}];[[NSFileManager defaultManager] removeItemAtURL:url error:nil];return nil;}}
  SFSpeechURLRecognitionRequest *request=[[SFSpeechURLRecognitionRequest alloc] initWithURL:url];request.shouldReportPartialResults=NO;request.taskHint=SFSpeechRecognitionTaskHintDictation;request.contextualStrings=@[@"Higgsfield",@"Claude",@"Seedance",@"Seedream",@"prompt",@"storyboard",@"keyframe",@"shot list",@"cinematography"];
  if(@available(macOS 10.15,*))request.requiresOnDeviceRecognition=YES;
  __block NSString *text=nil;__block NSError *recognitionError=nil;dispatch_semaphore_t semaphore=dispatch_semaphore_create(0);__block BOOL done=NO;
  SFSpeechRecognitionTask *task=[recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result,NSError *incoming){if(result)text=result.bestTranscription.formattedString;if((result&&result.final)||incoming){recognitionError=incoming;if(!done){done=YES;dispatch_semaphore_signal(semaphore);}}}];
  long timedOut=dispatch_semaphore_wait(semaphore,dispatch_time(DISPATCH_TIME_NOW,30*NSEC_PER_SEC));if(timedOut)[task cancel];[[NSFileManager defaultManager] removeItemAtURL:url error:nil];
  if(timedOut){if(error)*error=[NSError errorWithDomain:@"AppleSpeechHost" code:5 userInfo:@{NSLocalizedDescriptionKey:@"Apple 本地识别超时"}];return nil;}
  text=[text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];if(!text.length){if(error)*error=recognitionError?:[NSError errorWithDomain:@"AppleSpeechHost" code:6 userInfo:@{NSLocalizedDescriptionKey:@"这一段没有识别到清晰英文"}];return nil;}return text;
}

int main(void){@autoreleasepool{while(YES){uint32_t little=0;if(!ReadBytes(&little,4))break;uint32_t length=CFSwapInt32LittleToHost(little);if(!length||length>64*1024*1024)break;NSMutableData *body=[NSMutableData dataWithLength:length];if(!ReadBytes(body.mutableBytes,length))break;NSDictionary *message=[NSJSONSerialization JSONObjectWithData:body options:0 error:nil];NSNumber *messageId=message[@"id"]?:@0;NSString *action=message[@"action"]?:@"";if([action isEqualToString:@"ping"]){Send(@{@"id":messageId,@"ok":@YES,@"message":@"Apple 本地语音助手已连接；英文听写将在本机完成"});continue;}NSError *error=nil;NSString *text=nil;if([action isEqualToString:@"transcribe"]&&[message[@"audio"] isKindOfClass:NSString.class])text=Transcribe(message[@"audio"],message[@"locale"],&error);else error=[NSError errorWithDomain:@"AppleSpeechHost" code:7 userInfo:@{NSLocalizedDescriptionKey:@"未知请求"}];if(text)Send(@{@"id":messageId,@"ok":@YES,@"text":text});else Send(@{@"id":messageId,@"ok":@NO,@"error":error.localizedDescription?:@"Apple 本地识别失败"});}}return 0;}
