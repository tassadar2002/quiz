import { createClient } from '@supabase/supabase-js';

const BUCKET = 'audio';

let _client: ReturnType<typeof createClient> | null = null;
let _bucketEnsured = false;

function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '');
  // Treat bare value as Supabase project ref (e.g. "wgpcbnpasybuevtwzdxm").
  return `https://${trimmed}.supabase.co`;
}

function client() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured');
  }
  _client = createClient(normalizeSupabaseUrl(url), serviceKey, {
    auth: { persistSession: false },
  });
  return _client;
}

async function ensureBucket() {
  if (_bucketEnsured) return;
  const sb = client();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true });
    // Race-safe: ignore "already exists" errors.
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Failed to create bucket "${BUCKET}": ${error.message}`);
    }
  }
  _bucketEnsured = true;
}

export function publicUrl(path: string): string {
  return client().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function exists(path: string): Promise<boolean> {
  await ensureBucket();
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const { data, error } = await client().storage.from(BUCKET).list(dir, {
    limit: 100,
    search: name,
  });
  if (error) throw new Error(`Storage list failed: ${error.message}`);
  return !!data?.some((f) => f.name === name);
}

export async function upload(path: string, buf: Buffer): Promise<void> {
  await ensureBucket();
  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, buf, {
      contentType: 'audio/mpeg',
      upsert: true,
    });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

export async function removePrefix(prefix: string): Promise<void> {
  await ensureBucket();
  const { data, error: listErr } = await client()
    .storage.from(BUCKET)
    .list(prefix, { limit: 100 });
  if (listErr) throw new Error(`Storage list failed: ${listErr.message}`);
  if (!data?.length) return;
  const paths = data.map((f) => `${prefix}/${f.name}`);
  const { error } = await client().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Storage remove failed: ${error.message}`);
}
