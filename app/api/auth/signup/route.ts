import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zichat_secret_key_2026';

// In-memory fallback if MongoDB Atlas is not yet connected
const fallbackUsers: Array<{ id: string; name: string; email: string; username: string; password?: string }> = [];

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

    // Connect to MongoDB Atlas
    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      // MongoDB Atlas signup
      const existingUser = await User.findOne({
        $or: [{ email: cleanEmail }, { username: cleanUsername }],
      });

      if (existingUser) {
        return NextResponse.json({ error: 'User with this email or username already exists' }, { status: 400 });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const profilePhoto = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`;

      const newUser = await User.create({
        name: cleanName,
        email: cleanEmail,
        username: cleanUsername,
        password: hashedPassword,
        profilePhoto,
      });

      const token = jwt.sign(
        { id: newUser._id.toString(), email: newUser.email, username: newUser.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return NextResponse.json({
        token,
        user: {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          username: newUser.username,
          profilePhoto: newUser.profilePhoto,
        },
        message: 'Signup successful (MongoDB Atlas)',
      });
    }

    // Dev Fallback when MONGODB_URI is not connected
    const existing = fallbackUsers.find(u => u.email === cleanEmail || u.username === cleanUsername);
    if (existing) {
      return NextResponse.json({ error: 'User with this email or username already exists' }, { status: 400 });
    }

    const newUserObj = {
      id: `user_${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      username: cleanUsername,
      profilePhoto: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanUsername)}`,
    };

    fallbackUsers.push({ ...newUserObj, password });
    const token = jwt.sign({ id: newUserObj.id, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });

    return NextResponse.json({
      token,
      user: newUserObj,
      message: 'Signup successful',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
