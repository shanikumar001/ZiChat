import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';

// In-memory fallback signal store (for ultra-fast serverless signaling)
// In-memory fallback signal store (for ultra-fast serverless signaling)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memorySignals = new Map<string, any[]>();
const SIGNAL_MAX_AGE_MS = 30000; // 30 seconds TTL for WebRTC signals

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, from, event, data } = body;

    if (!to || !event) {
      return NextResponse.json({ error: 'Target user (to) and event required' }, { status: 400 });
    }

    const toStr = to.toString();
    const now = Date.now();
    const signalItem = {
      id: data?.signalId || `sig_${now}_${Math.random().toString(36).substring(2, 7)}`,
      to: toStr,
      from: from ? from.toString() : '',
      event,
      data: data || {},
      createdAt: new Date(now).toISOString(),
    };

    // 1. Store in memory map & clean expired items from memory
    const existing = (memorySignals.get(toStr) || []).filter((item) => {
      const age = now - new Date(item.createdAt).getTime();
      return age < SIGNAL_MAX_AGE_MS;
    });
    existing.push(signalItem);
    // Keep max 20 signals per user
    if (existing.length > 20) existing.shift();
    memorySignals.set(toStr, existing);

    // 2. Persist to ZiuroDB / MongoDB Atlas as fallback
    try {
      await withFallback(
        () => ziurodb.insertOne('signals', signalItem),
        async () => {
          await connectToDatabase();
          const db = (await import('mongoose')).connection.db;
          if (db) {
            await db.collection('signals').insertOne(signalItem);
          }
        },
        'signal:post'
      );
    } catch {
      // Memory store fallback succeeds
    }

    return NextResponse.json({ success: true, signalId: signalItem.id });
  } catch (error) {
    console.error('Signal POST error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const username = searchParams.get('username');

    if (!userId && !username) {
      return NextResponse.json({ signals: [] });
    }

    const userKeys = [
      ...(userId ? [userId.toString()] : []),
      ...(username ? [username.toString()] : []),
    ];

    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fetchedSignals: any[] = [];

    // 1. Fetch from memory store & filter out stale signals
    for (const key of userKeys) {
      const mem = memorySignals.get(key);
      if (mem && mem.length > 0) {
        const validMem = mem.filter((item) => {
          const age = now - new Date(item.createdAt).getTime();
          return age < SIGNAL_MAX_AGE_MS;
        });
        fetchedSignals.push(...validMem);
        memorySignals.delete(key);
      }
    }

    // 2. Fetch from DB if memory was empty
    if (fetchedSignals.length === 0) {
      try {
        const cutoffIso = new Date(now - SIGNAL_MAX_AGE_MS).toISOString();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dbSignals: any[] = await withFallback(
          () => ziurodb.find('signals', { to: { $in: userKeys }, createdAt: { $gte: cutoffIso } }),
          async () => {
            await connectToDatabase();
            const db = (await import('mongoose')).connection.db;
            if (db) {
              return db.collection('signals').find({ to: { $in: userKeys }, createdAt: { $gte: cutoffIso } }).toArray();
            }
            return [];
          },
          'signal:get'
        );

        if (dbSignals && dbSignals.length > 0) {
          fetchedSignals = dbSignals.filter((item) => {
            const age = now - new Date(item.createdAt).getTime();
            return age < SIGNAL_MAX_AGE_MS;
          });

          // Delete consumed or expired signals immediately so they are never returned twice
          try {
            await withFallback(
              () => ziurodb.deleteMany('signals', { to: { $in: userKeys } }),
              async () => {
                await connectToDatabase();
                const db = (await import('mongoose')).connection.db;
                if (db) {
                  await db.collection('signals').deleteMany({ to: { $in: userKeys } });
                }
              },
              'signal:delete'
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // Memory result fallback
      }
    }

    return NextResponse.json({ signals: fetchedSignals });
  } catch (error) {
    console.error('Signal GET error:', error);
    return NextResponse.json({ signals: [] });
  }
}

