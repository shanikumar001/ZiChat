import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import User from '@/models/User';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';

    if (!q) {
      return NextResponse.json([]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const users = await withFallback<any[]>(
      // ZiuroDB: use regex query string
      async () => {
        const result = await ziurodb.query(
          `db.users.find({ $or: [{ name: { $regex: "${q}", $options: "i" } }, { username: { $regex: "${q}", $options: "i" } }, { email: { $regex: "${q}", $options: "i" } }] }).limit(20)`
        );
        return (result.data as Record<string, unknown>[]) || [];
      },
      async () => {
        await connectToDatabase();
        const regex = new RegExp(q, 'i');
        return User.find({
          $or: [{ name: regex }, { username: regex }, { email: regex }],
        })
          .select('_id name username email profilePhoto')
          .limit(20);
      },
      'search:users'
    );

    const formatted = users.map((u: Record<string, unknown>) => ({
      id: (u._id?.toString?.() || u._id || u.id) as string,
      name: u.name,
      username: u.username,
      email: u.email,
      profilePhoto: u.profilePhoto,
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json([]);
  }
}
