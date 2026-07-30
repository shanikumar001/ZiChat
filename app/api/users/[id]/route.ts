import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: any = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      user = await withFallback(
        () => ziurodb.findById('users', id),
        async () => {
          await connectToDatabase();
          return User.findById(id).select('_id name username email profilePhoto');
        },
        'userLookup:byId'
      );
    }

    if (!user) {
      user = await withFallback(
        () => ziurodb.findOne('users', {
          $or: [{ username: id.toLowerCase() }, { email: id.toLowerCase() }],
        }),
        async () => {
          await connectToDatabase();
          return User.findOne({
            $or: [{ username: id.toLowerCase() }, { email: id.toLowerCase() }],
          }).select('_id name username email profilePhoto');
        },
        'userLookup:byName'
      );
    }

    if (user) {
      const userId = (user._id?.toString?.() || user._id || user.id) as string;
      return NextResponse.json({
        id: userId,
        name: user.name,
        username: user.username,
        email: user.email,
        profilePhoto: user.profilePhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username)}`,
      });
    }

    // Fallback if user is not found
    const cleanId = id.replace(/^user_/, '');
    const displayName = cleanId.length > 15 ? `User (${cleanId.slice(0, 6)}...)` : cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
    const displayUsername = cleanId.length > 15 ? `user_${cleanId.slice(0, 6)}` : cleanId;

    return NextResponse.json({
      id,
      name: displayName,
      username: displayUsername,
      email: `${displayUsername}@example.com`,
      profilePhoto: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayUsername)}`,
    });
  } catch (error) {
    console.error('User lookup error:', error);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
}
