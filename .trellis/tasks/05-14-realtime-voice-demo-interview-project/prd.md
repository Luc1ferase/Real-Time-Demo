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
- **Multi-provider Realtime layer**: 用户运行时可切换 OpenAI / Gemini
  - **OpenAI**: `@openai/agents-realtime` v0.11.1（WebRTC + 自动 VAD/打断）
  - **Gemini**: `@google/genai` + 直接 WebSocket bidi（`gemini-3.1-flash-live-preview`，2026-05-14 已实测 setup 通过）
- **Backend**: Next.js Route Handlers
  - `POST /api/realtime/token/openai` — 调 `/v1/realtime/client_secrets` 签发 ephemeral token，带 `OpenAI-Safety-Identifier`
  - `POST /api/realtime/token/gemini` — 返回 Google API key（受口令门保护；下面安全说明）
  - `POST /api/translate` — 字幕 overlay 用，文本→文本翻译（OpenAI `gpt-4o-mini` 或 Gemini `gemini-3.1-flash-lite`）
  - `proxy.ts` — 口令门控（cookie 验证），保护所有非 gate 路由
- **Deployment**: Vercel
  - 环境变量：`OPENAI_API_KEY`、`GOOGLE_AI_STUDIO_KEY`、`DEMO_PASSWORD`
  - OpenAI 走 ephemeral token，密钥永不离开 server
  - Gemini 没有 ephemeral token 概念，**API key 会被发到浏览器**——靠口令门 + 短 TTL 配额 + 随时 rotate 来管理风险（demo 安全级别，不是生产标准）

### 模型选型

| 用途 | OpenAI | Gemini | 备注 |
|---|---|---|---|
| Interview 主对话 | `gpt-realtime-2` ($32 in / $64 out per 1M) | `gemini-3.1-flash-live-preview` ($3 in / $12 out per 1M ≈ 10x 便宜) | 用户可在 UI 切换 |
| Interview 备选 | `gpt-realtime-1.5` / `gpt-realtime-mini` | `gemini-2.5-flash-native-audio-latest` | 设置面板下拉 |
| Translator 路由 | `gpt-realtime-translate` (`/v1/realtime/translations`, $0.034/min) | 用 `gemini-3.1-flash-live-preview` + 强翻译 prompt（Gemini 暂无专用翻译端点） | 两边实现差异较大，UI 上注明 |
| Overlay 字幕翻译 | `gpt-4o-mini` chat | `gemini-3.1-flash-lite` chat | 跟随主对话提供商 |

### 音色 / 语音

- **OpenAI**: 默认 `marin`，可切 `cedar` / `alloy` / `ash` / `ballad` / `coral` / `echo` / `sage` / `shimmer` / `verse`（10 个）
- **Gemini**: 默认 `Puck`，可切 `Charon` / `Kore` / `Fenrir` / `Aoede`（5 个）
- **重要约束（OpenAI）**：音色在 session 第一次出音后不能改 → UI 必须在用户连接前选定，切换音色 = 重建 session
- **音频采样率差异**：OpenAI 输入输出皆 24 kHz；Gemini 输入 **16 kHz**、输出 24 kHz。需要在浏览器端做重采样（Web Audio API `AudioContext.sampleRate` + offline resample，或捕获时直接设 16/24 kHz）

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
- **提供商切换器**：默认 OpenAI，可切 Gemini（运行时切换 → 重建 session）
- 模型切换器（按提供商分组）：
  - OpenAI: `gpt-realtime-2`（默认）/ `gpt-realtime-1.5` / `gpt-realtime` / `gpt-realtime-mini`
  - Gemini: `gemini-3.1-flash-live-preview`（默认）/ `gemini-2.5-flash-native-audio-latest` / `gemini-2.5-flash-native-audio-preview-12-2025`
- 音色选择（按提供商分组）：
  - OpenAI: `marin`（默认）/ `cedar` / `alloy` / `ash` / `ballad` / `coral` / `echo` / `sage` / `shimmer` / `verse`
  - Gemini: `Puck`（默认）/ `Charon` / `Kore` / `Fenrir` / `Aoede`
- 推理强度（仅 `gpt-realtime-2`）：`minimal` / `low` / `medium` / `high` / `xhigh`（5 档，flagship 独有）
- 切换提供商/模型/音色会**触发 session 重建**（UI 显示"重连中…"，因为 OpenAI 音色一旦发声就锁定，且提供商切换需要新的连接管线）

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
- [ ] 任意路由进入前必须输入 `DEMO_PASSWORD`（Edge proxy 拦截，cookie 持久 24h）
- [ ] `OPENAI_API_KEY` 仅在 server route handler 出现，不进客户端 bundle、不进 network 请求 body（OpenAI 走 ephemeral token）
- [ ] `GOOGLE_AI_STUDIO_KEY` 在客户端可见时**必须**先经过口令门保护，且 README 明确标注此限制（demo 级安全模型，不是生产标准）
- [ ] README 包含：本项目能力截图、5 分钟启动指引、架构图、提供商对比表、关键技术决策（为什么做多提供商抽象 / 为什么 /translator 用 OpenAI 专用端点 / overlay 怎么不污染主会话 / Gemini key 暴露的权衡）

**/interview 路由**
- [ ] 点"开始面试"按钮，3 秒内能开始说话、听到 AI 回复（任一提供商）
- [ ] AI 说话时用户可打断（barge-in），AI 立即停下并响应（任一提供商）
- [ ] 双方 transcript 流式显示
- [ ] AI 可按阶段切换（warm-up → technical → behavioral → feedback），通过 function calling 实现（两个提供商的 function 协议都要适配）
- [ ] 面试结束生成评分卡片（沟通 / 技术深度 / 结构化思维 3 个维度），可截图分享
- [ ] 设置面板可切换**提供商 / 模型 / 音色 / 推理强度**，切换后重建 session
- [ ] 在两个提供商之间切换，对话能继续流畅进行（验证抽象层不漏抽象）

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
- [`research/gemini-live-api.md`](research/gemini-live-api.md) — Gemini Live API 2026-05-14 实测状态（free tier 可用、`gemini-3.1-flash-live-preview` WS bidi 已验证、协议差异表、与 OpenAI 的对比）

## Technical Approach

### 目录结构（计划）

```
src/
  app/
    (gated)/                  # 口令门控区
      interview/page.tsx      # AI 模拟面试官 + 可选字幕 overlay
      translator/page.tsx     # 实时同传
      layout.tsx              # 顶部导航 + 共享设置抽屉（含提供商切换器）
    api/
      realtime/token/
        openai/route.ts       # OpenAI ephemeral token（已实现）
        gemini/route.ts       # Gemini key 派发（受口令门保护）
      translate/route.ts      # 字幕翻译，按当前提供商路由
    page.tsx                  # 首页（介绍 + 进入入口）
    gate/page.tsx             # 口令输入页（已实现）
  lib/
    realtime/
      provider.ts             # RealtimeProvider 接口 + 类型契约
      openai-provider.ts      # @openai/agents-realtime 实现
      gemini-provider.ts      # @google/genai + WS bidi 实现
      use-realtime-session.ts # provider-agnostic hook
      use-translator-session.ts
      tools.ts                # function tools 定义（双方协议适配在 provider 内）
      instructions.ts         # system instructions
    translate/
      translate-stream.ts     # transcript → /api/translate
    env.ts                    # 已实现
    gate.ts                   # 已实现
  proxy.ts                    # 口令门控（已实现）
```

### 关键技术决策（ADR-lite）

1. **多提供商抽象层（OpenAI + Gemini 运行时切换）**
   - Context: 开发期想用免费 Gemini，生产期可能换 OpenAI；纯换不便宜（协议不兼容），但做成抽象层反而能讲出多提供商工程能力
   - Decision: 定义 `RealtimeProvider` 接口（`connect`、`disconnect`、事件订阅），两套实现（OpenAI / Gemini），UI 提供商切换会重建 session
   - Consequences: 多 ~1 天工作量；面试故事最强（"我评估两个提供商、抽出 transport-agnostic 接口、用户可即时对比"）；生产期换提供商零成本

2. **使用官方 SDK `@openai/agents-realtime` 而非裸 WebRTC（OpenAI 一侧）**
   - Context: 1-2 天预算，需要稳定的打断/VAD/历史管理
   - Decision: 用 `RealtimeAgent` + `RealtimeSession` 高层 API
   - Consequences: 代码量大幅减少；牺牲一点底层可见性

3. **Gemini 一侧用 `@google/genai` + 原生 WebSocket bidi**
   - Context: Gemini Live 只支持 WebSocket bidi（无 WebRTC），没有官方 React SDK
   - Decision: 用 `@google/genai` 的 live API；浏览器侧手写 WS + AudioWorklet 处理 16kHz 输入重采样
   - Consequences: 比 OpenAI 一侧代码多；可讲"为每个提供商挑最优传输"的工程判断

4. **/translator 用 OpenAI 专用 `gpt-realtime-translate` 端点**（提供商绑定）
   - Context: 同传需要"只输出翻译、不要对话式废话"，OpenAI 有专用端点，Gemini 没有
   - Decision: /translator 强制使用 OpenAI，UI 标注"翻译模式仅 OpenAI"
   - Consequences: 不是完全 provider-agnostic，但避免给 Gemini 写一套不可靠的 prompt-hack

5. **字幕 overlay 用 chat completion 旁路而非加 Realtime channel**
   - Context: 想在面试模式叠加翻译字幕，又不能干扰对话
   - Decision: 监听主对话 transcript done 事件 → 调 `/api/translate`（按当前提供商选 `gpt-4o-mini` 或 `gemini-3.1-flash-lite`）→ 推回前端显示
   - Consequences: 零干扰原对话；翻译延迟 1-2 秒可接受

6. **Gemini key 暴露给浏览器，靠口令门 + rotation 控制风险**
   - Context: Gemini AI Studio 没有 ephemeral token 概念，原生 API key 必须用 `?key=` 直传
   - Decision: 接受这个权衡，但加三层保护：(a) 口令门 (b) 用专用低额度 key (c) README 明确警告 + 每周 rotate
   - Consequences: 不是生产标准，但 demo 阶段可控；可在面试时主动讲这个权衡和我看到的"如果是生产"该怎么做（服务端代理 WS）

7. **口令门控用 Edge proxy 而非完整 auth 系统**
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
- **2026-05-14** **新增多提供商支持**：OpenAI + Gemini 运行时可切换。原因：测试到 Gemini key 在 free tier 可用，且 Gemini Live 比 OpenAI 便宜 10x；做成抽象层既省开发期成本也强化面试故事。代价：约 +1 天工作量；/translator 路由保持 OpenAI 专属（Gemini 无专用翻译端点）
