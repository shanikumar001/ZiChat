import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Message from '@/models/Message';
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { with: withUserId } = body;
    const currentUserId = getUserIdFromAuthHeader(req) || 'current_user';

    if (!withUserId) {
      return NextResponse.json({ success: false, message: 'withUserId is required' }, { status: 400 });
    }

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      // Mark all messages from withUserId to currentUserId as 'seen'
      await Message.updateMany(
        { senderId: withUserId, receiverId: currentUserId, status: { $ne: 'seen' } },
        { $set: { status: 'seen' } }
      );
    }

    return NextResponse.json({ success: true, message: 'Messages marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
