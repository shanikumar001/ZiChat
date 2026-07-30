import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import Group from '@/models/Group';
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
      return NextResponse.json([]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = await withFallback<any[]>(
      () => ziurodb.find('groups', { members: currentUserId }, { sort: { updatedAt: -1 } }),
      async () => {
        await connectToDatabase();
        return Group.find({ members: currentUserId }).sort({ updatedAt: -1 });
      },
      'groups:list'
    );

    const formatted = groups.map((g: Record<string, unknown>) => {
      const gId = (g._id?.toString?.() || g._id || g.id) as string;
      const members = (g.members as string[]) || [];
      const createdAt = g.createdAt instanceof Date ? g.createdAt.toISOString() : g.createdAt as string;
      return {
        id: gId,
        name: g.name,
        description: (g.description as string) || '',
        icon: (g.icon as string) || '',
        isGroup: true,
        creatorId: g.creatorId,
        memberCount: members.length,
        members,
        createdAt,
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error('Groups GET error:', error);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const currentUserId = getUserIdFromAuthHeader(req);
    if (!currentUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, icon, memberIds } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    const membersSet = new Set<string>([currentUserId, ...(Array.isArray(memberIds) ? memberIds : [])]);
    const membersList = Array.from(membersSet);

    const groupDoc = {
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon || '',
      creatorId: currentUserId,
      members: membersList,
      adminIds: [currentUserId],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newGroup: any = await withFallback(
      () => ziurodb.insertOne('groups', groupDoc),
      async () => {
        await connectToDatabase();
        return Group.create(groupDoc);
      },
      'groups:create'
    );

    const gId = (newGroup._id?.toString?.() || newGroup._id || newGroup.id) as string;
    const createdAt = newGroup.createdAt instanceof Date ? newGroup.createdAt.toISOString() : newGroup.createdAt || new Date().toISOString();

    return NextResponse.json({
      id: gId,
      name: newGroup.name || name.trim(),
      description: newGroup.description || description?.trim() || '',
      icon: newGroup.icon || icon || '',
      isGroup: true,
      creatorId: currentUserId,
      memberCount: membersList.length,
      members: membersList,
      createdAt,
    });
  } catch (error) {
    console.error('Groups POST error:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
