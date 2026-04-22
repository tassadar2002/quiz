import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Supabase's Transaction pooler (port 6543) does NOT support prepared
// statements. postgres.js uses them by default, which makes every query
// fail at runtime on Vercel. Disabling them is harmless elsewhere.
const queryClient = postgres(connectionString, { max: 10, prepare: false });
export const db = drizzle(queryClient, { schema });
export { schema };
