import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const withUserId = searchParams.get('with');
    const groupId = searchParams.get('groupId');
    const currentUserId = getUserIdFromAuthHeader(req) || 'current_user';

    if (!withUserId && !groupId) {
      return NextResponse.json([]);
    }

    if (groupId) {
      // Group Messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = await withFallback<any[]>(
        () => ziurodb.find('messages', { groupId }, { sort: { createdAt: 1 } }),
        async () => {
          await connectToDatabase();
          return Message.find({ groupId }).sort({ createdAt: 1 });
        },
        'messages:getGroup'
      );

      const senderIds = Array.from(new Set(messages.map((m: Record<string, unknown>) => m.senderId as string)));
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const users = await withFallback<any[]>(
        () => ziurodb.find('users', { _id: { $in: senderIds } }),
        async () => {
          await connectToDatabase();
          return User.find({ _id: { $in: senderIds } }).select('_id name username profilePhoto');
        },
        'messages:getSenders'
      );

      const userMap = new Map(users.map((u: Record<string, unknown>) => {
        const id = (u._id?.toString?.() || u._id || u.id) as string;
        return [id, u];
      }));

      const formatted = messages.map((m: Record<string, unknown>) => {
        const sender = userMap.get(m.senderId as string) as Record<string, unknown> | undefined;
        const msgId = (m._id?.toString?.() || m._id || m.id) as string;
        const createdAt = m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt as string;
        return {
          id: msgId,
          senderId: m.senderId,
          senderName: (sender?.name as string) || 'User',
          senderUsername: (sender?.username as string) || '',
          senderPhoto: (sender?.profilePhoto as string) || '',
          text: m.text,
          mediaUrl: m.mediaUrl,
          mediaType: m.mediaType,
          fileName: m.fileName,
          fileSize: m.fileSize,
          messageType: m.mediaUrl ? 'media' : 'text',
          isMe: m.senderId === currentUserId,
          createdAt,
          status: (m.status as string) || 'delivered',
        };
      });

      return NextResponse.json(formatted);
    }

    // 1-on-1 Messages — mark as seen/delivered
    await withFallback(
      () => ziurodb.updateMany('messages',
        { senderId: withUserId, receiverId: currentUserId, status: { $ne: 'seen' } },
        { $set: { status: 'seen' } }
      ),
      async () => {
        await connectToDatabase();
        return Message.updateMany(
          { senderId: withUserId, receiverId: currentUserId, status: { $ne: 'seen' } },
          { $set: { status: 'seen' } }
        );
      },
      'messages:markSeen'
    );

    await withFallback(
      () => ziurodb.updateMany('messages',
        { senderId: currentUserId, receiverId: withUserId, status: 'sent' },
        { $set: { status: 'delivered' } }
      ),
      async () => {
        await connectToDatabase();
        return Message.updateMany(
          { senderId: currentUserId, receiverId: withUserId, status: 'sent' },
          { $set: { status: 'delivered' } }
        );
      },
      'messages:markDelivered'
    );

    // Fetch conversation messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages = await withFallback<any[]>(
      () => ziurodb.find('messages', {
        $or: [
          { senderId: currentUserId, receiverId: withUserId },
          { senderId: withUserId, receiverId: currentUserId },
        ],
      }, { sort: { createdAt: 1 } }),
      async () => {
        await connectToDatabase();
        return Message.find({
          $or: [
            { senderId: currentUserId, receiverId: withUserId },
            { senderId: withUserId, receiverId: currentUserId },
          ],
        }).sort({ createdAt: 1 });
      },
      'messages:getConversation'
    );

    const formatted = messages.map((m: Record<string, unknown>) => {
      const msgId = (m._id?.toString?.() || m._id || m.id) as string;
      const createdAt = m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt as string;
      return {
        id: msgId,
        text: m.text,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        fileName: m.fileName,
        fileSize: m.fileSize,
        messageType: m.mediaUrl ? 'media' : 'text',
        isMe: m.senderId === currentUserId,
        createdAt,
        status: (m.status as string) || 'delivered',
      };
    });

    return NextResponse.json(formatted);
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

    // Get sender info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let senderUser: any = null;
    if (mongoose.Types.ObjectId.isValid(currentUserId)) {
      senderUser = await withFallback(
        () => ziurodb.findById('users', currentUserId),
        async () => {
          await connectToDatabase();
          return User.findById(currentUserId).select('name username profilePhoto');
        },
        'messages:getSender'
      );
    }

    const msgDoc = {
      senderId: currentUserId,
      receiverId: toUserId || groupId || '',
      groupId: groupId || '',
      text: text || '',
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || '',
      fileName: fileName || '',
      fileSize: fileSize || 0,
      status: 'delivered' as const,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newMsg: any = await withFallback(
      () => ziurodb.insertOne('messages', msgDoc),
      async () => {
        await connectToDatabase();
        return Message.create(msgDoc);
      },
      'messages:create'
    );

    const msgId = newMsg._id?.toString?.() || newMsg._id || newMsg.id || `msg_${Date.now()}`;
    const createdAt = newMsg.createdAt instanceof Date ? newMsg.createdAt.toISOString() : newMsg.createdAt || new Date().toISOString();

    return NextResponse.json({
      id: msgId,
      senderId: currentUserId,
      senderName: senderUser?.name || 'You',
      senderUsername: senderUser?.username || '',
      senderPhoto: senderUser?.profilePhoto || '',
      text: newMsg.text || text || '',
      mediaUrl: newMsg.mediaUrl || mediaUrl || '',
      mediaType: newMsg.mediaType || mediaType || '',
      fileName: newMsg.fileName || fileName || '',
      fileSize: newMsg.fileSize || fileSize || 0,
      messageType: (newMsg.mediaUrl || mediaUrl) ? 'media' : 'text',
      isMe: true,
      createdAt,
      status: newMsg.status || 'delivered',
    });
  } catch (error) {
    console.error('Messages POST error:', error);
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }
}
