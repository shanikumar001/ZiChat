import { NextResponse } from 'next/server';
import { activeUserHeartbeats } from '../heartbeat/route';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userIds } = body;
    const presenceMap: Record<string, boolean> = {};

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({});
    }

    const now = Date.now();
    const ONLINE_THRESHOLD_MS = 25000; // 25 seconds
    const missingDbCheckIds: string[] = [];

    // 1. Check in-memory active heartbeats
    userIds.forEach((id: unknown) => {
      if (!id) return;
      const idStr = id.toString();
      const lastSeen = activeUserHeartbeats.get(idStr);
      if (lastSeen && now - lastSeen < ONLINE_THRESHOLD_MS) {
        presenceMap[idStr] = true;
      } else {
        presenceMap[idStr] = false;
        missingDbCheckIds.push(idStr);
      }
    });

    // 2. Check DB fallback for any user not found in memory map
    if (missingDbCheckIds.length > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbDocs: any[] = await withFallback(
          () => ziurodb.find('presence', { userId: { $in: missingDbCheckIds } }),
          async () => {
            await connectToDatabase();
            const db = (await import('mongoose')).connection.db;
            if (db) {
              return db.collection('presence').find({ userId: { $in: missingDbCheckIds } }).toArray();
            }
            return [];
          },
          'presence:checkDb'
        );

        if (Array.isArray(dbDocs)) {
          dbDocs.forEach((doc) => {
            const id = (doc.userId || doc._id)?.toString();
            const lastSeen = Number(doc.lastSeen) || 0;
            if (id && now - lastSeen < ONLINE_THRESHOLD_MS) {
              presenceMap[id] = true;
            }
          });
        }
      } catch {
        // Ignore DB check error
      }
    }

    return NextResponse.json(presenceMap);
  } catch (error) {
    console.error('Presence check error:', error);
    return NextResponse.json({});
  }
}
