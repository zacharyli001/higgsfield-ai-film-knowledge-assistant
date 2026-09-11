# 架构说明

## 页面翻译

`content.js` 负责扫描 Higgsfield DOM、开放 Shadow DOM 和同源内嵌内容，建立原文记录并呈现译文。`background.js` 统一处理不同模型协议、术语筛选、批量翻译、缓存和项目分析。

## 视频字幕

用户通过 Chrome 工具栏图标授权 `tabCapture`。`offscreen.js` 在离屏文档中接收标签页音频、执行语音活动检测并输出 16 kHz 单声道 WAV 分段。

Apple 模式通过 Chrome Native Messaging 把 WAV 发送到 `native/AppleSpeechHost.m`。本地助手调用 macOS Speech framework 识别英文。Apple 识别按单队列运行，识别完成后的中文翻译允许并发。

字幕结果带递增序号，内容脚本会丢弃迟到结果，并通过顶层 Popover 与框架广播让字幕在普通和全屏模式下保持可见。

## 数据边界

所有个人配置都保存在 Chrome 本地存储。源码只包含默认接口、示例模型和默认术语，不包含实际 API Key 或个人知识卡。

