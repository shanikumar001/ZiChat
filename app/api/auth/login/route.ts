import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zichat_secret_key_2026';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { emailOrUsername, password } = body;

    if (!emailOrUsername || !password) {
      return NextResponse.json({ error: 'Please enter email/username and password' }, { status: 400 });
    }

    const query = String(emailOrUsername).trim().toLowerCase();

    // Connect to MongoDB Atlas
    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      const dbUser = await User.findOne({
        $or: [{ email: query }, { username: query }],
      });

      if (!dbUser || !dbUser.password) {
        return NextResponse.json({ error: 'Invalid credentials. User not found.' }, { status: 400 });
      }

      const isMatch = await bcrypt.compare(password, dbUser.password);
      if (!isMatch) {
        return NextResponse.json({ error: 'Invalid credentials. Incorrect password.' }, { status: 400 });
      }

      const token = jwt.sign(
        { id: dbUser._id.toString(), email: dbUser.email, username: dbUser.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return NextResponse.json({
        token,
        user: {
          id: dbUser._id.toString(),
          name: dbUser.name,
          email: dbUser.email,
          username: dbUser.username,
          profilePhoto: dbUser.profilePhoto,
        },
        message: 'Login successful (MongoDB Atlas)',
      });
    }

    // Dev Fallback when DB URI is not connected
    const usernameStr = query.split('@')[0].toLowerCase();
    const mockUser = {
      id: `user_${Date.now()}`,
      name: usernameStr.charAt(0).toUpperCase() + usernameStr.slice(1),
      email: query.includes('@') ? query : `${query}@example.com`,
      username: usernameStr,
      profilePhoto: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(usernameStr)}`,
    };

    const token = jwt.sign({ id: mockUser.id, email: mockUser.email }, JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json({
      token,
      user: mockUser,
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
