# 英文 Quiz · 儿童英文读物/动画配套练习

自用级 Web 应用。8 岁孩子做完英文书/动画后，做 AI 生成的选择题巩固词汇、句型、阅读理解。

管理员（家长）把原文贴进后台 → AI 出 10 道选择题（词汇 / 句型 / 阅读理解混合）→ 家长审核发布 → 孩子端做题看结果。

## 技术栈

Next.js 16 · TypeScript · Tailwind 4 · Postgres (本地 Docker / 生产 Supabase) · Drizzle ORM · iron-session · OpenAI 兼容 SDK (默认 DeepSeek) · Vitest · Playwright · pnpm

## 快速开始

```bash
# 1) 环境
nvm use                              # Node 20+ (用 .nvmrc)
cp .env.example .env.local           # 填 LLM_API_KEY, ADMIN_PASSWORD, SESSION_SECRET

# 2) Postgres (Docker)
docker compose up -d

# 3) 依赖 + 迁移
pnpm install
pnpm db:migrate

# 4) 启动
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000) （孩子端）或 [http://localhost:3000/admin](http://localhost:3000/admin) （管理后台）。

## 测试

```bash
pnpm test            # 单元 + 集成（需要 quiz_test DB）
pnpm test:e2e        # Playwright E2E (USE_FAKE_AI=true，不烧真实 LLM)
pnpm typecheck
pnpm lint
```

首次运行测试前需要创建测试 DB：

```bash
docker exec $(docker compose ps -q postgres) psql -U quiz -c "CREATE DATABASE quiz_test OWNER quiz;"
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz_test pnpm db:migrate:ci
```

## 部署（Vercel + Supabase）

1. Supabase 新建 project，拿到 Postgres connection string + anon/service key
2. Vercel 导入本仓库；在 Project Settings → Environment Variables 按 `.env.example` 填齐
3. 本地针对 production `DATABASE_URL` 跑一次 `DATABASE_URL=... pnpm db:migrate:ci`
4. 访问 `<your>.vercel.app/admin` 用 `ADMIN_PASSWORD` 登录

## 环境变量

见 [`.env.example`](.env.example)。关键项：

| 变量 | 含义 |
|---|---|
| `DATABASE_URL` | Postgres 连接串 |
| `LLM_BASE_URL` | OpenAI 兼容接口地址（默认 DeepSeek，可切换 Qwen/Kimi/GLM） |
| `LLM_API_KEY` | 对应 provider 的 API key |
| `LLM_MODEL` | 模型名，例如 `deepseek-chat` |
| `ADMIN_PASSWORD` | 管理员登录密码（单密码） |
| `SESSION_SECRET` | iron-session 的加密密钥，至少 32 字节 |
| `MAX_GENERATIONS_PER_DAY` | 每日生成上限（默认 200） |
| `USE_FAKE_AI` | 测试 / CI 用，跳过真实 LLM 调用 |

## 设计与规划文档

- 设计规范：[`docs/superpowers/specs/2026-04-22-children-english-quiz-design.md`](docs/superpowers/specs/2026-04-22-children-english-quiz-design.md)
- 实施计划：[`docs/superpowers/plans/2026-04-23-children-english-quiz-mvp.md`](docs/superpowers/plans/2026-04-23-children-english-quiz-mvp.md)
