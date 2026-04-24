# 儿童英文读物/动画 Quiz 应用 — 设计规范

**日期**: 2026-04-22
**作者**: tassadar2002@gmail.com（与 Claude 协作起草）
**状态**: Draft

---

## 1. 背景与目标

自用级的 Web 应用，帮助 8 岁儿童在读英文书籍 / 看英文动画片后做配套选择题，巩固词汇、句子理解与阅读理解。题目由 OpenAI 兼容接口的 LLM（默认 DeepSeek，可通过 env 切换任一兼容 provider）基于管理员提供的原文自动生成，管理员审核后发布到孩子端。

### 明确在范围内

- 书籍系列 / 动画系列 及其下属单册/单集 的管理
- 短内容的平铺 Quiz；长内容的章节化 Quiz
- 三类题目：难词、句子意思理解、阅读理解；每题 3 选 1
- AI 自动出题 + 人工审核发布
- 原文输入：粘贴文本（MVP）；文件上传 PDF/EPUB/SRT（Phase 2）
- 管理员单密码登录；孩子端无需登录
- 部署到云端（Vercel），可公网访问

### 明确不在范围内

- 用户账号体系（仅一个管理员；孩子端匿名）
- 做题进度/成绩历史记录
- 错题本 / 间隔重复 / 排行榜
- 支付 / 订阅 / 多租户
- 离线 / PWA
- 多语言 i18n（UI 固定中文，题目固定英文）

### 目标用户

- **主要使用者**：家长（管理员）一人 + 8 岁儿童一人
- **题目语言难度**：由 AI 根据原文自动判定并匹配，不锚定固定 CEFR 等级

---

## 2. 技术栈

| 层 | 选择 | 原因 |
|---|---|---|
| 前端 + 后端 | Next.js 15 (App Router) + TypeScript | 单体项目，最短路径 |
| 样式 | Tailwind CSS | 搭配「清爽学院风」配色（蓝/青/白） |
| 数据库 | Supabase Postgres | Free 套餐够自用 |
| ORM | Drizzle | TypeScript 友好，依赖少 |
| 对象存储 | Supabase Storage | 上传原始文件备份 |
| Auth | `iron-session` (自建单密码) | 不上 NextAuth，场景简单 |
| LLM | OpenAI SDK + 自定义 `baseURL` | 默认 DeepSeek，可 env 切换任一兼容 provider |
| 文件解析 | `pdf-parse`、`epub2`、自写 SRT 解析 | Node 原生，服务端执行 |
| 部署 | Vercel | 与 Next.js 无缝集成，免费额度够用 |
| 测试 | Vitest（单元+集成）、Playwright（E2E） | 标准 Node 生态 |
| 包管理 | pnpm | 更快、空间效率更高 |

---

## 3. 数据模型

### 3.1 表结构（Drizzle schema 简述）

```ts
// series: 系列（书或动画）
series {
  id: uuid PK
  kind: 'book' | 'animation'
  title: string
  cover_url: string?
  description: text?
  created_at: timestamp
}

// title: 系列下的单本书或单集动画
title {
  id: uuid PK
  series_id: uuid FK -> series.id
  name: string
  cover_url: string?
  order_index: int
  is_long: boolean                      // 管理员手动勾选；true 则走章节
  status: 'draft' | 'published'         // 孩子端仅查 published
  created_at: timestamp
}

// chapter: 仅 is_long=true 的 title 下有
chapter {
  id: uuid PK
  title_id: uuid FK -> title.id
  name: string
  order_index: int
  status: 'draft' | 'published'
  created_at: timestamp
}

// source_material: AI 出题用的原文，多态挂到 title 或 chapter
source_material {
  id: uuid PK
  owner_type: 'title' | 'chapter'
  owner_id: uuid
  text: text                            // 纯文本（粘贴或从文件解析而来）
  file_url: string?                     // 可选原文件备份 (Supabase Storage)
  created_at: timestamp
}

// question: 题目，多态挂到 title 或 chapter
question {
  id: uuid PK
  owner_type: 'title' | 'chapter'
  owner_id: uuid
  category: 'vocab' | 'sentence' | 'reading'
  stem: text                            // 题干（英文）
  options: jsonb                        // ["A. ...", "B. ...", "C. ..."]
  correct_index: int                    // 0 / 1 / 2
  explanation: text                     // 中文解释
  order_index: int
  created_at: timestamp
}
```

### 3.2 关键设计点

- **多态外键**：`source_material` 和 `question` 都用 `owner_type + owner_id` 挂到 title 或 chapter，短/长内容代码路径统一。
- **发布粒度在 title / chapter 层**：`question` 本身无状态字段。管理员对一组题审核完毕后，翻 owner 的 `status` 到 `published`。
- **Series 无 status 字段**：由"至少含一个 published title（或 title 下至少一个 published chapter）"来决定孩子端是否展示。
- **不存做题记录**：没有 `attempt` 或 `answer` 表。

### 3.3 索引

- `title(series_id, status)`：孩子端按系列查 published titles
- `chapter(title_id, status)`：长书章节列表
- `question(owner_type, owner_id)`：生成/审核/做题时按 owner 取题

---

## 4. 路由

### 4.1 孩子端（无需认证）

| 路由 | 说明 |
|---|---|
| `/` | 首页，按 `kind=book/animation` 两个 tab 显示所有至少有一个 published 子项的系列 |
| `/s/[seriesId]` | 系列详情：列出该系列下所有 published titles |
| `/t/[titleId]` | Title 详情：`is_long=false` 则显示「开始 Quiz」按钮；`is_long=true` 则显示章节列表 |
| `/t/[titleId]/quiz` | 短内容 Quiz 页（仅 `is_long=false`） |
| `/c/[chapterId]/quiz` | 章节 Quiz 页 |
| `/result` | 直接访问时显示"无本次答卷"引导；实际结果视图内嵌在 `/t/.../quiz` 或 `/c/.../quiz` 页中，通过 React state 切换视图阶段（见 Section 5.1） |

### 4.2 管理员端（`/admin/*`，middleware 检查 session）

| 路由 | 说明 |
|---|---|
| `/admin/login` | 单密码登录 |
| `/admin` | Dashboard：系列列表 + 新建 |
| `/admin/series/[id]` | 系列下 titles 管理 |
| `/admin/titles/[id]` | 编辑 title 基本属性 / 原文 / 题目（若 `is_long=false`）；或章节列表（若 `is_long=true`） |
| `/admin/chapters/[id]` | 章节原文 / 题目管理 |
| `/admin/titles/[id]/review` 或 `/admin/chapters/[id]/review` | 题目审核视图：inline 编辑 + 单题重生 + 整组发布 |

### 4.3 API / Server Actions

| 路径 | 说明 |
|---|---|
| `/api/login` | 管理员登录；成功返回带 iron-session cookie |
| `/api/logout` | 清除 session |
| `/api/generate` | 对指定 owner（title / chapter）基于当前 `source_material.text` 批量生成题目 |
| `/api/regenerate-one` | 对单个 `question.id` 重新生成一道题 |
| `/api/upload` | 上传文件（PDF/EPUB/SRT），返回解析后的纯文本（Phase 2） |
| Server Actions | 系列 / title / chapter / source_material / question 的 CRUD 与 `status` 翻转 |

---

## 5. 核心组件

### 5.1 孩子端组件

- **`<SeriesGrid>`**：卡片网格，每张卡片显示类型图标（📚 / 🎬）+ 标题
- **`<TitleList>`**：系列页内列表项；显示标题 + 副标题；若 `is_long=true` 在右上角标「章节」
- **`<ChapterList>`**：长 title 内的章节列表；不展示"做过/没做过"状态（因为不存进度）
- **`<QuizRunner>`**：核心做题组件 + 结果视图合并在同一个 client component
  - 初始化时：取所有题 → 打乱题目顺序 → 每题内部再打乱选项顺序（记录 `shuffledToOriginalIndex` 映射以核对答案）
  - 状态：`phase: 'quiz' | 'result'`、`currentIndex`、`answers[]`（每项是"用户选择的原始 index"）
  - 无即时反馈；10 题答完后**不跳路由**，把 `phase` 切到 `'result'`，在同一页面渲染 `<ResultScreen>`（避免跨路由传大 state）
- **`<ResultScreen>`**：显示总分（如 `8 / 10`）+ 错题列表；错题可点击展开看题干、三个选项、正确答案、中文 AI 解释

### 5.2 管理员端组件

- **`<SourceMaterialEditor>`**：两个 tab
  - Tab 1「粘贴文本」：大 textarea（monospace、autosize）
  - Tab 2「上传文件」：拖拽 + 点击选择；解析完填入 textarea；管理员可再次编辑后保存
- **`<GenerateButton>`**：调 `/api/generate`；loading 时禁用并显示进度提示
- **`<QuestionReviewList>`**：每题一行
  - 显示题干 / 选项 / 正确答案 / 中文解释
  - 支持 inline 编辑（编辑按钮 → 就地转为表单 → 保存/取消）
  - 「重新生成此题」按钮（可选输入提示词，如"这题太简单了，换难点"）
  - 「删除」按钮
- **`<PublishButton>`**：把 owner 的 `status` 翻到 `published`，带确认弹窗

---

## 6. AI 出题管线

### 6.1 生成流程

```
[管理员] 点「生成题目」
  → POST /api/generate { ownerType, ownerId }
  → 读取 source_material.text
  → 构造 prompt（见 6.2）
  → OpenAI-compatible API 调用（response_format=json_object）
  → Zod 校验返回结构（见 6.3）
  → 校验失败则重试（最多 2 次，指数退避）
  → 写入 question 表（默认 order_index 按生成顺序）
  → 返回审核视图
```

### 6.2 Prompt 设计（要点）

**系统角色**：英文儿童读物出题助手；服务对象 8 岁中国儿童；目标语言是英语。

**任务指令**：

1. 先内部判断原文的整体语言难度
2. 出 10 道选择题，每题 3 选项 1 正确
3. **类别分布**：`vocab`、`sentence`、`reading` 三类，围绕 3/3/4 浮动。**每类至少 2 题、至多 5 题**，总数必须为 10
4. 难度匹配：出题考察点的难度与原文整体难度匹配或略高一点点（避免全是孩子已经懂的词）
5. **`vocab`**：从原文挑真正有学习价值的名词/动词/形容词/词组/固定搭配；避开基础到不值得考的词（如 `big`、`go`、`is`）
6. **`sentence`**：考察对一句话整体意思的理解（"这句话在说什么 / 谁要做什么 / 发生了什么"），**不涉及语法 / 句型 / 时态 / 术语**。示例：原文 "Let's point at the tree." → 题干 "What does the speaker want to do?" 选项 ["Climb the tree", "Point at the tree", "Cut the tree down"]
7. **`reading`**：必须绑定原文具体细节；不出"大概意思""主题思想"这类空泛题
8. 每题必须有 `explanation`（中文）：说明正确答案为什么对、其他选项错在哪、以及相关的语法或词汇知识点
9. 输出严格 JSON，无额外注释/Markdown

**用户消息**：原文全文。批量生成接口（`/api/generate`）不接管理员自定义提示；自定义提示词仅用在 `/api/regenerate-one` 重生单题的场景。

**完整 prompt 模板在 `lib/ai/prompts.ts`**。

### 6.3 输出 Schema（Zod）

```ts
const QuestionSchema = z.object({
  category: z.enum(['vocab', 'sentence', 'reading']),
  stem: z.string().min(5),
  options: z.array(z.string().min(1)).length(3),
  correct_index: z.number().int().min(0).max(2),
  explanation: z.string().min(10),
});

const GenerateResponseSchema = z.object({
  questions: z.array(QuestionSchema).length(10),
}).refine(({ questions }) => {
  const counts = { vocab: 0, sentence: 0, reading: 0 };
  for (const q of questions) counts[q.category]++;
  return counts.vocab >= 2 && counts.vocab <= 5
    && counts.sentence >= 2 && counts.sentence <= 5
    && counts.reading >= 2 && counts.reading <= 5;
}, 'category distribution out of range');
```

### 6.4 重试策略

- JSON 解析失败 / schema 不合 / 类别分布越界 → 重试
- 最多 2 次重试（首次 + 2 retry = 共 3 次请求）
- 指数退避：1s → 3s
- 2 次后仍失败：不写库，返回错误给管理员："AI 生成失败，可修改原文后重试"

### 6.5 单题重生

- `/api/regenerate-one` 接收 `{ questionId, userHint? }`
- 读同 owner 的 source_material + 当前题上下文
- prompt 里要求生成**同 category**、避免与现有其他题重复
- 结果替换原 question（保持 `order_index` 不变）

### 6.6 输入边界

- `source_material.text` **< 50 词**：UI 禁用「生成」按钮
- `source_material.text` **> 20000 词**：UI 警告推荐拆章节，但仍允许继续（会提高单次成本）

---

## 7. 文件上传与解析（Phase 2）

- **PDF**：`pdf-parse` 提取纯文本
- **EPUB**：`epub2` 按章节提取；UI 展示章节清单，管理员勾选要导入的章节
- **SRT**：自写函数剥离时间戳和索引号，保留对白

**安全校验**：

- 文件大小上限：PDF/EPUB 20 MB，SRT 2 MB
- 文件类型白名单（扩展名 + 魔数双重校验）
- 解析超时 30s，超时即中止
- 上传文件备份到 Supabase Storage（路径 `uploads/<uuid>.<ext>`）

**流程**：

1. 管理员选择文件 → 前端直接上传到 `/api/upload`
2. 服务端校验 + 解析 → 返回 `{ text, fileUrl }`
3. 前端把 `text` 填到 `<SourceMaterialEditor>` 的 textarea，可手工再编辑
4. 管理员点「保存」触发 Server Action，写入 `source_material` 表（`text` + `file_url`）

---

## 8. 认证与安全

### 8.1 Auth

- 单管理员密码存 `ADMIN_PASSWORD`（env）
- `iron-session` cookie：`httpOnly`、`secure`、`sameSite=lax`、7 天过期
- `middleware.ts` 拦截所有 `/admin/**` 和 `/api/(generate|regenerate-one|upload)`，无 session 重定向到 `/admin/login`
- 登录失败限流：同 IP 3 次错误 → 锁定 10 分钟（内存 `Map<ip, {count, lockUntil}>`；进程重启清零）

### 8.2 API 保护

- `/api/generate`、`/api/regenerate-one`、`/api/upload`：必须有有效 session
- 孩子端路由 + 数据读取 API：无认证要求，但 SQL 层只返回 `published` 数据

### 8.3 输入校验

- 所有用户输入（表单、API body）走 Zod
- AI 返回走 Section 6.3 的 Schema
- 数据库交互通过 Drizzle 参数化，无字符串拼接

### 8.4 费用防刷

- 单 owner 维度锁：30 秒内同一 `ownerId` 不能重复生成
- 全局天级别限流：`MAX_GENERATIONS_PER_DAY`（默认 200）

### 8.5 Secrets

- 所有密钥只进 env，永不入库、永不打日志
- Vercel 生产变量加密存储

---

## 9. 错误处理

| 场景 | 处理 |
|---|---|
| AI 超时 / 429 | 指数退避重试 2 次，仍失败 → 错误提示 |
| AI 返回 schema 非法 | 重试 2 次，仍失败 → 错误提示 + 建议修改原文 |
| 单题重生失败 | 保留原题不变，toast 提示失败 |
| 文件解析失败 | 保留已上传文件，友好错误信息；管理员可重试 |
| 原文过短 | UI 禁用生成按钮 |
| 原文过长 | 警告但允许继续 |
| 长 title 无已发布章节 | 孩子端显示「尚未上线任何章节」 |
| title 题目数 < 3 | 列表页不展示该 title |
| 孩子端 Quiz 中断网 | toast 提示刷新重试；不需恢复进度（未保存） |
| 管理员密码错误 3 次 | 锁 10 分钟 |

---

## 10. 测试策略

### 10.1 单元测试（Vitest）

- Zod schema 正反面用例
- SRT / PDF / EPUB 解析函数（固定 fixture 文件）
- 题目/选项打乱函数：给定 seed 应确定性
- iron-session 配置 + middleware

### 10.2 集成测试（Vitest）

- `/api/generate`：设 `USE_FAKE_AI=true` 走 mock provider，校验 DB 写入与返回结构
- 管理员登录流程
- CRUD：建系列 → 建 title → 写原文 → 生成（mock）→ 审核 → 发布

### 10.3 E2E（Playwright，headless）

- 孩子端路径：首页 → 选系列 → 选 title → 做 10 题 → 查看结果 → 展开错题看解释
- 管理员关键路径：登录 → 建 title → 粘贴原文 → 点生成（mock）→ 出题 → 发布 → 孩子端可见

### 10.4 AI 质量评估（半自动）

- Fixtures：3 份样本文本（低 / 中 / 高难度）
- 自动断言：题数对、选项 3 个、`explanation` 非空、类别分布合法
- 手动：每跑一次样本，人眼快扫题目（语义对错自动测不了）

### 10.5 CI（GitHub Actions）

- `lint` + `typecheck` + `vitest` + `playwright` 全部跑通才允许合并

---

## 11. 部署

- **宿主**：Vercel Free
- **数据库**：Supabase Postgres（Free，500 MB）
- **对象存储**：Supabase Storage（Free，1 GB）
- **域名**：初期用 `*.vercel.app` 子域；后续可挂自有域名

### 11.1 Env 变量

```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-chat

ADMIN_PASSWORD=<strong-password>
SESSION_SECRET=<32-byte-random>

MAX_GENERATIONS_PER_DAY=200
USE_FAKE_AI=false
```

### 11.2 本地开发

- 数据库：Docker Postgres（`docker-compose.yml` 起一个），清空重来方便、不依赖网络
- 运行：`pnpm dev`
- Migration：Drizzle Kit `pnpm db:generate` → `pnpm db:migrate`
- 测试：`pnpm test`、`pnpm test:e2e`

### 11.3 部署流程

1. PR 合并到 `main`
2. Vercel 自动部署
3. 若有 DB migration：合并后在本地针对 production `DATABASE_URL` 手动 `pnpm db:migrate`（自用场景不搞零停机）

---

## 12. 项目结构

```
quiz/
├── app/
│   ├── (kid)/                    # 孩子端路由组
│   │   ├── page.tsx
│   │   ├── s/[seriesId]/page.tsx
│   │   ├── t/[titleId]/page.tsx
│   │   ├── t/[titleId]/quiz/page.tsx
│   │   ├── c/[chapterId]/quiz/page.tsx
│   │   └── result/page.tsx
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── page.tsx
│   │   ├── series/[id]/page.tsx
│   │   ├── titles/[id]/page.tsx
│   │   ├── titles/[id]/review/page.tsx
│   │   ├── chapters/[id]/page.tsx
│   │   └── chapters/[id]/review/page.tsx
│   └── api/
│       ├── login/route.ts
│       ├── logout/route.ts
│       ├── generate/route.ts
│       ├── regenerate-one/route.ts
│       └── upload/route.ts
├── components/
│   ├── kid/
│   └── admin/
├── lib/
│   ├── db/                       # Drizzle schema + client
│   ├── ai/                       # OpenAI client + prompt + Zod schema
│   ├── parsers/                  # pdf / epub / srt
│   ├── auth/                     # iron-session + middleware helpers
│   └── utils/                    # shuffling、限流、日期等
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── drizzle/                      # migrations
├── public/
├── middleware.ts                 # /admin + 敏感 /api 的 session 检查
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── docker-compose.yml            # 本地 Postgres
├── .env.example
└── package.json
```

---

## 13. 路线图

### 13.1 MVP（首个可跑版本）

1. 项目脚手架 + Tailwind 主题（清爽学院风）
2. Drizzle schema + Supabase 连接
3. 管理员登录（iron-session） + 登录失败限流
4. 系列 / title / chapter CRUD
5. 粘贴文本保存为 `source_material`
6. `/api/generate`（接 DeepSeek）+ Zod 校验 + 重试
7. **费用防刷**：owner 级 30s 锁 + 全局天级 `MAX_GENERATIONS_PER_DAY`（生产一上线就要有）
8. 管理员题目审核页（inline 编辑 + 删除）
9. 整组发布
10. 孩子端：首页 → 系列 → title / chapter → Quiz → 结果页（含错题解释）
11. 基本测试覆盖（关键单元 + 1 条孩子端 E2E）

### 13.2 Phase 2

- 文件上传（PDF / EPUB / SRT）与解析
- 单题重新生成（`/api/regenerate-one` + UI）

### 13.3 Phase 3（看实际用过后的需求）

- Admin UI 切换 LLM provider
- 多孩子 profile（如果家里有第二个娃）
- 错题集 / 间隔复习
- 分享 / 导出

### 13.4 Phase 4 · 听力与复述

- **题干/选项语音播放** ✅ 已实现：孩子端每道题和每个选项旁边都有小喇叭按钮，点一下用 TTS 播放该英文文本。
  - 实现路径：Azure Speech Neural（`en-US-JennyNeural`，`prosody rate -10%`）+ Supabase Storage（bucket `audio`，public 读）缓存，前端 `<audio>` 播放
  - API: `GET /api/tts?qid={uuid}&key=stem|option0|option1|option2` → `{ url }`
  - 缓存键：`{questionId}/{key}.mp3`，cache-first；不命中才调 Azure
  - 错题展示中的题干/选项也有喇叭按钮
  - F0 free 配额：5h/月（约 0.5M chars），实际使用按需付费 S0 ≈ $16/百万 chars
- **故事复述**：做完一组 quiz 后增加"复述环节"
  - 初期: 仍以选择题形式呈现，连续 3-5 道"故事顺序/情节/因果"题，每题针对故事发展的一个节点（"开头发生了什么？""接着呢？""结局？"），选项是三个不同版本的情节复述
  - AI 生成: 新 category `retell`，管理员生成完 10 道基础题后可额外"生成复述题"，和基础题同一数据模型
  - 未来可扩展: 开放式文本输入 + AI 打分（不做在 Phase 4）

---

## 14. 待确认项 / 注意事项

- 孩子端 Quiz 结果页实现：把 `QuizRunner` 和 `ResultScreen` 都放在同一个 client component 里，用 React state 在两个"视图阶段"之间切换（不走真正的路由跳转），结果数据保留在内存。刷新页面会丢失（可接受，因为不做进度持久化）。`/result` 作为独立路由只在用户直接访问时显示"没有可展示的结果，请从头开始" 的引导
- 文件上传解析依赖 Node runtime；Next.js App Router 的 `/api/upload` 路由必须配置 `export const runtime = 'nodejs'`
- LLM 提示词里嵌入原文可能触发"内容安全"策略（某些国产模型对受版权保护的长文本敏感）；若发现问题 → 在 prompt 开头说明"用于语言教学目的，请基于此文本生成练习题"；仍不行则退回 Claude 官方 API
- DeepSeek 的 `response_format=json_object` 支持度需要在实现时实测验证；若不稳，可退回"要求模型输出 JSON + 我方手动 parse"模式

---

## 15. 附录

### 15.1 决策记录

| 决策 | 选择 | 否决的替代 |
|---|---|---|
| 内容来源 | AI 自动生成 | 手工、预置数据集、UGC |
| AI 管线 | 单次 Prompt + 结构化 + 自动重试 + 单题重生 | 单次 Prompt、分阶段管线 |
| 题目配比 | AI 决定 + 放宽校验（每类 2-5） | 固定 3/3/4、固定 4/3/3 |
| 难度锚点 | AI 根据原文自定 | 固定 CEFR A2-B1、Lexile |
| 发布粒度 | title / chapter 级 | 题级 |
| 用户体系 | 无账号 | 多用户账号、profile 切换 |
| 进度保存 | 不保存 | localStorage、数据库 |
| Auth | 单密码 + iron-session | NextAuth、全站密码、管理员/孩子双账号 |
| 部署 | Vercel + Supabase | 纯本地、家庭局域网、自建 VPS |
| LLM Provider | OpenAI SDK + DeepSeek（默认） | Anthropic 官方 SDK |
| UI 语言 | 中文 | 全英文、双语 |
| 视觉风格 | 清爽学院风（蓝/青/白） | 暖色童趣、糖果活泼、极简中性 |
