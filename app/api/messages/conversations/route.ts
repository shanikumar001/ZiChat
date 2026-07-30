import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import Message from '@/models/Message';
import User from '@/models/User';
import Group from '@/models/Group';
import mongoose from 'mongoose';
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
    const currentUserId = getUserIdFromAuthHeader(req) || 'current_user';

    // 1. Direct 1-on-1 Messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const directMessages = await withFallback<any[]>(
      () => ziurodb.find('messages', {
        $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
        groupId: { $in: ['', null] },
      }, { sort: { createdAt: -1 } }),
      async () => {
        await connectToDatabase();
        return Message.find({
          $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
          groupId: { $in: ['', null] },
        }).sort({ createdAt: -1 });
      },
      'conversations:getDirectMessages'
    );

    const conversationMap = new Map<string, {
      id: string;
      lastMessage: { text: string; createdAt: string; isMe: boolean };
      unreadCount: number;
    }>();

    for (const msg of directMessages) {
      const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
      if (!otherUserId) continue;
      const createdAt = msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt as string;
      if (!conversationMap.has(otherUserId)) {
        conversationMap.set(otherUserId, {
          id: otherUserId,
          lastMessage: {
            text: msg.text || (msg.mediaUrl ? '📷 Attachment' : ''),
            createdAt,
            isMe: msg.senderId === currentUserId,
          },
          unreadCount: (msg.receiverId === currentUserId && msg.status !== 'seen') ? 1 : 0,
        });
      } else if (msg.receiverId === currentUserId && msg.status !== 'seen') {
        const item = conversationMap.get(otherUserId)!;
        item.unreadCount += 1;
      }
    }

    // Fetch user details for direct conversations
    const directList = await Promise.all(
      Array.from(conversationMap.values()).map(async (conv) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let userObj: any = null;

        if (mongoose.Types.ObjectId.isValid(conv.id)) {
          userObj = await withFallback(
            () => ziurodb.findById('users', conv.id),
            async () => {
              await connectToDatabase();
              return User.findById(conv.id).select('_id name username profilePhoto email');
            },
            'conversations:getUserById'
          );
        }

        if (!userObj) {
          userObj = await withFallback(
            () => ziurodb.findOne('users', {
              $or: [{ username: conv.id.toLowerCase() }, { email: conv.id.toLowerCase() }],
            }),
            async () => {
              await connectToDatabase();
              return User.findOne({
                $or: [{ username: conv.id.toLowerCase() }, { email: conv.id.toLowerCase() }],
              }).select('_id name username profilePhoto email');
            },
            'conversations:getUserByName'
          );
        }

        const name = userObj ? userObj.name : conv.id.replace(/^user_/, '');
        const username = userObj ? userObj.username : conv.id.replace(/^user_/, '');
        const profilePhoto = userObj?.profilePhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`;

        return {
          id: conv.id,
          name,
          username,
          profilePhoto,
          isGroup: false,
          unreadCount: conv.unreadCount,
          lastMessage: conv.lastMessage,
        };
      })
    );

    // 2. Group Conversations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userGroups = await withFallback<any[]>(
      () => ziurodb.find('groups', { members: currentUserId }, { sort: { updatedAt: -1 } }),
      async () => {
        await connectToDatabase();
        return Group.find({ members: currentUserId }).sort({ updatedAt: -1 });
      },
      'conversations:getGroups'
    );

    const groupList = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userGroups.map(async (g: any) => {
        const gId = g._id?.toString?.() || g._id || g.id;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupMsgs = await withFallback<any[]>(
          () => ziurodb.find('messages', { groupId: gId }, { sort: { createdAt: -1 }, limit: 1 }),
          async () => {
            await connectToDatabase();
            return Message.find({ groupId: gId }).sort({ createdAt: -1 }).limit(1);
          },
          'conversations:getGroupLastMsg'
        );

        const lastMsg = groupMsgs[0];
        const gCreatedAt = g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt as string;

        return {
          id: gId,
          name: g.name,
          username: `group_${g.members?.length || 0}_members`,
          description: g.description || '',
          profilePhoto: g.icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(g.name)}`,
          isGroup: true,
          memberCount: g.members?.length || 0,
          unreadCount: 0,
          lastMessage: lastMsg
            ? {
                text: lastMsg.text || (lastMsg.mediaUrl ? '📷 Attachment' : ''),
                createdAt: lastMsg.createdAt instanceof Date ? lastMsg.createdAt.toISOString() : lastMsg.createdAt,
                isMe: lastMsg.senderId === currentUserId,
              }
            : {
                text: 'Group created',
                createdAt: gCreatedAt,
                isMe: false,
              },
        };
      })
    );

    // Combine and sort
    const combinedList = [...directList, ...groupList];
    combinedList.sort((a, b) => {
      const dateA = new Date(a.lastMessage.createdAt).getTime();
      const dateB = new Date(b.lastMessage.createdAt).getTime();
      return dateB - dateA;
    });

    return NextResponse.json(combinedList);
  } catch (error) {
    console.error('Conversations GET error:', error);
    return NextResponse.json([]);
  }
}
