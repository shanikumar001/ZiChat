import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = await withFallback(
      () => ziurodb.findById('users', currentUserId),
      async () => {
        await connectToDatabase();
        return User.findById(currentUserId).select('_id name username email bio profilePhoto');
      },
      'profile:get'
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: (user._id?.toString?.() || user._id || user.id) as string,
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

    // Check if username is taken by another user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any = await withFallback(
      async () => {
        const result = await ziurodb.query(
          `db.users.findOne({ username: "${trimmedUsername}", _id: { $ne: ObjectId("${currentUserId}") } })`
        );
        return result.data;
      },
      async () => {
        await connectToDatabase();
        return User.findOne({
          username: trimmedUsername,
          _id: { $ne: currentUserId },
        });
      },
      'profile:checkUsername'
    );

    if (existing) {
      return NextResponse.json({ error: 'Username is already taken by another user' }, { status: 400 });
    }

    // Update user profile
    const updateFields: Record<string, unknown> = {
      name: trimmedName,
      username: trimmedUsername,
      bio: trimmedBio,
    };
    if (profilePhoto !== undefined) {
      updateFields.profilePhoto = profilePhoto;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedUser: any = await withFallback(
      async () => {
        await ziurodb.updateOne('users',
          { _id: `ObjectId("${currentUserId}")` },
          { $set: updateFields }
        );
        // Re-fetch to return the updated user
        return ziurodb.findById('users', currentUserId);
      },
      async () => {
        await connectToDatabase();
        return User.findByIdAndUpdate(
          currentUserId,
          { $set: updateFields },
          { new: true }
        ).select('_id name username email bio profilePhoto');
      },
      'profile:update'
    );

    if (!updatedUser) {
      return NextResponse.json({ error: 'User update failed' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: (updatedUser._id?.toString?.() || updatedUser._id || updatedUser.id) as string,
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
