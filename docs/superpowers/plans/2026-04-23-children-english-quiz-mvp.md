# 儿童英文 Quiz 应用 — MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 MVP 首版可跑的儿童英文 Quiz 应用，覆盖 spec 第 13.1 节全部 11 项；实现从管理员粘贴原文、AI 出题、审核发布，到孩子做题得结果的完整闭环。

**Architecture:** 单体 Next.js 15 App Router 应用。前端 Tailwind（清爽学院风）+ 后端 Server Actions/Route Handlers；数据库 Postgres（本地 Docker，生产 Supabase）+ Drizzle ORM；LLM 默认 DeepSeek（OpenAI 兼容 SDK）；认证用 iron-session 单密码方案。孩子端无认证、无进度保存；管理员端全部走 cookie session。

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Drizzle ORM, Postgres (Docker/Supabase), OpenAI SDK, iron-session, Zod, Vitest, Playwright, pnpm

**Spec 参考：** [/docs/superpowers/specs/2026-04-22-children-english-quiz-design.md](../specs/2026-04-22-children-english-quiz-design.md)

---

## 文件结构规划

按 spec §12 的结构。每个任务的 "Files" 区都会列出精确路径。核心文件及其职责：

```
lib/
├── db/
│   ├── schema.ts              # 5 张表的 Drizzle schema 定义
│   ├── client.ts              # postgres-js 连接 + Drizzle 实例（env 决定 URL）
│   └── queries.ts             # 复用度高的查询函数（列系列、取题等）
├── ai/
│   ├── client.ts              # OpenAI SDK 实例化（baseURL/apiKey/model from env）
│   ├── prompts.ts             # 系统 prompt + 用户 prompt 构造
│   ├── schema.ts              # Zod schema 校验 AI 返回
│   ├── generate.ts            # 主流程：构造 → 调用 → 校验 → 重试
│   └── fake.ts                # USE_FAKE_AI=true 时的 mock 返回
├── auth/
│   ├── session.ts             # iron-session 配置 + getSession()
│   ├── rate-limit.ts          # 登录失败限流（内存 Map）
│   └── guard.ts               # requireAdmin() helper
├── cost-guard/
│   └── index.ts               # owner 级 30s 锁 + 全局每日计数
├── utils/
│   ├── shuffle.ts             # Fisher-Yates（可指定 seed，便于测试）
│   └── word-count.ts          # 粗略单词数
components/
├── kid/
│   ├── SeriesGrid.tsx
│   ├── TitleList.tsx
│   ├── ChapterList.tsx
│   ├── QuizRunner.tsx         # 核心做题 + 结果视图合并
│   └── ResultScreen.tsx
├── admin/
│   ├── SourceMaterialEditor.tsx
│   ├── GenerateButton.tsx
│   ├── QuestionReviewList.tsx
│   └── PublishButton.tsx
app/
├── (kid)/
│   ├── layout.tsx
│   ├── page.tsx                           # 首页
│   ├── s/[seriesId]/page.tsx
│   ├── t/[titleId]/page.tsx
│   ├── t/[titleId]/quiz/page.tsx
│   ├── c/[chapterId]/quiz/page.tsx
│   └── result/page.tsx                    # fallback only
├── admin/
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── page.tsx                           # dashboard
│   ├── series/[id]/page.tsx
│   ├── titles/[id]/page.tsx
│   ├── titles/[id]/review/page.tsx
│   ├── chapters/[id]/page.tsx
│   └── chapters/[id]/review/page.tsx
└── api/
    ├── login/route.ts
    ├── logout/route.ts
    └── generate/route.ts
middleware.ts
```

---

## Part A · 项目脚手架与基础设施（Tasks 1-5）

### Task 1: 创建 Next.js 项目 + 安装核心依赖

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`, `.gitignore`, `.env.example`

- [ ] **Step 1: 运行 create-next-app**

```bash
cd /home/hanlixin/apps/quiz
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*" \
  --use-pnpm
```

当它问 "directory is not empty, do you want to continue?" 回车继续（会保留 .git / docs / .gitignore）。

- [ ] **Step 2: 安装剩余依赖**

```bash
pnpm add drizzle-orm postgres iron-session openai zod
pnpm add -D drizzle-kit @types/node vitest @vitest/ui @playwright/test tsx
```

- [ ] **Step 3: 补充 `.env.example`**

写入 `/home/hanlixin/apps/quiz/.env.example`：

```
# Database
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz

# Supabase (生产使用)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# LLM (OpenAI-compatible)
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_MODEL=deepseek-chat

# Admin auth
ADMIN_PASSWORD=change-me
SESSION_SECRET=change-me-to-32-byte-random-string

# Cost guard
MAX_GENERATIONS_PER_DAY=200

# Testing
USE_FAKE_AI=false
```

- [ ] **Step 4: 更新 `.gitignore`**

确保 `.gitignore` 包含：

```
node_modules/
.next/
.env
.env.local
.env.*.local
*.log
.superpowers/
test-results/
playwright-report/
```

- [ ] **Step 5: 验证可启动**

```bash
pnpm dev
# 访问 http://localhost:3000 应看到 Next.js 默认页
# Ctrl+C 停止
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold next.js project with core deps"
```

---

### Task 2: 配置 Tailwind 清爽学院风主题

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: 设计色板**

重写 `tailwind.config.ts`：

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 学院风主色
        ink: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          700: '#334155',
          900: '#0f172a',
        },
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        accent: {
          400: '#22d3ee',   // 青色点缀
          500: '#06b6d4',
        },
        success: '#16a34a',
        danger:  '#dc2626',
      },
      fontFamily: {
        sans: ['"Inter"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 2: 全局样式**

重写 `app/globals.css`：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    @apply bg-ink-50 text-ink-900 antialiased;
  }
  body {
    @apply font-sans;
  }
}

@layer components {
  .btn-primary {
    @apply inline-flex items-center justify-center
           rounded-card bg-primary-600 px-4 py-2 text-white
           font-medium shadow-sm transition
           hover:bg-primary-700
           focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
           disabled:cursor-not-allowed disabled:opacity-50;
  }
  .btn-ghost {
    @apply inline-flex items-center justify-center
           rounded-card border border-ink-200 bg-white
           px-4 py-2 text-ink-700 font-medium transition
           hover:bg-ink-100;
  }
  .card {
    @apply rounded-card border border-ink-200 bg-white p-4 shadow-sm;
  }
  .input {
    @apply w-full rounded-card border border-ink-200 bg-white
           px-3 py-2 text-ink-900
           focus:outline-none focus:ring-2 focus:ring-primary-500;
  }
}
```

- [ ] **Step 3: 简化 app/layout.tsx**

替换 `app/layout.tsx` 内容：

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '英文 Quiz',
  description: '儿童英文读物与动画配套练习题',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: 临时首页验证主题**

替换 `app/page.tsx`：

```tsx
export default function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold text-primary-700">英文 Quiz</h1>
      <p className="mt-2 text-ink-700">主题色已配置，下面是控件示例：</p>
      <div className="mt-4 flex gap-3">
        <button className="btn-primary">主要按钮</button>
        <button className="btn-ghost">次要按钮</button>
      </div>
      <div className="card mt-4">卡片容器示例</div>
    </div>
  );
}
```

- [ ] **Step 5: 验证**

```bash
pnpm dev
# 浏览器打开 http://localhost:3000
# 应看到蓝青白清爽风格的按钮 + 卡片
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: configure tailwind academic blue/cyan theme"
```

---

### Task 3: 本地 Postgres 开发环境

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/db-reset.sh`

- [ ] **Step 1: docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: quiz
      POSTGRES_PASSWORD: quiz
      POSTGRES_DB: quiz
    ports:
      - "5432:5432"
    volumes:
      - quiz-pg-data:/var/lib/postgresql/data

volumes:
  quiz-pg-data:
```

- [ ] **Step 2: 启动 Postgres**

```bash
docker compose up -d
docker compose ps
# 应看到 postgres 服务为 running
```

- [ ] **Step 3: 验证连接**

```bash
docker exec -it $(docker compose ps -q postgres) psql -U quiz -c "select 1"
# 应输出 ?column? = 1
```

- [ ] **Step 4: 重置脚本**

创建 `scripts/db-reset.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail
docker compose down -v
docker compose up -d
echo "等待 Postgres 就绪..."
until docker exec $(docker compose ps -q postgres) pg_isready -U quiz >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres 已重置"
```

```bash
chmod +x scripts/db-reset.sh
```

- [ ] **Step 5: 写本地 .env.local**

```bash
cp .env.example .env.local
# 编辑 .env.local，至少填 LLM_API_KEY + SESSION_SECRET（可用 openssl rand -hex 32）
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml scripts/db-reset.sh
git commit -m "feat: add docker postgres for local dev"
```

---

### Task 4: Drizzle schema — 5 张表

**Files:**
- Create: `lib/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: 创建 schema**

`lib/db/schema.ts`：

```ts
import { pgTable, uuid, text, varchar, boolean, integer, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const seriesKindEnum = pgEnum('series_kind', ['book', 'animation']);
export const publishStatusEnum = pgEnum('publish_status', ['draft', 'published']);
export const ownerTypeEnum = pgEnum('owner_type', ['title', 'chapter']);
export const questionCategoryEnum = pgEnum('question_category', ['vocab', 'sentence', 'reading']);

export const series = pgTable('series', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: seriesKindEnum('kind').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  coverUrl: text('cover_url'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const title = pgTable('title', {
  id: uuid('id').defaultRandom().primaryKey(),
  seriesId: uuid('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  coverUrl: text('cover_url'),
  orderIndex: integer('order_index').default(0).notNull(),
  isLong: boolean('is_long').default(false).notNull(),
  status: publishStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  seriesStatusIdx: index('title_series_status_idx').on(t.seriesId, t.status),
}));

export const chapter = pgTable('chapter', {
  id: uuid('id').defaultRandom().primaryKey(),
  titleId: uuid('title_id').notNull().references(() => title.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 300 }).notNull(),
  orderIndex: integer('order_index').default(0).notNull(),
  status: publishStatusEnum('status').default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  titleStatusIdx: index('chapter_title_status_idx').on(t.titleId, t.status),
}));

export const sourceMaterial = pgTable('source_material', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerType: ownerTypeEnum('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  text: text('text').notNull(),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ownerIdx: index('source_material_owner_idx').on(t.ownerType, t.ownerId),
}));

export const question = pgTable('question', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerType: ownerTypeEnum('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  category: questionCategoryEnum('category').notNull(),
  stem: text('stem').notNull(),
  options: jsonb('options').$type<string[]>().notNull(),
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  orderIndex: integer('order_index').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  ownerIdx: index('question_owner_idx').on(t.ownerType, t.ownerId),
}));
```

- [ ] **Step 2: drizzle 配置**

`drizzle.config.ts`：

```ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

- [ ] **Step 3: 添加 package.json 脚本**

编辑 `package.json` 的 `scripts` 字段，加入：

```json
"db:generate": "drizzle-kit generate",
"db:migrate":  "tsx scripts/migrate.ts",
"db:studio":   "drizzle-kit studio"
```

- [ ] **Step 4: 生成 migration**

```bash
pnpm db:generate
# 应生成 drizzle/0000_xxx.sql
ls drizzle/
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle.config.ts drizzle/ package.json
git commit -m "feat: add drizzle schema for 5 core tables"
```

---

### Task 5: DB 客户端 + migration 执行

**Files:**
- Create: `lib/db/client.ts`
- Create: `scripts/migrate.ts`

- [ ] **Step 1: DB client**

`lib/db/client.ts`：

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const queryClient = postgres(connectionString, { max: 10 });
export const db = drizzle(queryClient, { schema });
export { schema };
```

- [ ] **Step 2: migration 脚本**

`scripts/migrate.ts`：

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  await client.end();
  console.log('migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: 加载 env 的辅助**

在 `package.json` 的 scripts 改为：

```json
"db:migrate": "tsx --env-file=.env.local scripts/migrate.ts"
```

（tsx >= 4 支持 `--env-file`；若不支持可用 `dotenv -e .env.local -- tsx scripts/migrate.ts`）

- [ ] **Step 4: 跑 migration**

```bash
pnpm db:migrate
# 期望输出: migrations complete
```

- [ ] **Step 5: 用 psql 验证表**

```bash
docker exec -it $(docker compose ps -q postgres) psql -U quiz -c "\dt"
# 期望: series, title, chapter, source_material, question
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/client.ts scripts/migrate.ts package.json
git commit -m "feat: add drizzle client and migration runner"
```

---

## Part B · 认证（Tasks 6-9）

### Task 6: iron-session 配置

**Files:**
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

- [ ] **Step 1: 写失败测试**

`lib/auth/session.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { sessionOptions } from './session';

describe('sessionOptions', () => {
  it('has a cookie name and password from env', () => {
    expect(sessionOptions.cookieName).toBe('quiz_admin');
    expect(sessionOptions.password).toBeDefined();
  });

  it('requires SESSION_SECRET at >= 32 chars', () => {
    expect(sessionOptions.password.length).toBeGreaterThanOrEqual(32);
  });

  it('sets httpOnly and sameSite cookie options', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true);
    expect(sessionOptions.cookieOptions?.sameSite).toBe('lax');
  });
});
```

- [ ] **Step 2: vitest 配置**

`vitest.config.ts`（新建）：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      SESSION_SECRET: 'x'.repeat(32),
      ADMIN_PASSWORD: 'test-password',
      DATABASE_URL: 'postgresql://quiz:quiz@localhost:5432/quiz_test',
      LLM_BASE_URL: 'https://example.invalid',
      LLM_API_KEY: 'test',
      LLM_MODEL: 'fake',
      USE_FAKE_AI: 'true',
    },
  },
});
```

`package.json` 加入：

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pnpm test lib/auth
# 期望: FAIL (session.ts 不存在)
```

- [ ] **Step 4: 实现 session**

`lib/auth/session.ts`：

```ts
import type { SessionOptions } from 'iron-session';

export type AdminSession = {
  isAdmin?: boolean;
  loggedInAt?: number;
};

const password = process.env.SESSION_SECRET;
if (!password || password.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 chars');
}

export const sessionOptions: SessionOptions = {
  cookieName: 'quiz_admin',
  password,
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 天
  },
};
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm test lib/auth
# 期望: 3 passed
```

- [ ] **Step 6: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts vitest.config.ts package.json
git commit -m "feat: add iron-session config for admin auth"
```

---

### Task 7: 登录失败限流

**Files:**
- Create: `lib/auth/rate-limit.ts`
- Test: `lib/auth/rate-limit.test.ts`

- [ ] **Step 1: 写失败测试**

`lib/auth/rate-limit.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkLoginAttempt, recordFailure, resetForTest } from './rate-limit';

describe('login rate limit', () => {
  beforeEach(() => {
    resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('allows first 3 attempts', () => {
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
    recordFailure('1.2.3.4');
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
    recordFailure('1.2.3.4');
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
  });

  it('locks after 3 consecutive failures', () => {
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    const res = checkLoginAttempt('1.2.3.4');
    expect(res.allowed).toBe(false);
    expect(res.lockedUntil).toBeDefined();
  });

  it('unlocks after 10 minutes', () => {
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    recordFailure('1.2.3.4');
    vi.setSystemTime(new Date('2026-01-01T00:11:00Z'));
    expect(checkLoginAttempt('1.2.3.4').allowed).toBe(true);
  });

  it('tracks ips independently', () => {
    recordFailure('1.1.1.1');
    recordFailure('1.1.1.1');
    recordFailure('1.1.1.1');
    expect(checkLoginAttempt('2.2.2.2').allowed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test rate-limit
# FAIL: rate-limit.ts 不存在
```

- [ ] **Step 3: 实现**

`lib/auth/rate-limit.ts`：

```ts
const MAX_FAILURES = 3;
const LOCK_MS = 10 * 60 * 1000; // 10 分钟

type Entry = { count: number; firstAt: number; lockedUntil?: number };

const store = new Map<string, Entry>();

export function checkLoginAttempt(ip: string): { allowed: boolean; lockedUntil?: number } {
  const entry = store.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { allowed: false, lockedUntil: entry.lockedUntil };
  }
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    store.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = store.get(ip) ?? { count: 0, firstAt: now };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + LOCK_MS;
  }
  store.set(ip, entry);
}

export function recordSuccess(ip: string): void {
  store.delete(ip);
}

export function resetForTest(): void {
  store.clear();
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test rate-limit
# 期望: 4 passed
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth/rate-limit.ts lib/auth/rate-limit.test.ts
git commit -m "feat: add in-memory login rate limit"
```

---

### Task 8: 登录 / 登出 API + guard

**Files:**
- Create: `lib/auth/guard.ts`
- Create: `app/api/login/route.ts`
- Create: `app/api/logout/route.ts`

- [ ] **Step 1: guard helper**

`lib/auth/guard.ts`：

```ts
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type AdminSession } from './session';

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions);
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.isAdmin) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}
```

- [ ] **Step 2: login route**

`app/api/login/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSession } from '@/lib/auth/guard';
import { checkLoginAttempt, recordFailure, recordSuccess } from '@/lib/auth/rate-limit';

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const gate = checkLoginAttempt(ip);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: '登录尝试过多，请 10 分钟后再试' },
      { status: 429 },
    );
  }

  const { password } = await req.json().catch(() => ({ password: '' }));
  if (password !== process.env.ADMIN_PASSWORD) {
    recordFailure(ip);
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }

  recordSuccess(ip);
  const session = await getAdminSession();
  session.isAdmin = true;
  session.loggedInAt = Date.now();
  await session.save();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: logout route**

`app/api/logout/route.ts`：

```ts
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/guard';

export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 手动冒烟**

```bash
pnpm dev
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"change-me"}'   # .env.local 里的值
# 期望: {"ok":true} + Set-Cookie: quiz_admin=...
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth/guard.ts app/api/login/route.ts app/api/logout/route.ts
git commit -m "feat: add login/logout routes with rate limiting"
```

---

### Task 9: Middleware + 登录页

**Files:**
- Create: `middleware.ts`
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx` (stub dashboard)

- [ ] **Step 1: middleware**

`middleware.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type AdminSession } from '@/lib/auth/session';

const PROTECTED_API = ['/api/generate', '/api/regenerate-one', '/api/upload'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname.startsWith('/admin') && pathname !== '/admin/login';
  const isProtectedApi = PROTECTED_API.some((p) => pathname.startsWith(p));
  if (!isAdminPage && !isProtectedApi) return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<AdminSession>(req.cookies as any, sessionOptions);
  if (!session.isAdmin) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
```

- [ ] **Step 2: admin layout**

`app/admin/layout.tsx`：

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <a href="/admin" className="font-bold text-primary-700">英文 Quiz · 管理后台</a>
          <form action="/api/logout" method="post">
            <button className="btn-ghost text-sm">登出</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: 登录页**

`app/admin/login/page.tsx`：

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const next = useSearchParams().get('next') ?? '/admin';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) router.push(next);
    else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? '登录失败');
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <h1 className="text-2xl font-bold text-primary-700">管理员登录</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="password"
          className="input"
          placeholder="管理员密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: dashboard stub**

`app/admin/page.tsx`：

```tsx
export default function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-ink-700 mt-2">（列表功能将在 Task 10 实现）</p>
    </div>
  );
}
```

- [ ] **Step 5: 端到端验证**

```bash
pnpm dev
# 1) 访问 /admin → 应跳转 /admin/login?next=/admin
# 2) 输入错误密码 3 次 → 第 4 次应 429
# 3) 用正确密码 → 跳回 /admin
# 4) 点「登出」→ 再访问 /admin → 再跳回 login
```

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/admin/
git commit -m "feat: add middleware auth guard and login page"
```

---

## Part C · 管理员 CRUD（Tasks 10-13）

### Task 10: Series CRUD

**Files:**
- Create: `lib/db/actions/series.ts` (server actions)
- Create: `app/admin/page.tsx` (rewrite dashboard with series list)
- Create: `components/admin/SeriesForm.tsx`

- [ ] **Step 1: server actions**

`lib/db/actions/series.ts`：

```ts
'use server';

import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateInput = z.object({
  kind: z.enum(['book', 'animation']),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function listSeries() {
  return db.select().from(schema.series).orderBy(schema.series.createdAt);
}

export async function createSeries(form: FormData) {
  await requireAdmin();
  const parsed = CreateInput.parse({
    kind: form.get('kind'),
    title: form.get('title'),
    description: form.get('description') || undefined,
  });
  await db.insert(schema.series).values(parsed);
  revalidatePath('/admin');
}

export async function deleteSeries(id: string) {
  await requireAdmin();
  await db.delete(schema.series).where(eq(schema.series.id, id));
  revalidatePath('/admin');
}
```

- [ ] **Step 2: SeriesForm**

`components/admin/SeriesForm.tsx`：

```tsx
import { createSeries } from '@/lib/db/actions/series';

export function SeriesForm() {
  return (
    <form action={createSeries} className="card space-y-3">
      <h2 className="font-semibold">新建系列</h2>
      <div className="flex gap-3">
        <select name="kind" className="input" defaultValue="book">
          <option value="book">书籍</option>
          <option value="animation">动画</option>
        </select>
        <input name="title" required placeholder="系列名称" className="input flex-1" />
      </div>
      <textarea name="description" placeholder="简介（可选）" className="input h-20" />
      <button className="btn-primary">创建</button>
    </form>
  );
}
```

- [ ] **Step 3: 重写 dashboard**

`app/admin/page.tsx`：

```tsx
import Link from 'next/link';
import { listSeries, deleteSeries } from '@/lib/db/actions/series';
import { SeriesForm } from '@/components/admin/SeriesForm';

export default async function AdminDashboard() {
  const rows = await listSeries();
  return (
    <div className="space-y-6">
      <SeriesForm />
      <section>
        <h2 className="font-semibold mb-3">所有系列</h2>
        {rows.length === 0 ? (
          <p className="text-ink-700">还没有任何系列。</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((s) => (
              <li key={s.id} className="card flex items-center justify-between">
                <div>
                  <Link href={`/admin/series/${s.id}`} className="font-medium text-primary-700 hover:underline">
                    {s.title}
                  </Link>
                  <span className="ml-2 text-xs text-ink-700">{s.kind === 'book' ? '书籍' : '动画'}</span>
                </div>
                <form action={async () => {
                  'use server';
                  await deleteSeries(s.id);
                }}>
                  <button className="btn-ghost text-sm text-danger">删除</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 手动验证**

```bash
pnpm dev
# 登录后访问 /admin
# 创建一个系列 → 列表应出现
# 删除一个系列 → 列表应消失
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/actions/series.ts components/admin/SeriesForm.tsx app/admin/page.tsx
git commit -m "feat: add series CRUD in admin dashboard"
```

---

### Task 11: Title CRUD

**Files:**
- Create: `lib/db/actions/title.ts`
- Create: `app/admin/series/[id]/page.tsx`
- Create: `components/admin/TitleForm.tsx`

- [ ] **Step 1: server actions**

`lib/db/actions/title.ts`：

```ts
'use server';
import { db, schema } from '@/lib/db/client';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateInput = z.object({
  seriesId: z.string().uuid(),
  name: z.string().min(1).max(300),
  isLong: z.coerce.boolean().default(false),
});

export async function listTitles(seriesId: string) {
  return db.select().from(schema.title)
    .where(eq(schema.title.seriesId, seriesId))
    .orderBy(asc(schema.title.orderIndex), asc(schema.title.createdAt));
}

export async function getTitle(id: string) {
  const [row] = await db.select().from(schema.title).where(eq(schema.title.id, id)).limit(1);
  return row ?? null;
}

export async function createTitle(form: FormData) {
  await requireAdmin();
  const input = CreateInput.parse({
    seriesId: form.get('seriesId'),
    name: form.get('name'),
    isLong: form.get('isLong') === 'on',
  });
  await db.insert(schema.title).values(input);
  revalidatePath(`/admin/series/${input.seriesId}`);
}

export async function deleteTitle(id: string, seriesId: string) {
  await requireAdmin();
  await db.delete(schema.title).where(eq(schema.title.id, id));
  revalidatePath(`/admin/series/${seriesId}`);
}

export async function publishTitle(id: string) {
  await requireAdmin();
  await db.update(schema.title).set({ status: 'published' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
}

export async function unpublishTitle(id: string) {
  await requireAdmin();
  await db.update(schema.title).set({ status: 'draft' }).where(eq(schema.title.id, id));
  revalidatePath(`/admin/titles/${id}`);
}
```

- [ ] **Step 2: TitleForm 组件**

`components/admin/TitleForm.tsx`：

```tsx
import { createTitle } from '@/lib/db/actions/title';

export function TitleForm({ seriesId }: { seriesId: string }) {
  return (
    <form action={createTitle} className="card space-y-3">
      <input type="hidden" name="seriesId" value={seriesId} />
      <h2 className="font-semibold">新建书/集</h2>
      <input name="name" required placeholder="书名或剧集名" className="input" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isLong" />
        这是长内容（需要按章节出题）
      </label>
      <button className="btn-primary">创建</button>
    </form>
  );
}
```

- [ ] **Step 3: series 详情页**

`app/admin/series/[id]/page.tsx`：

```tsx
import Link from 'next/link';
import { listTitles, deleteTitle } from '@/lib/db/actions/title';
import { TitleForm } from '@/components/admin/TitleForm';

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const titles = await listTitles(id);
  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-primary-700">← 返回 Dashboard</Link>
      <TitleForm seriesId={id} />
      <section>
        <h2 className="font-semibold mb-3">书/集列表</h2>
        {titles.length === 0 ? (
          <p className="text-ink-700">还没有书/集。</p>
        ) : (
          <ul className="space-y-2">
            {titles.map((t) => (
              <li key={t.id} className="card flex items-center justify-between">
                <div>
                  <Link href={`/admin/titles/${t.id}`} className="font-medium text-primary-700 hover:underline">
                    {t.name}
                  </Link>
                  <span className="ml-2 text-xs text-ink-700">
                    {t.isLong ? '长内容(章节)' : '短内容'}
                  </span>
                  <span className={`ml-2 text-xs ${t.status === 'published' ? 'text-success' : 'text-ink-700'}`}>
                    {t.status === 'published' ? '已发布' : '草稿'}
                  </span>
                </div>
                <form action={async () => {
                  'use server';
                  await deleteTitle(t.id, id);
                }}>
                  <button className="btn-ghost text-sm text-danger">删除</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: 手动验证**

```bash
pnpm dev
# 登录 → 点一个系列 → 创建 title（短+长各一个）→ 删除
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/actions/title.ts components/admin/TitleForm.tsx app/admin/series/
git commit -m "feat: add title CRUD within series page"
```

---

### Task 12: Chapter CRUD

**Files:**
- Create: `lib/db/actions/chapter.ts`
- Create: `components/admin/ChapterForm.tsx`
- Create: `app/admin/titles/[id]/page.tsx` (partial: will grow in Task 13-14)

- [ ] **Step 1: server actions**

`lib/db/actions/chapter.ts`：

```ts
'use server';
import { db, schema } from '@/lib/db/client';
import { eq, asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const CreateInput = z.object({
  titleId: z.string().uuid(),
  name: z.string().min(1).max(300),
});

export async function listChapters(titleId: string) {
  return db.select().from(schema.chapter)
    .where(eq(schema.chapter.titleId, titleId))
    .orderBy(asc(schema.chapter.orderIndex), asc(schema.chapter.createdAt));
}

export async function getChapter(id: string) {
  const [row] = await db.select().from(schema.chapter).where(eq(schema.chapter.id, id)).limit(1);
  return row ?? null;
}

export async function createChapter(form: FormData) {
  await requireAdmin();
  const input = CreateInput.parse({
    titleId: form.get('titleId'),
    name: form.get('name'),
  });
  await db.insert(schema.chapter).values(input);
  revalidatePath(`/admin/titles/${input.titleId}`);
}

export async function deleteChapter(id: string, titleId: string) {
  await requireAdmin();
  await db.delete(schema.chapter).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/titles/${titleId}`);
}

export async function publishChapter(id: string) {
  await requireAdmin();
  await db.update(schema.chapter).set({ status: 'published' }).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/chapters/${id}`);
}

export async function unpublishChapter(id: string) {
  await requireAdmin();
  await db.update(schema.chapter).set({ status: 'draft' }).where(eq(schema.chapter.id, id));
  revalidatePath(`/admin/chapters/${id}`);
}
```

- [ ] **Step 2: ChapterForm**

`components/admin/ChapterForm.tsx`：

```tsx
import { createChapter } from '@/lib/db/actions/chapter';

export function ChapterForm({ titleId }: { titleId: string }) {
  return (
    <form action={createChapter} className="card space-y-3">
      <input type="hidden" name="titleId" value={titleId} />
      <h3 className="font-semibold">新建章节</h3>
      <input name="name" required placeholder="章节名，如 Chapter 1: Into the Woods" className="input" />
      <button className="btn-primary">创建</button>
    </form>
  );
}
```

- [ ] **Step 3: title 详情页（初版，只处理章节）**

`app/admin/titles/[id]/page.tsx`：

```tsx
import Link from 'next/link';
import { getTitle } from '@/lib/db/actions/title';
import { listChapters, deleteChapter } from '@/lib/db/actions/chapter';
import { ChapterForm } from '@/components/admin/ChapterForm';
import { notFound } from 'next/navigation';

export default async function TitlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTitle(id);
  if (!t) notFound();

  return (
    <div className="space-y-6">
      <Link href={`/admin/series/${t.seriesId}`} className="text-sm text-primary-700">← 返回系列</Link>
      <header>
        <h1 className="text-2xl font-bold">{t.name}</h1>
        <p className="text-sm text-ink-700">
          {t.isLong ? '长内容：按章节管理' : '短内容：直接在本页管理原文与题目（Task 13-14 将实现）'}
          · {t.status === 'published' ? '已发布' : '草稿'}
        </p>
      </header>

      {t.isLong ? (
        <>
          <ChapterForm titleId={t.id} />
          <section>
            <h2 className="font-semibold mb-3">章节</h2>
            <ChapterList titleId={t.id} />
          </section>
        </>
      ) : (
        <section className="card">
          <p className="text-ink-700">短内容的原文编辑器将在下一个 Task 接入。</p>
        </section>
      )}
    </div>
  );
}

async function ChapterList({ titleId }: { titleId: string }) {
  const rows = await listChapters(titleId);
  if (rows.length === 0) return <p className="text-ink-700">还没有章节。</p>;
  return (
    <ul className="space-y-2">
      {rows.map((c) => (
        <li key={c.id} className="card flex items-center justify-between">
          <div>
            <Link href={`/admin/chapters/${c.id}`} className="font-medium text-primary-700 hover:underline">
              {c.name}
            </Link>
            <span className={`ml-2 text-xs ${c.status === 'published' ? 'text-success' : 'text-ink-700'}`}>
              {c.status === 'published' ? '已发布' : '草稿'}
            </span>
          </div>
          <form action={async () => {
            'use server';
            await deleteChapter(c.id, titleId);
          }}>
            <button className="btn-ghost text-sm text-danger">删除</button>
          </form>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: chapter 详情页 stub**

`app/admin/chapters/[id]/page.tsx`：

```tsx
import Link from 'next/link';
import { getChapter } from '@/lib/db/actions/chapter';
import { notFound } from 'next/navigation';

export default async function ChapterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getChapter(id);
  if (!c) notFound();
  return (
    <div className="space-y-6">
      <Link href={`/admin/titles/${c.titleId}`} className="text-sm text-primary-700">← 返回 Title</Link>
      <h1 className="text-2xl font-bold">{c.name}</h1>
      <p className="text-ink-700">原文编辑器与题目管理将在 Task 13-14 实现。</p>
    </div>
  );
}
```

- [ ] **Step 5: 验证**

```bash
pnpm dev
# 创建一个 is_long=true 的 title → 进入 title 页 → 看到章节表单 + 列表
# 创建章节 → 应显示
```

- [ ] **Step 6: Commit**

```bash
git add lib/db/actions/chapter.ts components/admin/ChapterForm.tsx \
        app/admin/titles/[id]/page.tsx app/admin/chapters/[id]/page.tsx
git commit -m "feat: add chapter CRUD for long titles"
```

---

### Task 13: Source material 编辑器（粘贴文本 MVP）

**Files:**
- Create: `lib/db/actions/source-material.ts`
- Create: `components/admin/SourceMaterialEditor.tsx`
- Modify: `app/admin/titles/[id]/page.tsx` (整合短内容分支)
- Modify: `app/admin/chapters/[id]/page.tsx` (整合)

- [ ] **Step 1: server actions**

`lib/db/actions/source-material.ts`：

```ts
'use server';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type OwnerType = 'title' | 'chapter';

const SaveInput = z.object({
  ownerType: z.enum(['title', 'chapter']),
  ownerId: z.string().uuid(),
  text: z.string().min(0).max(200_000),
});

export async function getSourceMaterial(ownerType: OwnerType, ownerId: string) {
  const [row] = await db.select().from(schema.sourceMaterial)
    .where(and(
      eq(schema.sourceMaterial.ownerType, ownerType),
      eq(schema.sourceMaterial.ownerId, ownerId),
    )).limit(1);
  return row ?? null;
}

export async function saveSourceMaterial(form: FormData) {
  await requireAdmin();
  const input = SaveInput.parse({
    ownerType: form.get('ownerType'),
    ownerId: form.get('ownerId'),
    text: form.get('text') ?? '',
  });
  const existing = await getSourceMaterial(input.ownerType, input.ownerId);
  if (existing) {
    await db.update(schema.sourceMaterial)
      .set({ text: input.text })
      .where(eq(schema.sourceMaterial.id, existing.id));
  } else {
    await db.insert(schema.sourceMaterial).values(input);
  }
  const path = input.ownerType === 'title'
    ? `/admin/titles/${input.ownerId}`
    : `/admin/chapters/${input.ownerId}`;
  revalidatePath(path);
}
```

- [ ] **Step 2: 单词数 util**

`lib/utils/word-count.ts`：

```ts
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
```

- [ ] **Step 3: 编辑器组件**

`components/admin/SourceMaterialEditor.tsx`：

```tsx
'use client';
import { useState, useTransition } from 'react';
import { saveSourceMaterial } from '@/lib/db/actions/source-material';
import { wordCount } from '@/lib/utils/word-count';

export function SourceMaterialEditor({
  ownerType, ownerId, initialText,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [pending, startTransition] = useTransition();
  const words = wordCount(text);
  const tooShort = words < 50 && text.length > 0;
  const tooLong = words > 20_000;

  async function onSave() {
    const form = new FormData();
    form.set('ownerType', ownerType);
    form.set('ownerId', ownerId);
    form.set('text', text);
    startTransition(async () => {
      await saveSourceMaterial(form);
    });
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">原文（用于 AI 出题）</h3>
        <span className="text-xs text-ink-700">{words} 词</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="input h-64 font-mono text-sm"
        placeholder="把书的原文 / 动画字幕 / 剧情文字 粘贴到这里…"
      />
      {tooShort && <p className="text-xs text-danger">少于 50 词，无法生成题目。</p>}
      {tooLong && <p className="text-xs text-yellow-700">超过 20000 词，建议拆章节（仍可继续，但单次成本高）。</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending} onClick={onSave}>
          {pending ? '保存中…' : '保存原文'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 改 title 详情页**

在 `app/admin/titles/[id]/page.tsx` 里，短内容分支替换为：

```tsx
{/* 非长内容 */}
<SourceMaterialWrapper ownerType="title" ownerId={t.id} />
```

并在文件顶部 import + 新增 wrapper（可放同一文件）：

```tsx
import { SourceMaterialEditor } from '@/components/admin/SourceMaterialEditor';
import { getSourceMaterial } from '@/lib/db/actions/source-material';

async function SourceMaterialWrapper({ ownerType, ownerId }: {
  ownerType: 'title' | 'chapter'; ownerId: string;
}) {
  const sm = await getSourceMaterial(ownerType, ownerId);
  return <SourceMaterialEditor ownerType={ownerType} ownerId={ownerId} initialText={sm?.text ?? ''} />;
}
```

- [ ] **Step 5: 改 chapter 详情页类似**

在 `app/admin/chapters/[id]/page.tsx` 加入 `<SourceMaterialWrapper ownerType="chapter" ownerId={c.id} />`。

- [ ] **Step 6: 验证**

```bash
pnpm dev
# 短 title → 看到 textarea → 粘贴一段文字 → 保存 → 刷新应仍在
```

- [ ] **Step 7: Commit**

```bash
git add lib/db/actions/source-material.ts lib/utils/word-count.ts \
        components/admin/SourceMaterialEditor.tsx \
        app/admin/titles/[id]/page.tsx app/admin/chapters/[id]/page.tsx
git commit -m "feat: source material paste editor for title/chapter"
```

---

## Part D · AI 生成管线（Tasks 14-17）

### Task 14: AI 客户端 + Prompt + Zod Schema

**Files:**
- Create: `lib/ai/client.ts`
- Create: `lib/ai/prompts.ts`
- Create: `lib/ai/schema.ts`
- Test: `lib/ai/schema.test.ts`

- [ ] **Step 1: Zod schema 测试**

`lib/ai/schema.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { GenerateResponseSchema } from './schema';

function makeQuestions(dist: { vocab: number; sentence: number; reading: number }) {
  const arr: any[] = [];
  const mk = (cat: string) => ({
    category: cat, stem: 'A valid stem', options: ['a', 'b', 'c'],
    correct_index: 0, explanation: 'explanation 中文.',
  });
  for (let i = 0; i < dist.vocab; i++) arr.push(mk('vocab'));
  for (let i = 0; i < dist.sentence; i++) arr.push(mk('sentence'));
  for (let i = 0; i < dist.reading; i++) arr.push(mk('reading'));
  return { questions: arr };
}

describe('GenerateResponseSchema', () => {
  it('accepts 3/3/4', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 3, sentence: 3, reading: 4 }))).not.toThrow();
  });
  it('accepts 4/3/3', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 4, sentence: 3, reading: 3 }))).not.toThrow();
  });
  it('accepts 2/3/5 (edge)', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 2, sentence: 3, reading: 5 }))).not.toThrow();
  });
  it('rejects 1/4/5 (too few vocab)', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 1, sentence: 4, reading: 5 }))).toThrow();
  });
  it('rejects 6/2/2 (too many vocab)', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 6, sentence: 2, reading: 2 }))).toThrow();
  });
  it('rejects if total != 10', () => {
    expect(() => GenerateResponseSchema.parse(makeQuestions({ vocab: 3, sentence: 3, reading: 3 }))).toThrow();
  });
  it('rejects option count != 3', () => {
    const bad = makeQuestions({ vocab: 3, sentence: 3, reading: 4 });
    bad.questions[0].options = ['a', 'b'];
    expect(() => GenerateResponseSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: 跑失败**

```bash
pnpm test lib/ai/schema
# FAIL
```

- [ ] **Step 3: 实现 schema**

`lib/ai/schema.ts`：

```ts
import { z } from 'zod';

export const QuestionSchema = z.object({
  category: z.enum(['vocab', 'sentence', 'reading']),
  stem: z.string().min(5),
  options: z.array(z.string().min(1)).length(3),
  correct_index: z.number().int().min(0).max(2),
  explanation: z.string().min(5),
});

export const GenerateResponseSchema = z.object({
  questions: z.array(QuestionSchema).length(10),
}).refine(({ questions }) => {
  const counts = { vocab: 0, sentence: 0, reading: 0 };
  for (const q of questions) counts[q.category]++;
  return counts.vocab >= 2 && counts.vocab <= 5
    && counts.sentence >= 2 && counts.sentence <= 5
    && counts.reading >= 2 && counts.reading <= 5;
}, 'category distribution out of range [2,5]');

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
```

- [ ] **Step 4: 跑通过**

```bash
pnpm test lib/ai/schema
# 期望: 7 passed
```

- [ ] **Step 5: AI client**

`lib/ai/client.ts`：

```ts
import OpenAI from 'openai';

export function getLLMClient() {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  if (!baseURL || !apiKey) throw new Error('LLM_BASE_URL or LLM_API_KEY not set');
  return new OpenAI({ baseURL, apiKey });
}

export function getModelName(): string {
  return process.env.LLM_MODEL ?? 'deepseek-chat';
}
```

- [ ] **Step 6: Prompt**

`lib/ai/prompts.ts`：

```ts
export const SYSTEM_PROMPT = `你是"英文儿童读物出题助手"。服务对象是 8 岁左右的中国儿童，目标语言是英语。

规则：
1. 先内部判断提供文本的整体英语难度。
2. 出 10 道英文选择题，每题 3 个选项且只有 1 个正确答案。
3. 类别分布：vocab / sentence / reading 三类，围绕 3/3/4 浮动；每类至少 2 题、至多 5 题；总共 10 题。
4. 出题考察点的难度与原文整体难度匹配或略高一点点；不要全是孩子一看就懂的词。
5. vocab: 从原文挑真正有学习价值的名词/动词/形容词/词组/固定搭配；避开 big/go/is 这种基础到不值得考的词。
6. sentence: 只考察稍复杂的句型（定从/状从/倒装/强调/条件/虚拟等）；跳过 SVO / 第三人称 +s 这类基础。
7. reading: 必须绑定原文具体细节；不要"大概意思""主题思想"这类空泛题。
8. 每题的 explanation 必须用中文，解释正确答案为什么对、其他选项错在哪、涉及的语法或词汇点。
9. 输出严格 JSON，绝对不要 Markdown 代码块或额外注释。

输出 JSON 结构：
{
  "questions": [
    {
      "category": "vocab" | "sentence" | "reading",
      "stem": "英文题干",
      "options": ["...", "...", "..."],
      "correct_index": 0,
      "explanation": "中文解释"
    }
    // ... 共 10 题
  ]
}`;

export function buildUserPrompt(sourceText: string): string {
  return `下面是原文，请基于它出题：

<source>
${sourceText}
</source>`;
}
```

- [ ] **Step 7: Commit**

```bash
git add lib/ai/client.ts lib/ai/prompts.ts lib/ai/schema.ts lib/ai/schema.test.ts
git commit -m "feat: add llm client, prompts, and zod schema"
```

---

### Task 15: Fake AI + 生成主流程

**Files:**
- Create: `lib/ai/fake.ts`
- Create: `lib/ai/generate.ts`
- Test: `lib/ai/generate.test.ts`

- [ ] **Step 1: Fake AI 返回**

`lib/ai/fake.ts`：

```ts
import type { GenerateResponse } from './schema';

export function fakeGenerateResponse(): GenerateResponse {
  const mk = (cat: 'vocab' | 'sentence' | 'reading', i: number) => ({
    category: cat,
    stem: `[fake ${cat} #${i}] What does "word${i}" mean?`,
    options: [`option A ${i}`, `option B ${i}`, `option C ${i}`],
    correct_index: i % 3,
    explanation: `这是假题目 ${cat} ${i} 的中文解释。`,
  });
  return {
    questions: [
      mk('vocab', 1), mk('vocab', 2), mk('vocab', 3),
      mk('sentence', 1), mk('sentence', 2), mk('sentence', 3),
      mk('reading', 1), mk('reading', 2), mk('reading', 3), mk('reading', 4),
    ],
  };
}
```

- [ ] **Step 2: 写 generate 测试**

`lib/ai/generate.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateQuestions } from './generate';

describe('generateQuestions (fake mode)', () => {
  it('returns 10 questions with valid distribution when USE_FAKE_AI=true', async () => {
    // vitest env 已设 USE_FAKE_AI=true
    const result = await generateQuestions('Some source material with at least a few words of content.');
    expect(result.questions).toHaveLength(10);
    const counts: Record<string, number> = { vocab: 0, sentence: 0, reading: 0 };
    for (const q of result.questions) counts[q.category]++;
    expect(counts.vocab).toBeGreaterThanOrEqual(2);
    expect(counts.sentence).toBeGreaterThanOrEqual(2);
    expect(counts.reading).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: 跑失败**

```bash
pnpm test generate
# FAIL
```

- [ ] **Step 4: 实现 generate**

`lib/ai/generate.ts`：

```ts
import { getLLMClient, getModelName } from './client';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts';
import { GenerateResponseSchema, type GenerateResponse } from './schema';
import { fakeGenerateResponse } from './fake';

const MAX_RETRIES = 2;
const BACKOFF_MS = [1000, 3000];

export async function generateQuestions(sourceText: string): Promise<GenerateResponse> {
  if (process.env.USE_FAKE_AI === 'true') {
    return fakeGenerateResponse();
  }
  return generateRealWithRetry(sourceText);
}

async function generateRealWithRetry(sourceText: string): Promise<GenerateResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateOnce(sourceText);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
      }
    }
  }
  throw new GenerateError('AI 生成失败（重试后仍未得到合法结果）', { cause: lastErr });
}

async function generateOnce(sourceText: string): Promise<GenerateResponse> {
  const client = getLLMClient();
  const model = getModelName();
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(sourceText) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error('empty completion');
  const parsed = JSON.parse(content);
  return GenerateResponseSchema.parse(parsed);
}

export class GenerateError extends Error {
  constructor(msg: string, opts?: ErrorOptions) {
    super(msg, opts);
    this.name = 'GenerateError';
  }
}
```

- [ ] **Step 5: 跑通过**

```bash
pnpm test generate
# PASS
```

- [ ] **Step 6: Commit**

```bash
git add lib/ai/fake.ts lib/ai/generate.ts lib/ai/generate.test.ts
git commit -m "feat: ai generation pipeline with retry + fake mode"
```

---

### Task 16: 费用防刷（owner 锁 + 日限额）

**Files:**
- Create: `lib/cost-guard/index.ts`
- Test: `lib/cost-guard/index.test.ts`

- [ ] **Step 1: 测试**

`lib/cost-guard/index.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { acquireGenerateSlot, resetForTest } from './index';

describe('cost-guard', () => {
  beforeEach(() => {
    resetForTest();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  it('allows first generate', () => {
    expect(acquireGenerateSlot('o1').ok).toBe(true);
  });

  it('blocks same owner within 30s', () => {
    acquireGenerateSlot('o1');
    const r = acquireGenerateSlot('o1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('owner-locked');
  });

  it('allows same owner after 30s', () => {
    acquireGenerateSlot('o1');
    vi.setSystemTime(new Date('2026-01-01T00:00:31Z'));
    expect(acquireGenerateSlot('o1').ok).toBe(true);
  });

  it('allows different owner within 30s', () => {
    acquireGenerateSlot('o1');
    expect(acquireGenerateSlot('o2').ok).toBe(true);
  });

  it('enforces daily cap', () => {
    process.env.MAX_GENERATIONS_PER_DAY = '3';
    acquireGenerateSlot('a'); vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
    acquireGenerateSlot('b'); vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
    acquireGenerateSlot('c'); vi.setSystemTime(new Date('2026-01-01T00:03:00Z'));
    const r = acquireGenerateSlot('d');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('daily-cap');
  });
});
```

- [ ] **Step 2: 跑失败**

```bash
pnpm test cost-guard
```

- [ ] **Step 3: 实现**

`lib/cost-guard/index.ts`：

```ts
const OWNER_LOCK_MS = 30_000;
const ownerLocks = new Map<string, number>(); // ownerId → unlockAtMs
let dailyCount = 0;
let dailyWindowStart = 0;

type Result = { ok: true } | { ok: false; reason: 'owner-locked' | 'daily-cap' };

function getDailyMax(): number {
  const v = Number(process.env.MAX_GENERATIONS_PER_DAY);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

function tickDailyWindow(): void {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  if (now - dailyWindowStart > dayMs) {
    dailyWindowStart = now;
    dailyCount = 0;
  }
}

export function acquireGenerateSlot(ownerId: string): Result {
  tickDailyWindow();
  const unlockAt = ownerLocks.get(ownerId);
  if (unlockAt && unlockAt > Date.now()) {
    return { ok: false, reason: 'owner-locked' };
  }
  if (dailyCount >= getDailyMax()) {
    return { ok: false, reason: 'daily-cap' };
  }
  ownerLocks.set(ownerId, Date.now() + OWNER_LOCK_MS);
  dailyCount += 1;
  return { ok: true };
}

export function resetForTest(): void {
  ownerLocks.clear();
  dailyCount = 0;
  dailyWindowStart = 0;
}
```

- [ ] **Step 4: 跑通过**

```bash
pnpm test cost-guard
```

- [ ] **Step 5: Commit**

```bash
git add lib/cost-guard/index.ts lib/cost-guard/index.test.ts
git commit -m "feat: cost guard with owner lock and daily cap"
```

---

### Task 17: /api/generate + 审核页基础结构

**Files:**
- Create: `app/api/generate/route.ts`
- Create: `components/admin/GenerateButton.tsx`
- Modify: `app/admin/titles/[id]/page.tsx`（加入 GenerateButton + 题目列表入口）
- Modify: `app/admin/chapters/[id]/page.tsx`（同上）

- [ ] **Step 1: /api/generate route**

`app/api/generate/route.ts`：

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { db, schema } from '@/lib/db/client';
import { and, eq } from 'drizzle-orm';
import { generateQuestions, GenerateError } from '@/lib/ai/generate';
import { acquireGenerateSlot } from '@/lib/cost-guard';
import { wordCount } from '@/lib/utils/word-count';
import { z } from 'zod';

const Input = z.object({
  ownerType: z.enum(['title', 'chapter']),
  ownerId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (res) {
    return res as Response;
  }

  const parse = Input.safeParse(await req.json().catch(() => ({})));
  if (!parse.success) return NextResponse.json({ error: 'bad input' }, { status: 400 });
  const { ownerType, ownerId } = parse.data;

  const [sm] = await db.select().from(schema.sourceMaterial)
    .where(and(
      eq(schema.sourceMaterial.ownerType, ownerType),
      eq(schema.sourceMaterial.ownerId, ownerId),
    )).limit(1);
  if (!sm || wordCount(sm.text) < 50) {
    return NextResponse.json({ error: '原文太短或不存在（至少 50 词）' }, { status: 400 });
  }

  const slot = acquireGenerateSlot(ownerId);
  if (!slot.ok) {
    const map = { 'owner-locked': '请等待 30 秒后再试', 'daily-cap': '已达每日生成上限' };
    return NextResponse.json({ error: map[slot.reason] }, { status: 429 });
  }

  try {
    const result = await generateQuestions(sm.text);
    // 先清掉该 owner 之前的题，再写入新题（简化策略：重新生成 = 覆盖）
    await db.delete(schema.question).where(and(
      eq(schema.question.ownerType, ownerType),
      eq(schema.question.ownerId, ownerId),
    ));
    await db.insert(schema.question).values(
      result.questions.map((q, i) => ({
        ownerType, ownerId,
        category: q.category,
        stem: q.stem,
        options: q.options,
        correctIndex: q.correct_index,
        explanation: q.explanation,
        orderIndex: i,
      })),
    );
    return NextResponse.json({ ok: true, count: result.questions.length });
  } catch (err) {
    if (err instanceof GenerateError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('generate failed', err);
    return NextResponse.json({ error: '内部错误' }, { status: 500 });
  }
}
```

- [ ] **Step 2: GenerateButton**

`components/admin/GenerateButton.tsx`：

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function GenerateButton({
  ownerType, ownerId, disabled, reviewHref,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  disabled?: boolean;
  reviewHref: string;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    setErr(null);
    startTransition(async () => {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerType, ownerId }),
      });
      if (res.ok) {
        router.push(reviewHref);
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? '生成失败');
      }
    });
  }

  return (
    <div>
      <button className="btn-primary" onClick={onClick} disabled={disabled || pending}>
        {pending ? 'AI 生成中…（约 10–30 秒）' : '生成 10 道题目'}
      </button>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3: 整合到 title / chapter 页**

在 title 短内容分支里：

```tsx
<GenerateButton
  ownerType="title"
  ownerId={t.id}
  reviewHref={`/admin/titles/${t.id}/review`}
/>
```

在 chapter 页里类似：

```tsx
<GenerateButton
  ownerType="chapter"
  ownerId={c.id}
  reviewHref={`/admin/chapters/${c.id}/review`}
/>
```

- [ ] **Step 4: 冒烟验证（fake AI）**

```bash
# .env.local 临时 USE_FAKE_AI=true
USE_FAKE_AI=true pnpm dev
# 创建 title → 粘贴 60+ 词的原文 → 保存 → 点「生成」
# 应跳转到 /admin/titles/<id>/review（页面目前 404，下个 task 实现）
# DB 里 question 表应有 10 条
```

- [ ] **Step 5: Commit**

```bash
git add app/api/generate/route.ts components/admin/GenerateButton.tsx \
        app/admin/titles/[id]/page.tsx app/admin/chapters/[id]/page.tsx
git commit -m "feat: wire /api/generate and admin generate button"
```

---

## Part E · 题目审核与发布（Tasks 18-19）

### Task 18: 题目审核页（inline 编辑 + 删除）

**Files:**
- Create: `lib/db/actions/question.ts`
- Create: `components/admin/QuestionReviewList.tsx`
- Create: `app/admin/titles/[id]/review/page.tsx`
- Create: `app/admin/chapters/[id]/review/page.tsx`

- [ ] **Step 1: question server actions**

`lib/db/actions/question.ts`：

```ts
'use server';
import { db, schema } from '@/lib/db/client';
import { and, asc, eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth/guard';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type OwnerType = 'title' | 'chapter';

export async function listQuestions(ownerType: OwnerType, ownerId: string) {
  return db.select().from(schema.question)
    .where(and(
      eq(schema.question.ownerType, ownerType),
      eq(schema.question.ownerId, ownerId),
    ))
    .orderBy(asc(schema.question.orderIndex));
}

const UpdateInput = z.object({
  id: z.string().uuid(),
  stem: z.string().min(3),
  options: z.array(z.string().min(1)).length(3),
  correctIndex: z.number().int().min(0).max(2),
  explanation: z.string().min(3),
  category: z.enum(['vocab', 'sentence', 'reading']),
});

export async function updateQuestion(input: z.infer<typeof UpdateInput>, revalidateHref: string) {
  await requireAdmin();
  const data = UpdateInput.parse(input);
  await db.update(schema.question).set({
    stem: data.stem,
    options: data.options,
    correctIndex: data.correctIndex,
    explanation: data.explanation,
    category: data.category,
  }).where(eq(schema.question.id, data.id));
  revalidatePath(revalidateHref);
}

export async function deleteQuestion(id: string, revalidateHref: string) {
  await requireAdmin();
  await db.delete(schema.question).where(eq(schema.question.id, id));
  revalidatePath(revalidateHref);
}
```

- [ ] **Step 2: QuestionReviewList**

`components/admin/QuestionReviewList.tsx`：

```tsx
'use client';
import { useState, useTransition } from 'react';
import type { InferSelectModel } from 'drizzle-orm';
import type { schema } from '@/lib/db/client';
import { updateQuestion, deleteQuestion } from '@/lib/db/actions/question';

type Q = InferSelectModel<typeof schema.question>;

export function QuestionReviewList({
  items, revalidateHref,
}: {
  items: Q[];
  revalidateHref: string;
}) {
  return (
    <ul className="space-y-3">
      {items.map((q) => (
        <QuestionRow key={q.id} q={q} revalidateHref={revalidateHref} />
      ))}
    </ul>
  );
}

function QuestionRow({ q, revalidateHref }: { q: Q; revalidateHref: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [stem, setStem] = useState(q.stem);
  const [options, setOptions] = useState<string[]>(q.options as string[]);
  const [correctIndex, setCorrectIndex] = useState(q.correctIndex);
  const [explanation, setExplanation] = useState(q.explanation);
  const [category, setCategory] = useState(q.category);

  const letter = ['A', 'B', 'C'];

  function save() {
    startTransition(async () => {
      await updateQuestion({ id: q.id, stem, options, correctIndex, explanation, category }, revalidateHref);
      setEditing(false);
    });
  }

  function remove() {
    if (!confirm('删除这道题？')) return;
    startTransition(async () => {
      await deleteQuestion(q.id, revalidateHref);
    });
  }

  if (editing) {
    return (
      <li className="card space-y-2">
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as any)}>
          <option value="vocab">vocab</option>
          <option value="sentence">sentence</option>
          <option value="reading">reading</option>
        </select>
        <textarea className="input h-20" value={stem} onChange={(e) => setStem(e.target.value)} />
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" name={`correct-${q.id}`} checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
            <span className="w-5 text-ink-700">{letter[i]}</span>
            <input className="input flex-1" value={opt}
              onChange={(e) => setOptions(options.map((o, j) => (i === j ? e.target.value : o)))} />
          </div>
        ))}
        <textarea className="input h-20" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={pending} onClick={save}>保存</button>
          <button className="btn-ghost" onClick={() => setEditing(false)}>取消</button>
        </div>
      </li>
    );
  }

  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs text-ink-700">[{q.category}]</span>
          <p className="font-medium">{q.stem}</p>
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost text-xs" onClick={() => setEditing(true)}>编辑</button>
          <button className="btn-ghost text-xs text-danger" disabled={pending} onClick={remove}>删除</button>
        </div>
      </div>
      <ul className="ml-2 space-y-1 text-sm">
        {(q.options as string[]).map((opt, i) => (
          <li key={i} className={i === q.correctIndex ? 'text-success font-medium' : ''}>
            {letter[i]} · {opt} {i === q.correctIndex && '✓'}
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-700">{q.explanation}</p>
    </li>
  );
}
```

- [ ] **Step 3: title review 页**

`app/admin/titles/[id]/review/page.tsx`：

```tsx
import Link from 'next/link';
import { getTitle } from '@/lib/db/actions/title';
import { listQuestions } from '@/lib/db/actions/question';
import { QuestionReviewList } from '@/components/admin/QuestionReviewList';
import { PublishButton } from '@/components/admin/PublishButton';
import { notFound } from 'next/navigation';

export default async function TitleReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTitle(id);
  if (!t) notFound();
  const questions = await listQuestions('title', id);
  const href = `/admin/titles/${id}/review`;
  return (
    <div className="space-y-6">
      <Link href={`/admin/titles/${id}`} className="text-sm text-primary-700">← 返回 title</Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审核题目 · {t.name}</h1>
        <PublishButton ownerType="title" ownerId={id} status={t.status} />
      </header>
      {questions.length === 0 ? (
        <p className="text-ink-700">还没有生成题目。</p>
      ) : (
        <QuestionReviewList items={questions} revalidateHref={href} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: chapter review 页**

`app/admin/chapters/[id]/review/page.tsx`：

```tsx
import Link from 'next/link';
import { getChapter } from '@/lib/db/actions/chapter';
import { listQuestions } from '@/lib/db/actions/question';
import { QuestionReviewList } from '@/components/admin/QuestionReviewList';
import { PublishButton } from '@/components/admin/PublishButton';
import { notFound } from 'next/navigation';

export default async function ChapterReview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getChapter(id);
  if (!c) notFound();
  const questions = await listQuestions('chapter', id);
  const href = `/admin/chapters/${id}/review`;
  return (
    <div className="space-y-6">
      <Link href={`/admin/chapters/${id}`} className="text-sm text-primary-700">← 返回章节</Link>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">审核题目 · {c.name}</h1>
        <PublishButton ownerType="chapter" ownerId={id} status={c.status} />
      </header>
      {questions.length === 0 ? (
        <p className="text-ink-700">还没有生成题目。</p>
      ) : (
        <QuestionReviewList items={questions} revalidateHref={href} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/db/actions/question.ts components/admin/QuestionReviewList.tsx \
        app/admin/titles/[id]/review/ app/admin/chapters/[id]/review/
git commit -m "feat: admin question review page with inline edit/delete"
```

---

### Task 19: 发布按钮（整组发布）

**Files:**
- Create: `components/admin/PublishButton.tsx`

- [ ] **Step 1: PublishButton**

`components/admin/PublishButton.tsx`：

```tsx
'use client';
import { useTransition } from 'react';
import { publishTitle, unpublishTitle } from '@/lib/db/actions/title';
import { publishChapter, unpublishChapter } from '@/lib/db/actions/chapter';

export function PublishButton({
  ownerType, ownerId, status,
}: {
  ownerType: 'title' | 'chapter';
  ownerId: string;
  status: 'draft' | 'published';
}) {
  const [pending, startTransition] = useTransition();

  async function flip() {
    if (status === 'draft') {
      if (!confirm('确认发布？孩子端将可以看到这组题目。')) return;
      startTransition(async () => {
        if (ownerType === 'title') await publishTitle(ownerId);
        else await publishChapter(ownerId);
      });
    } else {
      if (!confirm('撤回发布？孩子端将看不到。')) return;
      startTransition(async () => {
        if (ownerType === 'title') await unpublishTitle(ownerId);
        else await unpublishChapter(ownerId);
      });
    }
  }

  return (
    <button
      className={status === 'published' ? 'btn-ghost' : 'btn-primary'}
      onClick={flip}
      disabled={pending}
    >
      {status === 'published' ? '撤回发布' : '发布这组题'}
    </button>
  );
}
```

- [ ] **Step 2: 冒烟**

```bash
pnpm dev
# 生成题目 → 进入 review 页 → 点「发布这组题」→ 状态切换
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/PublishButton.tsx
git commit -m "feat: add publish/unpublish toggle button"
```

---

## Part F · 孩子端（Tasks 20-24）

### Task 20: kid 布局 + 首页

**Files:**
- Create: `app/(kid)/layout.tsx`
- Create: `components/kid/SeriesGrid.tsx`
- Create: `app/(kid)/page.tsx` (replace previous placeholder)
- Create: `lib/db/queries/kid.ts`

- [ ] **Step 1: 孩子端查询**

`lib/db/queries/kid.ts`：

```ts
import { db, schema } from '@/lib/db/client';
import { and, eq, exists, sql } from 'drizzle-orm';

// "有至少一个 published title" 的系列；或者 is_long=true 的 title 有 published chapter
export async function listPublicSeries() {
  return db.select().from(schema.series)
    .where(exists(
      db.select({ x: sql`1` }).from(schema.title).where(and(
        eq(schema.title.seriesId, schema.series.id),
        // 短 title 直接发布；长 title 需至少一个章节发布
        sql`(${schema.title.isLong} = false AND ${schema.title.status} = 'published')
             OR (${schema.title.isLong} = true AND EXISTS (
               SELECT 1 FROM chapter c
               WHERE c.title_id = ${schema.title.id} AND c.status = 'published'
             ))`,
      )),
    ));
}

export async function listPublicTitlesInSeries(seriesId: string) {
  // Spec §9: 短 title 题目数 < 3 则不展示；长 title 只要有任意 published chapter 就展示
  return db.select().from(schema.title)
    .where(and(
      eq(schema.title.seriesId, seriesId),
      sql`(
            ${schema.title.isLong} = false
            AND ${schema.title.status} = 'published'
            AND (SELECT count(*) FROM question q
                 WHERE q.owner_type = 'title' AND q.owner_id = ${schema.title.id}) >= 3
          )
          OR (
            ${schema.title.isLong} = true
            AND EXISTS (
              SELECT 1 FROM chapter c
              WHERE c.title_id = ${schema.title.id} AND c.status = 'published'
            )
          )`,
    ));
}

export async function listPublicChapters(titleId: string) {
  // Spec §9: 题目数 < 3 的章节也不展示
  return db.select().from(schema.chapter)
    .where(and(
      eq(schema.chapter.titleId, titleId),
      eq(schema.chapter.status, 'published'),
      sql`(SELECT count(*) FROM question q
           WHERE q.owner_type = 'chapter' AND q.owner_id = ${schema.chapter.id}) >= 3`,
    ));
}

export async function getPublicTitle(id: string) {
  const [row] = await db.select().from(schema.title)
    .where(eq(schema.title.id, id)).limit(1);
  if (!row) return null;
  // 短 title 要 published；长 title 无需自身 published，只需有 published 章节
  if (!row.isLong && row.status !== 'published') return null;
  return row;
}

export async function getPublicChapter(id: string) {
  const [row] = await db.select().from(schema.chapter)
    .where(and(eq(schema.chapter.id, id), eq(schema.chapter.status, 'published')))
    .limit(1);
  return row ?? null;
}

export async function getQuestionsForOwner(ownerType: 'title' | 'chapter', ownerId: string) {
  return db.select().from(schema.question)
    .where(and(
      eq(schema.question.ownerType, ownerType),
      eq(schema.question.ownerId, ownerId),
    ));
}
```

- [ ] **Step 2: layout**

`app/(kid)/layout.tsx`：

```tsx
import Link from 'next/link';

export default function KidLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold text-primary-700">📘 英文 Quiz</Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: SeriesGrid 组件**

`components/kid/SeriesGrid.tsx`：

```tsx
import Link from 'next/link';
import type { InferSelectModel } from 'drizzle-orm';
import type { schema } from '@/lib/db/client';

type Series = InferSelectModel<typeof schema.series>;

export function SeriesGrid({ items }: { items: Series[] }) {
  if (items.length === 0) return <p className="text-ink-700">还没有上线的内容。</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((s) => (
        <Link key={s.id} href={`/s/${s.id}`} className="card flex flex-col gap-2 hover:border-primary-500">
          <div className="flex aspect-[3/4] items-center justify-center rounded-card bg-primary-50 text-3xl">
            {s.kind === 'book' ? '📚' : '🎬'}
          </div>
          <div className="text-sm font-semibold">{s.title}</div>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 首页**

`app/(kid)/page.tsx`：

```tsx
import { listPublicSeries } from '@/lib/db/queries/kid';
import { SeriesGrid } from '@/components/kid/SeriesGrid';

export default async function Home() {
  const all = await listPublicSeries();
  const books = all.filter((s) => s.kind === 'book');
  const animations = all.filter((s) => s.kind === 'animation');
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xl font-bold">📚 书籍</h2>
        <SeriesGrid items={books} />
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">🎬 动画</h2>
        <SeriesGrid items={animations} />
      </section>
    </div>
  );
}
```

- [ ] **Step 5: 删除之前临时首页**

因为 Task 2 在 `app/page.tsx` 写了临时样式页；而现在用 `(kid)` route group，`app/(kid)/page.tsx` 会取代它。删除旧文件：

```bash
rm app/page.tsx
```

- [ ] **Step 6: 验证**

```bash
pnpm dev
# 访问 / → 看到"书籍"和"动画"两个 section
# 已发布的系列应显示为卡片
```

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries/kid.ts app/\(kid\)/ components/kid/SeriesGrid.tsx
git rm app/page.tsx
git commit -m "feat: kid-side home with series grid"
```

---

### Task 21: 系列 → title 列表

**Files:**
- Create: `components/kid/TitleList.tsx`
- Create: `app/(kid)/s/[seriesId]/page.tsx`

- [ ] **Step 1: TitleList**

`components/kid/TitleList.tsx`：

```tsx
import Link from 'next/link';
import type { InferSelectModel } from 'drizzle-orm';
import type { schema } from '@/lib/db/client';

type Title = InferSelectModel<typeof schema.title>;

export function TitleList({ items }: { items: Title[] }) {
  if (items.length === 0) return <p className="text-ink-700">这个系列还没有上线内容。</p>;
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t.id} className="card">
          <Link href={`/t/${t.id}`} className="flex items-center justify-between">
            <div>
              <p className="font-medium text-primary-700">{t.name}</p>
              {t.isLong && <p className="text-xs text-ink-700">含章节</p>}
            </div>
            <span className="text-ink-700">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: 系列页**

`app/(kid)/s/[seriesId]/page.tsx`：

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db, schema } from '@/lib/db/client';
import { eq } from 'drizzle-orm';
import { listPublicTitlesInSeries } from '@/lib/db/queries/kid';
import { TitleList } from '@/components/kid/TitleList';

export default async function SeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  const [s] = await db.select().from(schema.series).where(eq(schema.series.id, seriesId)).limit(1);
  if (!s) notFound();
  const titles = await listPublicTitlesInSeries(seriesId);
  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-primary-700">← 首页</Link>
      <h1 className="text-2xl font-bold">{s.title}</h1>
      <TitleList items={titles} />
    </div>
  );
}
```

- [ ] **Step 3: 验证 + Commit**

```bash
pnpm dev
# 访问首页 → 点一个系列 → 看到 title 列表
```

```bash
git add components/kid/TitleList.tsx app/\(kid\)/s/
git commit -m "feat: kid series detail with title list"
```

---

### Task 22: Title 详情页（短→开始按钮 / 长→章节列表）

**Files:**
- Create: `components/kid/ChapterList.tsx`
- Create: `app/(kid)/t/[titleId]/page.tsx`

- [ ] **Step 1: ChapterList**

`components/kid/ChapterList.tsx`：

```tsx
import Link from 'next/link';
import type { InferSelectModel } from 'drizzle-orm';
import type { schema } from '@/lib/db/client';

type Chapter = InferSelectModel<typeof schema.chapter>;

export function ChapterList({ items }: { items: Chapter[] }) {
  if (items.length === 0) return <p className="text-ink-700">尚未上线任何章节。</p>;
  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id} className="card">
          <Link href={`/c/${c.id}/quiz`} className="flex items-center justify-between">
            <p className="font-medium text-primary-700">{c.name}</p>
            <span className="text-ink-700">开始 →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: title 详情页**

`app/(kid)/t/[titleId]/page.tsx`：

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicTitle, listPublicChapters } from '@/lib/db/queries/kid';
import { ChapterList } from '@/components/kid/ChapterList';

export default async function TitlePage({ params }: { params: Promise<{ titleId: string }> }) {
  const { titleId } = await params;
  const t = await getPublicTitle(titleId);
  if (!t) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/s/${t.seriesId}`} className="text-sm text-primary-700">← 系列</Link>
      <h1 className="text-2xl font-bold">{t.name}</h1>
      {t.isLong ? (
        <>
          <p className="text-ink-700">按章节练习：</p>
          <ChapterList items={await listPublicChapters(t.id)} />
        </>
      ) : (
        <div className="card">
          <Link className="btn-primary" href={`/t/${t.id}/quiz`}>开始 Quiz</Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证 + Commit**

```bash
pnpm dev
# 访问短 title → 看到开始按钮
# 访问长 title → 看到章节列表
```

```bash
git add components/kid/ChapterList.tsx app/\(kid\)/t/\[titleId\]/page.tsx
git commit -m "feat: kid title detail (short→start / long→chapters)"
```

---

### Task 23: QuizRunner + ResultScreen（合并同一组件）

**Files:**
- Create: `lib/utils/shuffle.ts`
- Test: `lib/utils/shuffle.test.ts`
- Create: `components/kid/QuizRunner.tsx`
- Create: `app/(kid)/t/[titleId]/quiz/page.tsx`
- Create: `app/(kid)/c/[chapterId]/quiz/page.tsx`
- Create: `app/(kid)/result/page.tsx`

- [ ] **Step 1: 打乱函数测试**

`lib/utils/shuffle.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { shuffle, seedShuffle } from './shuffle';

describe('shuffle', () => {
  it('keeps the same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const s = shuffle(arr);
    expect(s.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(s.length).toBe(5);
  });
  it('does not mutate input', () => {
    const arr = [1, 2, 3];
    shuffle(arr);
    expect(arr).toEqual([1, 2, 3]);
  });
  it('seedShuffle deterministic for same seed', () => {
    const a = seedShuffle([1, 2, 3, 4, 5], 'abc');
    const b = seedShuffle([1, 2, 3, 4, 5], 'abc');
    expect(a).toEqual(b);
  });
  it('seedShuffle differs for different seeds', () => {
    const a = seedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'aaa');
    const b = seedShuffle([1, 2, 3, 4, 5, 6, 7, 8], 'bbb');
    // 非保证但大概率不等；用足够长数组保证
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: 实现**

`lib/utils/shuffle.ts`：

```ts
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// xmur3 + mulberry32 (简单确定性 PRNG)
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedShuffle<T>(arr: readonly T[], seedStr: string): T[] {
  const hash = xmur3(seedStr)();
  const rand = mulberry32(hash);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
```

- [ ] **Step 3: 测试通过**

```bash
pnpm test shuffle
```

- [ ] **Step 4: QuizRunner**

`components/kid/QuizRunner.tsx`：

```tsx
'use client';
import { useMemo, useState } from 'react';
import { shuffle } from '@/lib/utils/shuffle';

type Q = {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: 'vocab' | 'sentence' | 'reading';
};

type ShuffledQ = Q & { displayedOptions: string[]; displayedToOriginal: number[] };

export function QuizRunner({ questions }: { questions: Q[] }) {
  const shuffled = useMemo<ShuffledQ[]>(() => {
    return shuffle(questions).map((q) => {
      const indices = shuffle([0, 1, 2]);
      return {
        ...q,
        displayedOptions: indices.map((i) => q.options[i]!),
        displayedToOriginal: indices,
      };
    });
  }, [questions]);

  const [phase, setPhase] = useState<'quiz' | 'result'>('quiz');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]); // 存"displayed index"

  if (questions.length === 0) {
    return <p className="text-ink-700">这组题目还没准备好。</p>;
  }

  if (phase === 'quiz') {
    const q = shuffled[currentIndex]!;
    return (
      <div className="space-y-4">
        <div className="text-sm text-ink-700">第 {currentIndex + 1} / {shuffled.length} 题</div>
        <h2 className="text-xl font-semibold">{q.stem}</h2>
        <ul className="space-y-2">
          {q.displayedOptions.map((opt, i) => (
            <li key={i}>
              <button
                className="card w-full text-left hover:border-primary-500"
                onClick={() => {
                  const next = [...answers, i];
                  if (next.length === shuffled.length) {
                    setAnswers(next);
                    setPhase('result');
                  } else {
                    setAnswers(next);
                    setCurrentIndex(currentIndex + 1);
                  }
                }}
              >
                <span className="mr-2 text-ink-700">{String.fromCharCode(65 + i)}.</span>
                {opt}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // result phase
  const results = shuffled.map((q, i) => {
    const displayedAns = answers[i]!;
    const originalAns = q.displayedToOriginal[displayedAns]!;
    const correct = originalAns === q.correctIndex;
    return { q, displayedAns, originalAns, correct };
  });
  const score = results.filter((r) => r.correct).length;

  return (
    <div className="space-y-6">
      <div className="card text-center">
        <p className="text-2xl font-bold">得分 {score} / {shuffled.length}</p>
      </div>
      <h2 className="text-lg font-semibold">错题</h2>
      {results.filter((r) => !r.correct).length === 0 ? (
        <p className="text-success">🎉 全对了！</p>
      ) : (
        <ul className="space-y-3">
          {results.filter((r) => !r.correct).map(({ q, originalAns }) => (
            <WrongRow key={q.id} q={q} chose={originalAns} />
          ))}
        </ul>
      )}
      <button className="btn-ghost" onClick={() => {
        setPhase('quiz'); setCurrentIndex(0); setAnswers([]);
      }}>再做一次</button>
    </div>
  );
}

function WrongRow({ q, chose }: { q: { stem: string; options: string[]; correctIndex: number; explanation: string }; chose: number }) {
  const [open, setOpen] = useState(false);
  const letter = ['A', 'B', 'C'];
  return (
    <li className="card">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <p className="font-medium">{q.stem}</p>
        <p className="mt-1 text-sm">
          你选了 <span className="text-danger">{letter[chose]}</span>，
          正确答案 <span className="text-success">{letter[q.correctIndex]}</span>
        </p>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          <ul>
            {q.options.map((opt, i) => (
              <li key={i} className={i === q.correctIndex ? 'text-success' : ''}>
                {letter[i]} · {opt}
              </li>
            ))}
          </ul>
          <p className="rounded bg-ink-100 p-2 text-ink-900">{q.explanation}</p>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 5: title quiz 页**

`app/(kid)/t/[titleId]/quiz/page.tsx`：

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicTitle, getQuestionsForOwner } from '@/lib/db/queries/kid';
import { QuizRunner } from '@/components/kid/QuizRunner';

export default async function TitleQuiz({ params }: { params: Promise<{ titleId: string }> }) {
  const { titleId } = await params;
  const t = await getPublicTitle(titleId);
  if (!t || t.isLong) notFound();
  const qs = await getQuestionsForOwner('title', titleId);
  return (
    <div className="space-y-4">
      <Link href={`/t/${titleId}`} className="text-sm text-primary-700">← 返回</Link>
      <h1 className="text-xl font-bold">{t.name}</h1>
      <QuizRunner questions={qs.map((q) => ({
        id: q.id, stem: q.stem, options: q.options as string[],
        correctIndex: q.correctIndex, explanation: q.explanation, category: q.category,
      }))} />
    </div>
  );
}
```

- [ ] **Step 6: chapter quiz 页**

`app/(kid)/c/[chapterId]/quiz/page.tsx`：

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicChapter, getQuestionsForOwner } from '@/lib/db/queries/kid';
import { QuizRunner } from '@/components/kid/QuizRunner';

export default async function ChapterQuiz({ params }: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await params;
  const c = await getPublicChapter(chapterId);
  if (!c) notFound();
  const qs = await getQuestionsForOwner('chapter', chapterId);
  return (
    <div className="space-y-4">
      <Link href={`/t/${c.titleId}`} className="text-sm text-primary-700">← 返回</Link>
      <h1 className="text-xl font-bold">{c.name}</h1>
      <QuizRunner questions={qs.map((q) => ({
        id: q.id, stem: q.stem, options: q.options as string[],
        correctIndex: q.correctIndex, explanation: q.explanation, category: q.category,
      }))} />
    </div>
  );
}
```

- [ ] **Step 7: /result fallback 页**

`app/(kid)/result/page.tsx`：

```tsx
import Link from 'next/link';

export default function ResultFallback() {
  return (
    <div className="card text-center">
      <p className="mb-2">没有可展示的结果。</p>
      <Link href="/" className="btn-primary">回首页开始练习</Link>
    </div>
  );
}
```

- [ ] **Step 8: 端到端验证**

```bash
pnpm dev
# 孩子端：首页 → 系列 → 短 title → 开始 Quiz → 做完 10 题 → 看到结果页
# 展开错题 → 看到中文解释
# 点「再做一次」→ 重置
```

- [ ] **Step 9: Commit**

```bash
git add lib/utils/shuffle.ts lib/utils/shuffle.test.ts \
        components/kid/QuizRunner.tsx \
        app/\(kid\)/t/\[titleId\]/quiz/ \
        app/\(kid\)/c/ \
        app/\(kid\)/result/
git commit -m "feat: kid quiz runner + result screen with shuffle"
```

---

## Part G · 测试完善与部署（Tasks 24-26）

### Task 24: /api/generate 集成测试（fake AI）

**Files:**
- Create: `tests/integration/generate.test.ts`
- Modify: `vitest.config.ts`（若需分环境，可留默认）

- [ ] **Step 1: 测试**

`tests/integration/generate.test.ts`：

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as generate } from '@/app/api/generate/route';
import { db, schema } from '@/lib/db/client';
import { eq, and } from 'drizzle-orm';

describe('/api/generate (integration, fake AI)', () => {
  let titleId: string;

  beforeAll(async () => {
    // 确保 migrations 跑过（测试前手动执行一次 `DATABASE_URL=... pnpm db:migrate`）
    const [s] = await db.insert(schema.series).values({ kind: 'book', title: 'test series' }).returning();
    const [t] = await db.insert(schema.title).values({ seriesId: s.id, name: 'test title' }).returning();
    await db.insert(schema.sourceMaterial).values({
      ownerType: 'title', ownerId: t.id,
      text: 'This is a test source text. '.repeat(20), // 够 50 词
    });
    titleId = t.id;
  });

  it('rejects unauthenticated', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ ownerType: 'title', ownerId: titleId }),
    });
    const res = await generate(req);
    expect(res.status).toBe(401);
  });

  // 真实要跑这个需要 mock session；此处给出骨架，具体技巧详见 iron-session docs
  // 在 MVP 阶段集成测试可以通过 middleware 绕过或直接调用 generate 函数。
});
```

- [ ] **Step 2: 说明**

生产化的集成测试需要模拟 session cookie（或在测试时绕过 `requireAdmin`）。为 MVP 采用"绕过"策略最简单：可以在 `requireAdmin` 中加 `if (process.env.TEST_BYPASS_AUTH==='true') return {};`。

更新 `lib/auth/guard.ts`（整个文件）：

```ts
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type AdminSession } from './session';

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSession>(cookieStore, sessionOptions);
}

export async function requireAdmin(): Promise<AdminSession> {
  if (process.env.TEST_BYPASS_AUTH === 'true') {
    return { isAdmin: true, loggedInAt: Date.now() } as AdminSession;
  }
  const session = await getAdminSession();
  if (!session.isAdmin) {
    throw new Response('Unauthorized', { status: 401 });
  }
  return session;
}
```

`vitest.config.ts` env 加入 `TEST_BYPASS_AUTH: 'true'`.

然后把测试扩为：

```ts
it('generates 10 questions and persists them', async () => {
  const req = new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    body: JSON.stringify({ ownerType: 'title', ownerId: titleId }),
  });
  const res = await generate(req);
  expect(res.status).toBe(200);
  const rows = await db.select().from(schema.question).where(and(
    eq(schema.question.ownerType, 'title'),
    eq(schema.question.ownerId, titleId),
  ));
  expect(rows).toHaveLength(10);
});
```

- [ ] **Step 3: 跑**

```bash
# 需要一个独立测试 DB
createdb quiz_test || true
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz_test pnpm db:migrate
pnpm test tests/integration
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/ lib/auth/guard.ts vitest.config.ts
git commit -m "test: add /api/generate integration test with fake ai"
```

---

### Task 25: Playwright E2E（孩子端 happy path）

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/kid-happy-path.spec.ts`
- Create: `tests/e2e/setup.ts`
- Modify: `package.json`

- [ ] **Step 1: Playwright 配置**

```bash
pnpm dlx playwright install chromium
```

`playwright.config.ts`：

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    env: {
      USE_FAKE_AI: 'true',
    },
  },
});
```

`package.json` 加入：

```json
"test:e2e": "playwright test"
```

- [ ] **Step 2: Setup 脚本**

`tests/e2e/setup.ts`：种入一组测试数据，调用 DB 直接写（绕过 UI）

```ts
import { db, schema } from '@/lib/db/client';
import { fakeGenerateResponse } from '@/lib/ai/fake';

export async function seedKidData() {
  const [s] = await db.insert(schema.series)
    .values({ kind: 'book', title: 'E2E Series' }).returning();
  const [t] = await db.insert(schema.title)
    .values({ seriesId: s.id, name: 'E2E Short Title', status: 'published' }).returning();
  const { questions } = fakeGenerateResponse();
  await db.insert(schema.question).values(
    questions.map((q, i) => ({
      ownerType: 'title' as const, ownerId: t.id,
      category: q.category, stem: q.stem, options: q.options,
      correctIndex: q.correct_index, explanation: q.explanation, orderIndex: i,
    })),
  );
  return { seriesId: s.id, titleId: t.id };
}
```

- [ ] **Step 3: 测试**

`tests/e2e/kid-happy-path.spec.ts`：

```ts
import { test, expect } from '@playwright/test';
import { seedKidData } from './setup';

test('kid can complete a short-title quiz and see results', async ({ page }) => {
  const { titleId } = await seedKidData();

  await page.goto('/');
  await expect(page.getByText('E2E Series')).toBeVisible();
  await page.getByText('E2E Series').click();
  await page.getByText('E2E Short Title').click();
  await page.getByRole('link', { name: '开始 Quiz' }).click();

  for (let i = 0; i < 10; i++) {
    await page.getByRole('button').first().click(); // 每题点 A
  }

  await expect(page.getByText(/得分 \d+ \/ 10/)).toBeVisible();
  await expect(page.getByText('错题').or(page.getByText('全对了'))).toBeVisible();
});
```

- [ ] **Step 4: 跑**

```bash
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz_test pnpm db:migrate
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz_test USE_FAKE_AI=true pnpm test:e2e
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e/ package.json
git commit -m "test: add e2e happy path for kid quiz"
```

---

### Task 26: 部署配置 + CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md` (项目快速上手)
- Modify: `package.json`（加 `typecheck`, `lint` 脚本；若 create-next-app 已加则跳过）

- [ ] **Step 1: package.json 脚本补齐**

确保有：

```json
"lint": "next lint",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: CI workflow**

`.github/workflows/ci.yml`：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: quiz
          POSTGRES_PASSWORD: quiz
          POSTGRES_DB: quiz_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      DATABASE_URL: postgresql://quiz:quiz@localhost:5432/quiz_test
      SESSION_SECRET: ${{ secrets.TEST_SESSION_SECRET }}
      ADMIN_PASSWORD: test-password
      LLM_BASE_URL: https://example.invalid
      LLM_API_KEY: test
      LLM_MODEL: fake
      USE_FAKE_AI: 'true'
      TEST_BYPASS_AUTH: 'true'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm dlx playwright install --with-deps chromium
      - run: pnpm test:e2e
```

> 在仓库 Settings → Secrets → Actions 添加 `TEST_SESSION_SECRET` secret（任意 32+ 字节字符串）。

- [ ] **Step 3: README.md**

写精简的 README：

```md
# 英文 Quiz · 儿童英文读物/动画配套练习

自用级 Web 应用。8 岁孩子做完英文书/动画后，做 AI 生成的选择题巩固词汇、句型、阅读理解。

## 快速开始

```bash
cp .env.example .env.local
# 填 LLM_API_KEY（DeepSeek 等）、ADMIN_PASSWORD、SESSION_SECRET
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

访问 http://localhost:3000 （孩子端）或 http://localhost:3000/admin （管理后台）。

## 部署到 Vercel + Supabase

1. Supabase 新建 Postgres + Storage（Free 套餐）
2. Vercel 导入项目；env 变量按 `.env.example` 设置
3. 本地针对 production `DATABASE_URL` 运行一次 `pnpm db:migrate`

## 测试

```bash
pnpm test          # 单元 + 集成
pnpm test:e2e      # 端到端
pnpm typecheck
```

## 设计与规划文档

- Spec: `docs/superpowers/specs/2026-04-22-children-english-quiz-design.md`
- Plan: `docs/superpowers/plans/2026-04-23-children-english-quiz-mvp.md`
```

- [ ] **Step 4: Vercel 部署（手工一次性）**

```bash
# 登录 Vercel CLI
pnpm dlx vercel login
# 初次关联
pnpm dlx vercel link
# 设置 env（也可在 Vercel Dashboard 设置）
pnpm dlx vercel env add LLM_BASE_URL production
pnpm dlx vercel env add LLM_API_KEY production
# ... 所有 env 依次加
# 部署
pnpm dlx vercel --prod
```

- [ ] **Step 5: Commit**

```bash
git add .github/ README.md package.json
git commit -m "chore: add ci workflow and readme"
```

- [ ] **Step 6: Push 到远端（可选）**

```bash
# 如果还没加 remote
gh repo create quiz --private --source=. --push
# 或
git remote add origin <url>
git push -u origin main
```

---

## 执行顺序与检查点

| 阶段 | 完成标志 |
|---|---|
| Part A 完成 | `pnpm dev` 跑起来，DB 5 张表在 docker Postgres 里 |
| Part B 完成 | 登录 `/admin` 工作，错 3 次锁 10 分钟 |
| Part C 完成 | 能通过 UI 建系列/title/chapter，粘贴原文 |
| Part D 完成 | 点「生成」能调 fake AI，DB 里出现 10 条 question 记录 |
| Part E 完成 | 能 inline 编辑/删除题目，点「发布」翻转 status |
| Part F 完成 | 孩子端整个流程打通（首页→系列→title→10 题→结果→错题解释） |
| Part G 完成 | CI 跑通，能部署到 Vercel |

---

## 已知坑 / 注意

- **iron-session 在 middleware 里使用 `req.cookies`**：最新版本要 `await cookies()` 或传 `req.cookies as any`；如 API 变了参考官方 docs
- **Next.js 15 `params` 是 Promise**：所有 `{ params }` 要 `await params`
- **Drizzle migrations 存在重复 enum 创建问题**：第一次 `db:generate` 后，若改了 enum 要用 `drizzle-kit introspect` 或手动 SQL
- **DeepSeek `response_format=json_object` 实测**：若不稳，退回"只靠 prompt 要求 JSON + `JSON.parse(content.trim().replace(/^```.*\n/,'').replace(/```$/,''))`"
- **pdf-parse 在 Next.js App Router + Vercel**：必须 `export const runtime = 'nodejs'`（Phase 2 任务里确保）
