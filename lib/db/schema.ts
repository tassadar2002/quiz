import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

export const seriesKindEnum = pgEnum('series_kind', ['book', 'animation']);
export const publishStatusEnum = pgEnum('publish_status', ['draft', 'published']);
export const ownerTypeEnum = pgEnum('owner_type', ['title', 'chapter']);
export const questionCategoryEnum = pgEnum('question_category', [
  'vocab',
  'sentence',
  'reading',
]);

export const series = pgTable('series', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: seriesKindEnum('kind').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  coverUrl: text('cover_url'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const title = pgTable(
  'title',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    coverUrl: text('cover_url'),
    orderIndex: integer('order_index').default(0).notNull(),
    isLong: boolean('is_long').default(false).notNull(),
    status: publishStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    seriesStatusIdx: index('title_series_status_idx').on(t.seriesId, t.status),
  }),
);

export const chapter = pgTable(
  'chapter',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    titleId: uuid('title_id')
      .notNull()
      .references(() => title.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    orderIndex: integer('order_index').default(0).notNull(),
    status: publishStatusEnum('status').default('draft').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    titleStatusIdx: index('chapter_title_status_idx').on(t.titleId, t.status),
  }),
);

export const sourceMaterial = pgTable(
  'source_material',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ownerType: ownerTypeEnum('owner_type').notNull(),
    ownerId: uuid('owner_id').notNull(),
    text: text('text').notNull(),
    fileUrl: text('file_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index('source_material_owner_idx').on(t.ownerType, t.ownerId),
  }),
);

export const question = pgTable(
  'question',
  {
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
  },
  (t) => ({
    ownerIdx: index('question_owner_idx').on(t.ownerType, t.ownerId),
  }),
);
