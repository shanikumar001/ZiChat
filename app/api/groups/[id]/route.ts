import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import Group from '@/models/Group';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Group ID' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const group: any = await withFallback(
      () => ziurodb.findById('groups', id),
      async () => {
        await connectToDatabase();
        return Group.findById(id);
      },
      'groupDetail:get'
    );

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const members = (group.members as string[]) || [];

    // Fetch member details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memberObjects = await withFallback<any[]>(
      () => ziurodb.find('users', { _id: { $in: members } }),
      async () => {
        await connectToDatabase();
        return User.find({ _id: { $in: members } }).select('_id name username profilePhoto email');
      },
      'groupDetail:getMembers'
    );

    const gId = (group._id?.toString?.() || group._id || group.id) as string;
    const createdAt = group.createdAt instanceof Date ? group.createdAt.toISOString() : group.createdAt as string;

    return NextResponse.json({
      id: gId,
      name: group.name,
      description: group.description || '',
      icon: group.icon || '',
      isGroup: true,
      creatorId: group.creatorId,
      memberCount: members.length,
      members: memberObjects.map((u: Record<string, unknown>) => ({
        id: (u._id?.toString?.() || u._id || u.id) as string,
        name: u.name,
        username: u.username,
        profilePhoto: u.profilePhoto,
        email: u.email,
      })),
      createdAt,
    });
  } catch (error) {
    console.error('Group detail GET error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, icon } = body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Group ID' }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = {};
    if (name && name.trim()) updateFields.name = name.trim();
    if (description !== undefined) updateFields.description = description.trim();
    if (icon !== undefined) updateFields.icon = icon;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedGroup: any = await withFallback(
      async () => {
        await ziurodb.updateOne('groups', { _id: `ObjectId("${id}")` }, { $set: updateFields });
        return ziurodb.findById('groups', id);
      },
      async () => {
        await connectToDatabase();
        const group = await Group.findById(id);
        if (!group) return null;
        if (updateFields.name) group.name = updateFields.name as string;
        if (updateFields.description !== undefined) group.description = updateFields.description as string;
        if (updateFields.icon !== undefined) group.icon = updateFields.icon as string;
        await group.save();
        return group;
      },
      'groupDetail:update'
    );

    if (!updatedGroup) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    const gId = (updatedGroup._id?.toString?.() || updatedGroup._id || updatedGroup.id) as string;
    const members = (updatedGroup.members as string[]) || [];
    const createdAt = updatedGroup.createdAt instanceof Date ? updatedGroup.createdAt.toISOString() : updatedGroup.createdAt as string;

    return NextResponse.json({
      id: gId,
      name: updatedGroup.name,
      description: updatedGroup.description || '',
      icon: updatedGroup.icon || '',
      isGroup: true,
      creatorId: updatedGroup.creatorId,
      memberCount: members.length,
      createdAt,
    });
  } catch (error) {
    console.error('Group PUT error:', error);
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}
