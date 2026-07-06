import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
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

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      // 1. Direct 1-on-1 Messages
      const directMessages = await Message.find({
        $or: [{ senderId: currentUserId }, { receiverId: currentUserId }],
        groupId: { $in: ['', null] },
      }).sort({ createdAt: -1 });

      const conversationMap = new Map<string, {
        id: string;
        lastMessage: { text: string; createdAt: string; isMe: boolean };
        unreadCount: number;
      }>();

      for (const msg of directMessages) {
        const otherUserId = msg.senderId === currentUserId ? msg.receiverId : msg.senderId;
        if (!otherUserId) continue;
        if (!conversationMap.has(otherUserId)) {
          conversationMap.set(otherUserId, {
            id: otherUserId,
            lastMessage: {
              text: msg.text || (msg.mediaUrl ? '📷 Attachment' : ''),
              createdAt: msg.createdAt.toISOString(),
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
          let userObj = null;
          if (mongoose.Types.ObjectId.isValid(conv.id)) {
            userObj = await User.findById(conv.id).select('_id name username profilePhoto email');
          }
          if (!userObj) {
            userObj = await User.findOne({
              $or: [{ username: conv.id.toLowerCase() }, { email: conv.id.toLowerCase() }],
            }).select('_id name username profilePhoto email');
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
      const userGroups = await Group.find({ members: currentUserId }).sort({ updatedAt: -1 });

      const groupList = await Promise.all(
        userGroups.map(async (g) => {
          const groupMsgs = await Message.find({ groupId: g._id.toString() }).sort({ createdAt: -1 }).limit(1);
          const lastMsg = groupMsgs[0];

          return {
            id: g._id.toString(),
            name: g.name,
            username: `group_${g.members.length}_members`,
            description: g.description || '',
            profilePhoto: g.icon || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(g.name)}`,
            isGroup: true,
            memberCount: g.members.length,
            unreadCount: 0,
            lastMessage: lastMsg
              ? {
                  text: lastMsg.text || (lastMsg.mediaUrl ? '📷 Attachment' : ''),
                  createdAt: lastMsg.createdAt.toISOString(),
                  isMe: lastMsg.senderId === currentUserId,
                }
              : {
                  text: 'Group created',
                  createdAt: g.createdAt.toISOString(),
                  isMe: false,
                },
          };
        })
      );

      // Combine direct & group conversations
      const combinedList = [...directList, ...groupList];

      // Sort by newest message timestamp
      combinedList.sort((a, b) => {
        const dateA = new Date(a.lastMessage.createdAt).getTime();
        const dateB = new Date(b.lastMessage.createdAt).getTime();
        return dateB - dateA;
      });

      return NextResponse.json(combinedList);
    }

    // Fallback data
    return NextResponse.json([]);
  } catch (error) {
    console.error('Conversations GET error:', error);
    return NextResponse.json([]);
  }
}
