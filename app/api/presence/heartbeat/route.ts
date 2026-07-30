import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';

// In-memory presence map for ultra-fast active user tracking
export const activeUserHeartbeats = new Map<string, number>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const userIdStr = userId.toString();
    const now = Date.now();

    // 1. Update memory presence map
    activeUserHeartbeats.set(userIdStr, now);

    // 2. Persist presence to DB as fallback
    try {
      await withFallback(
        () => ziurodb.updateOne('presence', { userId: userIdStr }, { $set: { userId: userIdStr, lastSeen: now } }),
        async () => {
          await connectToDatabase();
          const db = (await import('mongoose')).connection.db;
          if (db) {
            await db.collection('presence').updateOne(
              { userId: userIdStr },
              { $set: { userId: userIdStr, lastSeen: now } },
              { upsert: true }
            );
          }
        },
        'presence:heartbeat'
      );
    } catch {
      // Memory presence succeeds
    }

    return NextResponse.json({ success: true, timestamp: now });
  } catch (error) {
    console.error('Presence heartbeat error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
