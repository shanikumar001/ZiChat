import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zichat_secret_key_2026';

function getUserIdFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    return decoded.id;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const currentUserId = getUserIdFromAuthHeader(req);
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();
    const user = await User.findById(currentUserId).select('_id name username email bio profilePhoto');

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user._id.toString(),
      name: user.name,
      username: user.username,
      email: user.email,
      bio: user.bio || '',
      profilePhoto: user.profilePhoto || '',
    });
  } catch (error) {
    console.error('GET profile error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const currentUserId = getUserIdFromAuthHeader(req);
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, username, bio, profilePhoto } = body;

    const trimmedName = name?.trim();
    const trimmedUsername = username?.trim().toLowerCase();
    const trimmedBio = bio?.trim() || '';

    if (!trimmedName || !trimmedUsername) {
      return NextResponse.json({ error: 'Name and Username are required' }, { status: 400 });
    }

    if (trimmedUsername.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }

    await connectToDatabase();

    // Check if username is taken by another user
    const existing = await User.findOne({
      username: trimmedUsername,
      _id: { $ne: currentUserId },
    });

    if (existing) {
      return NextResponse.json({ error: 'Username is already taken by another user' }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
      currentUserId,
      {
        $set: {
          name: trimmedName,
          username: trimmedUsername,
          bio: trimmedBio,
          ...(profilePhoto !== undefined ? { profilePhoto } : {}),
        },
      },
      { new: true }
    ).select('_id name username email bio profilePhoto');

    if (!updatedUser) {
      return NextResponse.json({ error: 'User update failed' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        username: updatedUser.username,
        email: updatedUser.email,
        bio: updatedUser.bio || '',
        profilePhoto: updatedUser.profilePhoto || '',
      },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('PUT profile error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
