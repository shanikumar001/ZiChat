import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { withFallback } from '@/lib/db';
import * as ziurodb from '@/lib/ziurodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zichat_secret_key_2026';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, username, password } = body;

    if (!name || !email || !username || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if user already exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingUser: any = await withFallback(
      () => ziurodb.findOne('users', {
        $or: [{ email: cleanEmail }, { username: cleanUsername }],
      }),
      async () => {
        await connectToDatabase();
        return User.findOne({
          $or: [{ email: cleanEmail }, { username: cleanUsername }],
        });
      },
      'signup:checkExisting'
    );

    if (existingUser) {
      return NextResponse.json({ error: 'User with this email or username already exists' }, { status: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const profilePhoto = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`;

    // Create new user
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newUser: any = await withFallback(
      () => ziurodb.insertOne('users', {
        name: cleanName,
        email: cleanEmail,
        username: cleanUsername,
        password: hashedPassword,
        bio: '',
        profilePhoto,
      }),
      async () => {
        await connectToDatabase();
        return User.create({
          name: cleanName,
          email: cleanEmail,
          username: cleanUsername,
          password: hashedPassword,
          profilePhoto,
        });
      },
      'signup:createUser'
    );

    const userId = (newUser._id?.toString?.() || newUser._id || newUser.id) as string;
    const token = jwt.sign(
      { id: userId, email: cleanEmail, username: cleanUsername },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      token,
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        username: cleanUsername,
        profilePhoto: newUser.profilePhoto || profilePhoto,
      },
      message: 'Signup successful',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
