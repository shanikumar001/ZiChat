import axios, { AxiosInstance } from 'axios';

// ─── ZiuroDB Client ─────────────────────────────────────────────
// ZiuroDB is the primary database layer. It proxies MongoDB operations
// via a REST API. If ZiuroDB is unreachable, the app falls back to
// direct MongoDB Atlas via Mongoose (see lib/mongodb.ts).

const ZIURODB_BASE_URL = process.env.ZIURODB_BASE_URL || '';
const ZIURODB_API_KEY = process.env.ZIURODB_API_KEY || '';
const ZIURODB_CONNECTION_ID = process.env.ZIURODB_CONNECTION_ID || '';
const ZIURODB_DB_NAME = process.env.ZIURODB_DB_NAME || 'real_time_chat';

let client: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: ZIURODB_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ZIURODB_API_KEY,
      },
      timeout: 8000,
    });
  }
  return client;
}

/** Check if ZiuroDB is configured (env vars are set) */
export function isConfigured(): boolean {
  return !!(ZIURODB_BASE_URL && ZIURODB_API_KEY && ZIURODB_CONNECTION_ID);
}

// ─── Raw Query ───────────────────────────────────────────────────

interface ZiuroDBResponse {
  success: boolean;
  data?: unknown;
  meta?: { rowCount?: number; executionTimeMs?: number };
  error?: { type: string; message: string };
}

/** Execute a raw MongoDB shell-style query string via ZiuroDB */
export async function query(mongoQuery: string): Promise<ZiuroDBResponse> {
  const { data } = await getClient().post<ZiuroDBResponse>('/query', {
    connectionId: ZIURODB_CONNECTION_ID,
    dbName: ZIURODB_DB_NAME,
    query: mongoQuery,
  });

  if (!data.success) {
    const errMsg = data.error ? `[${data.error.type}] ${data.error.message}` : 'Unknown ZiuroDB error';
    throw new Error(`ZiuroDB: ${errMsg}`);
  }

  return data;
}

// ─── Helper: JSON-safe stringify for MongoDB queries ──────────────
// Handles ObjectId, Date, regex patterns etc.

function toMongoValue(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'string') return JSON.stringify(val);
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val instanceof Date) return `ISODate("${val.toISOString()}")`;
  if (Array.isArray(val)) return `[${val.map(toMongoValue).join(', ')}]`;
  if (typeof val === 'object') return toMongoFilter(val as Record<string, unknown>);
  return JSON.stringify(val);
}

function toMongoFilter(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).map(([key, val]) => {
    // Handle MongoDB operators like $or, $and, $set, $ne, $in, $gt, etc.
    if (key.startsWith('$')) {
      return `${key}: ${toMongoValue(val)}`;
    }
    return `${JSON.stringify(key)}: ${toMongoValue(val)}`;
  });
  return `{ ${entries.join(', ')} }`;
}

// ─── Collection Operations ───────────────────────────────────────

/** Find one document matching the filter */
export async function findOne(collection: string, filter: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const filterStr = toMongoFilter(filter);
  const result = await query(`db.${collection}.findOne(${filterStr})`);
  return (result.data as Record<string, unknown>) || null;
}

/** Find multiple documents, optionally sorted */
export async function find(
  collection: string,
  filter: Record<string, unknown>,
  options?: { sort?: Record<string, number>; limit?: number }
): Promise<Record<string, unknown>[]> {
  let q = `db.${collection}.find(${toMongoFilter(filter)})`;
  if (options?.sort) q += `.sort(${toMongoFilter(options.sort)})`;
  if (options?.limit) q += `.limit(${options.limit})`;
  const result = await query(q);
  return (result.data as Record<string, unknown>[]) || [];
}

/** Insert one document and return it */
export async function insertOne(collection: string, doc: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Add timestamps if not present
  const now = new Date().toISOString();
  const docWithTimestamps = { ...doc, createdAt: doc.createdAt || now, updatedAt: doc.updatedAt || now };
  const result = await query(`db.${collection}.insertOne(${toMongoFilter(docWithTimestamps)})`);
  return (result.data as Record<string, unknown>) || docWithTimestamps;
}

/** Update one document */
export async function updateOne(
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Ensure $set includes updatedAt
  const updateWithTimestamp = { ...update };
  if (updateWithTimestamp.$set && typeof updateWithTimestamp.$set === 'object') {
    (updateWithTimestamp.$set as Record<string, unknown>).updatedAt = new Date().toISOString();
  }
  const result = await query(`db.${collection}.updateOne(${toMongoFilter(filter)}, ${toMongoFilter(updateWithTimestamp)})`);
  return (result.data as Record<string, unknown>) || {};
}

/** Update many documents */
export async function updateMany(
  collection: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await query(`db.${collection}.updateMany(${toMongoFilter(filter)}, ${toMongoFilter(update)})`);
  return (result.data as Record<string, unknown>) || {};
}

/** Delete many documents matching a filter */
export async function deleteMany(
  collection: string,
  filter: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const result = await query(`db.${collection}.deleteMany(${toMongoFilter(filter)})`);
  return (result.data as Record<string, unknown>) || {};
}

/** Find a document by its _id field */
export async function findById(collection: string, id: string): Promise<Record<string, unknown> | null> {
  const result = await query(`db.${collection}.findOne({ _id: ObjectId("${id}") })`);
  return (result.data as Record<string, unknown>) || null;
}

/** Count documents matching a filter */
export async function countDocuments(collection: string, filter: Record<string, unknown>): Promise<number> {
  const result = await query(`db.${collection}.countDocuments(${toMongoFilter(filter)})`);
  return (result.data as number) || 0;
}

/** Health check — ping ZiuroDB to see if it's reachable */
export async function ping(): Promise<boolean> {
  try {
    if (!isConfigured()) return false;
    await query('db.adminCommand({ ping: 1 })');
    return true;
  } catch {
    return false;
  }
}
