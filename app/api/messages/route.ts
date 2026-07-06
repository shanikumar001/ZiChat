import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Message from '@/models/Message';
import User from '@/models/User';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

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

const mockMessagesStore: Record<string, Array<{ id: string; text: string; isMe: boolean; createdAt: string; status: string; mediaUrl?: string; mediaType?: string; fileName?: string; fileSize?: number; senderName?: string; senderPhoto?: string }>> = {};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const withUserId = searchParams.get('with');
    const groupId = searchParams.get('groupId');
    const currentUserId = getUserIdFromAuthHeader(req) || 'current_user';

    if (!withUserId && !groupId) {
      return NextResponse.json([]);
    }

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      if (groupId) {
        // Group Messages
        const messages = await Message.find({ groupId }).sort({ createdAt: 1 });
        const senderIds = Array.from(new Set(messages.map((m) => m.senderId)));
        const users = await User.find({ _id: { $in: senderIds } }).select('_id name username profilePhoto');
        const userMap = new Map(users.map((u) => [u._id.toString(), u]));

        const formatted = messages.map((m) => {
          const sender = userMap.get(m.senderId);
          return {
            id: m._id.toString(),
            senderId: m.senderId,
            senderName: sender?.name || 'User',
            senderUsername: sender?.username || '',
            senderPhoto: sender?.profilePhoto || '',
            text: m.text,
            mediaUrl: m.mediaUrl,
            mediaType: m.mediaType,
            fileName: m.fileName,
            fileSize: m.fileSize,
            messageType: m.mediaUrl ? 'media' : 'text',
            isMe: m.senderId === currentUserId,
            createdAt: m.createdAt.toISOString(),
            status: m.status || 'delivered',
          };
        });

        return NextResponse.json(formatted);
      }

      // 1-on-1 Messages
      await Message.updateMany(
        { senderId: withUserId, receiverId: currentUserId, status: { $ne: 'seen' } },
        { $set: { status: 'seen' } }
      );

      await Message.updateMany(
        { senderId: currentUserId, receiverId: withUserId, status: 'sent' },
        { $set: { status: 'delivered' } }
      );

      const messages = await Message.find({
        $or: [
          { senderId: currentUserId, receiverId: withUserId },
          { senderId: withUserId, receiverId: currentUserId },
        ],
      }).sort({ createdAt: 1 });

      const formatted = messages.map((m) => ({
        id: m._id.toString(),
        text: m.text,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        fileName: m.fileName,
        fileSize: m.fileSize,
        messageType: m.mediaUrl ? 'media' : 'text',
        isMe: m.senderId === currentUserId,
        createdAt: m.createdAt.toISOString(),
        status: m.status || 'delivered',
      }));

      return NextResponse.json(formatted);
    }

    const key = groupId || withUserId || 'default';
    if (!mockMessagesStore[key]) {
      mockMessagesStore[key] = [];
    }

    return NextResponse.json(mockMessagesStore[key]);
  } catch (error) {
    console.error('Messages GET error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { toUserId, groupId, text, mediaUrl, mediaType, fileName, fileSize } = body;
    const currentUserId = getUserIdFromAuthHeader(req) || 'current_user';

    if (!toUserId && !groupId) {
      return NextResponse.json({ error: 'toUserId or groupId required' }, { status: 400 });
    }

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      let senderUser = null;
      if (mongoose.Types.ObjectId.isValid(currentUserId)) {
        senderUser = await User.findById(currentUserId).select('name username profilePhoto');
      }

      const newMsg = await Message.create({
        senderId: currentUserId,
        receiverId: toUserId || groupId || '',
        groupId: groupId || '',
        text: text || '',
        mediaUrl: mediaUrl || '',
        mediaType: mediaType || '',
        fileName: fileName || '',
        fileSize: fileSize || 0,
        status: 'delivered',
      });

      return NextResponse.json({
        id: newMsg._id.toString(),
        senderId: currentUserId,
        senderName: senderUser?.name || 'You',
        senderUsername: senderUser?.username || '',
        senderPhoto: senderUser?.profilePhoto || '',
        text: newMsg.text,
        mediaUrl: newMsg.mediaUrl,
        mediaType: newMsg.mediaType,
        fileName: newMsg.fileName,
        fileSize: newMsg.fileSize,
        messageType: newMsg.mediaUrl ? 'media' : 'text',
        isMe: true,
        createdAt: newMsg.createdAt.toISOString(),
        status: newMsg.status,
      });
    }

    const key = groupId || toUserId || 'default';
    if (!mockMessagesStore[key]) {
      mockMessagesStore[key] = [];
    }

    const newMsgObj = {
      id: `msg_${Date.now()}`,
      senderId: currentUserId,
      senderName: 'You',
      text: text || '',
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || '',
      fileName: fileName || '',
      fileSize: fileSize || 0,
      messageType: mediaUrl ? 'media' : 'text',
      isMe: true,
      createdAt: new Date().toISOString(),
      status: 'delivered',
    };

    mockMessagesStore[key].push(newMsgObj);

    return NextResponse.json(newMsgObj);
  } catch (error) {
    console.error('Messages POST error:', error);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
