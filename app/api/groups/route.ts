import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Group from '@/models/Group';
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
      return NextResponse.json([]);
    }

    await connectToDatabase();
    const groups = await Group.find({ members: currentUserId }).sort({ updatedAt: -1 });

    const formatted = groups.map((g) => ({
      id: g._id.toString(),
      name: g.name,
      description: g.description || '',
      icon: g.icon || '',
      isGroup: true,
      creatorId: g.creatorId,
      memberCount: g.members.length,
      members: g.members,
      createdAt: g.createdAt.toISOString(),
    }));

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

    await connectToDatabase();

    // Combine current user ID with selected member IDs
    const membersSet = new Set<string>([currentUserId, ...(Array.isArray(memberIds) ? memberIds : [])]);
    const membersList = Array.from(membersSet);

    const newGroup = await Group.create({
      name: name.trim(),
      description: description?.trim() || '',
      icon: icon || '',
      creatorId: currentUserId,
      members: membersList,
      adminIds: [currentUserId],
    });

    return NextResponse.json({
      id: newGroup._id.toString(),
      name: newGroup.name,
      description: newGroup.description,
      icon: newGroup.icon,
      isGroup: true,
      creatorId: newGroup.creatorId,
      memberCount: newGroup.members.length,
      members: newGroup.members,
      createdAt: newGroup.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Groups POST error:', error);
    return NextResponse.json({ error: 'Failed to create group' }, { status: 500 });
  }
}
