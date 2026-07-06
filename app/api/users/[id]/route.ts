import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      let user = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        user = await User.findById(id).select('_id name username email profilePhoto');
      }
      if (!user) {
        user = await User.findOne({
          $or: [{ username: id.toLowerCase() }, { email: id.toLowerCase() }],
        }).select('_id name username email profilePhoto');
      }

      if (user) {
        return NextResponse.json({
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          email: user.email,
          profilePhoto: user.profilePhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.username)}`,
        });
      }
    }

    // Dev fallback if user is not found or DB not connected
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
