import * as ziurodb from './ziurodb';
import { connectToDatabase } from './mongodb';

// ─── Unified Database Layer ─────────────────────────────────────
// Tries ZiuroDB (primary) first. If it fails for any reason,
// falls back to direct MongoDB Atlas via Mongoose.
//
// Usage in API routes:
//   import { db } from '@/lib/db';
//   const user = await db.findOne('users', { username: 'shani' });
//   const messages = await db.find('messages', { senderId: id }, { sort: { createdAt: 1 } });
//   const newUser = await db.insertOne('users', { name: 'Shani', ... });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fallback = () => Promise<any>;

let isZiuroDbOffline = false;

/* Try ZiuroDB first, fall back to Mongoose if it fails */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withFallback<T = any>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ziuroOp: () => Promise<any>,
  mongooseFallback: Fallback,
  label?: string
): Promise<T> {
  // Skip ZiuroDB if not configured
  if (!ziurodb.isConfigured()) {
    return mongooseFallback();
  }

  try {
    const result = await ziuroOp();
    if (isZiuroDbOffline) {
      isZiuroDbOffline = false;
      console.log('[DB] ZiuroDB is online. Reconnected successfully.');
    }
    return result;
  } catch (err) {
    if (!isZiuroDbOffline) {
      isZiuroDbOffline = true;
      console.warn(`[DB] ZiuroDB is offline, falling back to MongoDB Atlas:`, (err as Error).message);
    }
    return mongooseFallback();
  }
}

// ─── Exported Database Operations ────────────────────────────────

/* Connect to the database — tries ZiuroDB ping, falls back to Mongoose connection */
export async function connectDb(): Promise<{ source: 'ziurodb' | 'mongodb' }> {
  if (ziurodb.isConfigured()) {
    try {
      const ok = await ziurodb.ping();
      if (ok) {
        console.log('[DB] Connected via ZiuroDB');
        return { source: 'ziurodb' };
      }
    } catch {
      // ZiuroDB unreachable
    }
  }

  // Fallback to MongoDB Atlas
  await connectToDatabase();
  console.log('[DB] Connected via MongoDB Atlas (fallback)');
  return { source: 'mongodb' };
}

/* Find one document */
export async function findOne(
  collection: string,
  filter: Record<string, unknown>,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.findOne(collection, filter),
    mongooseFallback,
    `findOne(${collection})`
  );
}

/* Find multiple documents */
export async function find(
  collection: string,
  filter: Record<string, unknown>,
  options: { sort?: Record<string, number>; limit?: number } | undefined,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.find(collection, filter, options),
    mongooseFallback,
    `find(${collection})`
  );
}

/* Insert one document */
export async function insertOne(
  collection: string,
  doc: Record<string, unknown>,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.insertOne(collection, doc),
    mongooseFallback,
    `insertOne(${collection})`
  );
}

/* Update one document */
export async function updateOne(
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.updateOne(collection, filter, update),
    mongooseFallback,
    `updateOne(${collection})`
  );
}

/* Update many documents */
export async function updateMany(
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.updateMany(collection, filter, update),
    mongooseFallback,
    `updateMany(${collection})`
  );
}

/* Find by ID */
export async function findById(
  collection: string,
  id: string,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.findById(collection, id),
    mongooseFallback,
    `findById(${collection})`
  );
}

/* Full fallback helper — for complex operations like aggregation pipelines
 *  that can't be easily translated to ZiuroDB query strings.
 *  Tries ZiuroDB raw query first, falls back to Mongoose. */
export async function rawQuery(
  mongoQueryString: string,
  mongooseFallback: Fallback
): Promise<unknown> {
  return withFallback(
    () => ziurodb.query(mongoQueryString).then(r => r.data),
    mongooseFallback,
    'rawQuery'
  );
}

export { withFallback };
