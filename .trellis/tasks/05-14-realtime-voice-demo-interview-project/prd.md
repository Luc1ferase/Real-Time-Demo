# Realtime Voice Demo (Interview Project)

## Goal

为美国公司远程岗位的面试准备一个 OpenAI Realtime API（语音）方向的作品集 demo。用户此前完全不熟悉 Realtime API，需要在 1-2 天内做出一个**小而精、能在 3-5 分钟里讲清楚技术深度**的项目，重点是代码质量和讲故事能力。

## What I already know

- 目标 API：**OpenAI Realtime API**（speech-to-speech，支持 WebSocket 和 WebRTC，支持函数调用、打断、可配置 instructions）
- 岗位方向：**全栈 / 前端为主**（UI 体验是加分项）
- 规模：**1-2 天**，小而精
- 用户：luciferase，此前完全不了解 Realtime API
- 应聘对象：美国远程公司岗位
- 投递日期上下文：2026-05-14

## Tech Stack (Decided, verified against research/realtime-api-overview.md @ 2026-05-14)

- **Framework**: Next.js 16 (App Router) + TypeScript strict
- **Styling**: Tailwind CSS + shadcn/ui
- **Realtime SDK**: **`@openai/agents-realtime` v0.11.1**（官方 SDK，封装了 WebRTC peer connection、ephemeral token 流程、VAD、打断、conversation history）
  - 用 `RealtimeAgent` + `RealtimeSession` 高层 API，避免手写 SDP / data channel
  - Node side 同一 SDK 自动 fallback 到 WebSocket
- **Backend**: Next.js Route Handlers
  - `POST /api/realtime/token` — 调用 OpenAI `POST /v1/realtime/client_secrets` 签发 ephemeral token，带 `OpenAI-Safety-Identifier` 头
  - `POST /api/translate` — 字幕 overlay 用，输入文本 → `gpt-4o-mini` chat completion → 翻译文本
  - `middleware.ts` — 口令门控（cookie 验证），保护两条 demo 路由
- **Deployment**: Vercel
  - 环境变量：`OPENAI_API_KEY`、`DEMO_PASSWORD`
  - 全程仅 server-side 持有 API key

### 模型选型

| 用途 | 模型 | 端点 | 价格 | 备注 |
|---|---|---|---|---|
| Interview 主对话 | **`gpt-realtime-2`** | `/v1/realtime` | $32 in / $64 out / 1M audio tokens | 默认，GPT-5-class 推理，128K 上下文 |
| Interview 备选切换 | `gpt-realtime-1.5`, `gpt-realtime`, `gpt-realtime-mini` | `/v1/realtime` | 同上 / mini 便宜 ~3x | UI 提供下拉切换，切换会重建 session |
| Translator 路由 | **`gpt-realtime-translate`** | `/v1/realtime/translations` | **$0.034/min flat** | 专用翻译模型，70+ 输入 → 13 输出语言，**不用普通对话模型 + prompt hack** |
| Overlay 字幕翻译 | `gpt-4o-mini` | `/v1/chat/completions` | 极便宜 | 文本→文本，已经从 Realtime transcript 拿到原文 |

### 音色

- 默认 **`marin`**（OpenAI 当前推荐高质量音色）
- 设置面板可切换：`marin` / `cedar` / `alloy` / `ash` / `ballad` / `coral` / `echo` / `sage` / `shimmer` / `verse`
- **重要约束**：音色在 session 第一次出音后不能改 → UI 必须在用户连接前选定，切换音色 = 重建 session

## Scenario (Decided)

同一 repo、**两条独立路由**，共享 Realtime 基础设施和一个翻译"原子能力"：

### Route 1: `/interview` — AI Mock Interviewer（主场景）
- 模拟技术/行为面试官，function calling 切换面试阶段（warm-up → technical → behavioral → feedback）
- 结束生成评分卡片
- **可选叠加：实时翻译字幕 overlay**——开启后底部滚动显示 AI 提问的中文翻译，帮助候选人理解
  - 数据流：Realtime API 已实时推 transcript 事件 → 取每句完整 transcript → 后端调 `gpt-4o-mini` 翻译 → 推给前端显示
  - 关键：**只读消费 transcript，对原 Realtime session 零干扰**

### Route 2: `/translator` — Live Translator（次场景，跨国公司友好）
- **使用专用 `gpt-realtime-translate` 模型 + `/v1/realtime/translations` 端点**（research 发现：OpenAI 有专门的实时翻译端点，比普通对话模型靠 prompt 翻译可靠得多，且 flat $0.034/min 定价更可预测）
- 用户选择翻译方向（源语言下拉 + 目标语言下拉，覆盖中/英/日/西/法等主流）
- 用户说话 → 流式输出翻译音频 + 字幕
- 双语对照 UI（左原文 / 右译文，逐句对应）
- 注意：translation session 不发送 `response.create`（端点设计如此）

### Shared atoms
- `useRealtimeSession()` hook：封装 ephemeral token 获取、WebRTC peer connection 建立、event 订阅
- `/api/realtime-token`：后端签发 ephemeral session token
- `/api/translate`：后端转发 chat completion，输入文本、输出翻译（被 overlay 用）
- 基础 UI 组件：MicButton、TranscriptStream、AudioVisualizer

两条路由各自独立的 Realtime session，state 互不污染。

## Open Questions

全部 resolved（见 Decision Log）。

## Requirements (evolving)

**共享基础**
- 浏览器内一键启动语音对话（麦克风 + 扬声器，WebRTC 直连 OpenAI）
- 支持用户随时打断 AI（barge-in）
- 实时显示双方 transcript（streaming）
- 后端最小化：仅签发 ephemeral session token，不代理音频流
- 全程 TypeScript，代码可读性优先
- 顶部导航可在两个模式之间切换，切换时重建 session 并注入不同 instructions

**Mode 1: AI Mock Interviewer**
- 用户进入时选择面试岗位类型（如 Frontend / Backend / Fullstack）和难度
- AI 按阶段引导：warm-up → 2-3 道技术题 → 1-2 道行为题 → 总结反馈
- 阶段切换通过 function calling 实现（AI 主动调 `advance_stage` 工具）
- 结束生成一张评分卡片（沟通、技术深度、结构化思维 3 个维度）

**Mode 2: Live Translator（交替传译）**
- 用户选择翻译方向（中→英 / 英→中 / 自动检测）
- AI 仅输出翻译结果，不加任何对话式回应（强 prompt 约束）
- 用户说话停顿后 AI 翻译该段并语音播报
- 双语对照 UI（左中右英，逐句对应）

**Settings (全局)**
- 模型切换器（仅 /interview）：默认 `gpt-realtime-2`，可选 `gpt-realtime-1.5` / `gpt-realtime` / `gpt-realtime-mini`
- 音色选择（仅 /interview）：默认 `marin`，可选 `cedar` / 8 个原始音色
- 推理强度（仅 `gpt-realtime-2`）：`minimal` / `low` / `medium` / `high` / `xhigh`（5 档，flagship 独有）
- 切换模型/音色会**触发 session 重建**（UI 显示"重连中…"，因为音色一旦发声就锁定）

**Session 时长保护**
- Realtime API 硬上限 60 分钟（OpenAI 强制断开），未来不可扩展
- 客户端 10 分钟 idle timer + 友好提示"session will end in 60s, click to extend"
- 防止候选人忘关导致烧钱

**会话历史（/interview 专用）**
- 每次 interview 结束自动把 `{ timestamp, model, voice, transcript[], score_card }` 存到 `localStorage`
- 顶部导航增加 "History" 入口，列出过往会话
- 点入查看完整 transcript + 评分卡，支持删除
- 仅本机存储，不进后端（隐私安全 + 零基础设施）

## Acceptance Criteria

**通用**
- [ ] 任意路由进入前必须输入 `DEMO_PASSWORD`（middleware 拦截，cookie 持久 24h）
- [ ] `OPENAI_API_KEY` 仅在 server route handler 出现，不进客户端 bundle、不进 network 请求 body
- [ ] 浏览器 devtools network 面板看不到任何裸 API key
- [ ] README 包含：本项目能力截图、5 分钟启动指引、架构图、关键技术决策说明（为什么用 SDK / 为什么 /translator 用专用端点 / overlay 怎么不污染主会话）

**/interview 路由**
- [ ] 点"开始面试"按钮，3 秒内能开始说话、听到 AI 回复
- [ ] AI 说话时用户可打断（barge-in），AI 立即停下并响应
- [ ] 双方 transcript 流式显示
- [ ] AI 可按阶段切换（warm-up → technical → behavioral → feedback），通过 function calling 实现
- [ ] 面试结束生成评分卡片（沟通 / 技术深度 / 结构化思维 3 个维度），可截图分享
- [ ] 设置面板可切换模型、音色、推理强度，切换后重建 session

**/translator 路由**
- [ ] 选择源/目标语言后开始，用户说话 → 听到译文音频 + 看到双语字幕
- [ ] 译文不含"Sure, the translation is..."这类对话式废话（验证专用端点效果）
- [ ] 至少支持 中↔英、中↔日 双向

**Subtitle Overlay (在 /interview 内可开关)**
- [ ] 开关默认关，开启后 AI 每说完一句，约 1-2 秒内在底部 banner 出现中文字幕
- [ ] 开关 overlay 不会重建 Realtime session（验证零干扰原则）

**Session 保护**
- [ ] 闲置 10 分钟自动断开，显示"已结束，点击重连"
- [ ] 接近 60 分钟硬上限前 60 秒弹提示

## Definition of Done

- TypeScript strict 通过，ESLint/Prettier 配置齐全
- README 包含架构图、启动步骤、技术决策说明
- 代码组织清晰，关键模块有简短注释（only WHY）
- 可在面试中 3-5 分钟讲完核心技术点

## Out of Scope (explicit)

- 用户登录 / 多用户隔离
- 对话历史持久化（DB / 跨会话记忆）
- 复杂的 RBAC / 计费 / 多租户
- 移动端原生 App（PWA 即可）
- 自训练模型 / 微调

## Research References

- [`research/realtime-api-overview.md`](research/realtime-api-overview.md) — OpenAI Realtime API 2026-05-14 完整当前状态（模型清单 / 端点 / 事件协议 / SDK / 音色 / 限制）

## Technical Approach

### 目录结构（计划）

```
app/
  (gated)/              # 口令门控区
    interview/page.tsx  # AI 模拟面试官 + 可选字幕 overlay
    translator/page.tsx # 实时同传
    layout.tsx          # 顶部导航 + 共享设置抽屉
  api/
    realtime/token/route.ts   # 签发 ephemeral token
    translate/route.ts        # 字幕翻译（gpt-4o-mini chat）
  page.tsx              # 首页（介绍 + 进入入口）
  gate/page.tsx         # 口令输入页
lib/
  realtime/
    use-realtime-session.ts   # @openai/agents-realtime 的 React hook 封装
    use-translator-session.ts # /v1/realtime/translations 专用 hook
    tools.ts                  # function tools 定义（advance_stage, give_feedback）
    instructions.ts           # 各路由的 system instructions
  translate/
    translate-stream.ts       # 拿 Realtime transcript 调 /api/translate
middleware.ts          # 口令门控
```

### 关键技术决策（ADR-lite）

1. **使用官方 SDK `@openai/agents-realtime` 而非裸 WebRTC**
   - Context: 1-2 天预算，需要稳定的打断/VAD/历史管理
   - Decision: 用 `RealtimeAgent` + `RealtimeSession` 高层 API
   - Consequences: 代码量大幅减少；牺牲一点底层可见性，但面试演示时可以讲"我选择官方 SDK 而非重造轮子"作为工程判断点

2. **/translator 用专用 `gpt-realtime-translate` 端点而非普通对话模型**
   - Context: 同传需要"只输出翻译、不要对话式废话"
   - Decision: 直接用 `/v1/realtime/translations` + `gpt-realtime-translate`
   - Consequences: 更可靠的翻译质量；flat 定价更可预测；展示"为每个 job 选对工具"的产品意识

3. **字幕 overlay 用 chat completion 旁路而非加 Realtime channel**
   - Context: 想在面试模式叠加翻译字幕，又不能干扰对话
   - Decision: 监听 Realtime `response.audio_transcript.done` → 调 `/api/translate`（gpt-4o-mini chat）→ 推回前端显示
   - Consequences: 零干扰原对话；翻译延迟 1-2 秒可接受；额外成本极低

4. **口令门控用 middleware 而非完整 auth 系统**
   - Context: 仅需防陌生人乱试 demo URL 烧钱，不是真实产品
   - Decision: 单一 `DEMO_PASSWORD` 环境变量 + cookie 验证
   - Consequences: 5 分钟实现；如果未来想推广到真实多用户，需要替换为 NextAuth 之类

## Decision Log

- **2026-05-14** 模型默认 `gpt-realtime-2`（已 GA，旗舰），UI 提供下拉切换其他 Realtime 模型
- **2026-05-14** 音色默认 `marin`（OpenAI 推荐高质量音色之一）
- **2026-05-14** 同传走专用端点而非普通对话模型 + prompt hack
- **2026-05-14** 字幕 overlay 列入 MVP（最强故事点）
- **2026-05-14** 部署 Vercel + 口令门控，不做限速
- **2026-05-14** 加 localStorage 会话历史页（额外 ~1h 工作量，强化前端能力展示）
- **2026-05-14** /translator UI 按段分组显示（一句一行，类 DeepL Live）
