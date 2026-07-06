import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Group from '@/models/Group';
import User from '@/models/User';
import mongoose from 'mongoose';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    await connectToDatabase();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Group ID' }, { status: 400 });
    }

    const group = await Group.findById(id);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Fetch details of all members
    const memberObjects = await User.find({ _id: { $in: group.members } }).select('_id name username profilePhoto email');

    return NextResponse.json({
      id: group._id.toString(),
      name: group.name,
      description: group.description || '',
      icon: group.icon || '',
      isGroup: true,
      creatorId: group.creatorId,
      memberCount: group.members.length,
      members: memberObjects.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        username: u.username,
        profilePhoto: u.profilePhoto,
        email: u.email,
      })),
      createdAt: group.createdAt.toISOString(),
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

    await connectToDatabase();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid Group ID' }, { status: 400 });
    }

    const group = await Group.findById(id);
    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    if (name && name.trim()) group.name = name.trim();
    if (description !== undefined) group.description = description.trim();
    if (icon !== undefined) group.icon = icon;

    await group.save();

    return NextResponse.json({
      id: group._id.toString(),
      name: group.name,
      description: group.description || '',
      icon: group.icon || '',
      isGroup: true,
      creatorId: group.creatorId,
      memberCount: group.members.length,
      createdAt: group.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Group PUT error:', error);
    return NextResponse.json({ error: 'Failed to update group' }, { status: 500 });
  }
}
