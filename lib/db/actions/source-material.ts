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
  const [row] = await db
    .select()
    .from(schema.sourceMaterial)
    .where(
      and(
        eq(schema.sourceMaterial.ownerType, ownerType),
        eq(schema.sourceMaterial.ownerId, ownerId),
      ),
    )
    .limit(1);
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
    await db
      .update(schema.sourceMaterial)
      .set({ text: input.text })
      .where(eq(schema.sourceMaterial.id, existing.id));
  } else {
    await db.insert(schema.sourceMaterial).values(input);
  }
  const path =
    input.ownerType === 'title'
      ? `/admin/titles/${input.ownerId}`
      : `/admin/chapters/${input.ownerId}`;
  revalidatePath(path);
}
