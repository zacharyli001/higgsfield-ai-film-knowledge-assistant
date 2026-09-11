# Higgsfield AI 影视知识助手

面向中文 AI 影视创作者的 Chrome 扩展。它把 Higgsfield 页面、Community Project、专业提示词和无字幕视频整理成可阅读、可检索、可复用的中文知识，并帮助用户沉淀能够迁移到 TapNow 等平台的影视工作流。

> 本项目是独立开发工具，与 Higgsfield, Inc. 没有隶属或官方合作关系。Higgsfield 及相关标识归其权利人所有。

当前版本：**v3.10.8**　｜　最低 Chrome 版本：**138**　｜　Apple 本地语音识别：**macOS**

## 核心能力

### Higgsfield 全站翻译

- 扫描可见英文、动态加载内容、弹窗、菜单、评论、按钮提示、开放的 Shadow DOM 和匹配域名的内嵌页面。
- 提供中英对照、仅中文和仅原文三种显示方式。
- 可强制扫描整个 DOM，也可只处理阅读区域以减少 Token 消耗。
- 对 `pre`、`code` 和语法高亮提示词进行整块翻译，避免把摄影提示拆成孤立单词。
- 支持 About the project、学院页面、Community 项目介绍和复杂富文本结构。
- 本地缓存相同译文；模型、接口或术语库改变时使用独立缓存键。

### 第三方模型与翻译接口

支持五类常见协议：

- OpenAI Chat Completions
- OpenAI Responses
- Anthropic Messages
- Gemini `generateContent`
- Ollama Chat

内置 OpenRouter、DeepSeek、OpenAI、Anthropic、Gemini、Qwen、SiliconFlow、Moonshot、Groq、Mistral 和 Ollama 配置入口，也可填写兼容接口。SiliconFlow 翻译默认关闭推理模式，减少无效 Token 消耗。

### 影视与 AIGC 专有名词库

- 支持 TXT 和 JSON 导入、导出与本地保存。
- 每行使用 `英文 = 中文` 固定译法；两侧相同可保护品牌、人名、模型、`@角色` 和资产标签。
- 附带覆盖编剧、制片、摄影、镜头、灯光、美术、剪辑、调色、视效、声音、AIGC 视频和一致性排错的专业术语库。
- 每次请求只发送当前文本实际命中的术语，降低上下文长度。

### Community Project 学习助手

- 优先读取 Higgsfield Community Project 的 About the project。
- 一键生成项目速读、工作流还原和可迁移方案。
- 可围绕当前项目提问，例如角色一致性、镜头组织、资产管理和提示词结构。
- 把原文未说明的信息列为待验证内容，避免把推测写成事实。
- 分析结果可以保存为本地知识卡，并导出 Markdown 或 JSON。
- 迁移功能使用平台无关的能力描述，帮助把方法整理到 TapNow 或其他 AI 影视平台。

### 无字幕视频识别与翻译

- 捕获当前 Higgsfield 标签页音频，转换为 16 kHz 单声道 WAV。
- 使用 macOS Apple Speech 在本机识别英文，也可切换到在线语音转写接口。
- 支持仅中文、仅英文和英文先行后替换中文三种输出。
- 仅英文模式不调用大语言模型，不消耗翻译 Token。
- 中文翻译可沿用当前模型接口或使用 DeepL。
- Apple Speech 使用单队列稳定识别；识别完成后的短句可以并发翻译。
- 支持全屏字幕、字幕总开关、迟到字幕丢弃和短暂无语音片段自动跳过。

## 安装

1. 下载并解压 [`releases/higgsfield-ai-film-knowledge-assistant-v3.10.8.zip`](releases/higgsfield-ai-film-knowledge-assistant-v3.10.8.zip)，或直接使用仓库中的 `src` 文件夹。
2. 在 Chrome 地址栏打开 `chrome://extensions`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择 `src` 文件夹。
5. 打开扩展设置，选择服务商、填写自己的 API Key，并测试接口。
6. 刷新已经打开的 Higgsfield 页面。

更新时请覆盖原来的 `src` 文件并在扩展卡片点击“重新加载”。只要没有删除扩展，Chrome 本地存储中的 API 配置、术语库和知识卡都会保留。

## 启用视频字幕

### macOS 本地英文识别

1. 双击 `src/安装Apple本地语音.command`。
2. 按系统提示授予语音识别权限。
3. 在扩展设置中点击“检测 Apple 本地识别”。
4. 打开并播放 Higgsfield 视频。
5. 点击 Chrome 顶部工具栏中的扩展图标，授权捕获当前标签页音频。

Chrome 要求首次标签页音频授权由工具栏扩展图标触发。启动成功后，网页右下角控制条会立即显示“字幕翻译：开”，控制条可以直接关闭字幕。

## 数据与隐私

- API Key 保存在 Chrome 扩展本地存储中，不写入网页或导出文件。
- AI 模式会把待翻译文字发送到用户选择的服务商。
- Apple Speech 模式在本机识别音频；如果随后翻译成中文，只把识别出的英文短句发送给所选翻译接口。
- 扩展不读取 Cookie、密码或浏览历史，并跳过输入框、文本框和可编辑区域。
- 仓库及历史安装包不包含用户的 API Key、个人术语库或知识卡。

详细说明见 [PRIVACY.md](PRIVACY.md)。

## 项目结构

```text
src/          当前 Chrome 扩展源码
src/native/   macOS Apple Speech Native Messaging 助手源码
releases/     从 v1.0.0 起保留下来的历史安装包
docs/         架构、排错和版本说明
tests/        接口与配置页的静态测试
```

每个历史版本都有独立 Git 提交和版本标签。完整演进记录见 [CHANGELOG.md](CHANGELOG.md)。

## 本地验证

项目测试使用 Node.js：

```bash
node tests/test-background.js
node tests/test-engine.js
node --check src/content.js
node --check src/background.js
node --check src/offscreen.js
```

## 已知限制

- 图片和视频画面中直接印制的文字目前不做 OCR。
- 关闭的 Shadow DOM、跨域封闭组件和 CSS 伪元素无法直接读取。
- Apple 本地识别依赖 macOS 已安装的英文听写模型和系统语音识别权限。
- 第三方模型、接口可用性、速率限制和费用由相应服务商决定。
- Higgsfield 页面结构变化后，部分区域可能需要更新识别规则。

## 版权与使用

当前仓库没有附加开源许可证。未经版权所有者明确许可，默认版权权利保留。历史安装包仅用于版本追溯和个人备份。

