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
    const { email, displayName, photoURL, uid } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required for Firebase login' }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const baseUsername = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
    const cleanName = displayName?.trim() || baseUsername;

    // 1. Find user by email or username
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbUser: any = await withFallback(
      () => ziurodb.findOne('users', {
        $or: [{ email: cleanEmail }, { username: baseUsername }],
      }),
      async () => {
        await connectToDatabase();
        return User.findOne({
          $or: [{ email: cleanEmail }, { username: baseUsername }],
        });
      },
      'firebaseAuth:findUser'
    );

    if (!dbUser) {
      // Create new user for Google/Firebase auth
      let finalUsername = baseUsername;

      // Ensure username uniqueness
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usernameCheck: any = await withFallback(
        () => ziurodb.findOne('users', { username: finalUsername }),
        async () => {
          await connectToDatabase();
          return User.findOne({ username: finalUsername });
        },
        'firebaseAuth:checkUsername'
      );

      if (usernameCheck) {
        finalUsername = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(uid || `firebase_${Date.now()}`, salt);
      const profilePhoto = photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(finalUsername)}`;

      dbUser = await withFallback(
        () => ziurodb.insertOne('users', {
          name: cleanName,
          email: cleanEmail,
          username: finalUsername,
          password: hashedPassword,
          bio: 'Hey there! I am using ZiChat',
          profilePhoto,
        }),
        async () => {
          await connectToDatabase();
          return User.create({
            name: cleanName,
            email: cleanEmail,
            username: finalUsername,
            password: hashedPassword,
            bio: 'Hey there! I am using ZiChat',
            profilePhoto,
          });
        },
        'firebaseAuth:createUser'
      );
    } else {
      // Sync profile photo if provided and user doesn't have one
      if (photoURL && (!dbUser.profilePhoto || dbUser.profilePhoto.includes('dicebear'))) {
        await withFallback(
          () => ziurodb.updateOne('users', { email: cleanEmail }, { $set: { profilePhoto: photoURL } }),
          async () => {
            await connectToDatabase();
            const u = await User.findOne({ email: cleanEmail });
            if (u) {
              u.profilePhoto = photoURL;
              await u.save();
            }
          },
          'firebaseAuth:syncPhoto'
        );
        dbUser.profilePhoto = photoURL;
      }
    }

    const userId = (dbUser._id?.toString?.() || dbUser._id || dbUser.id) as string;
    const token = jwt.sign(
      { id: userId, email: dbUser.email || cleanEmail, username: dbUser.username || baseUsername },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return NextResponse.json({
      token,
      user: {
        id: userId,
        name: dbUser.name || cleanName,
        email: dbUser.email || cleanEmail,
        username: dbUser.username || baseUsername,
        profilePhoto: dbUser.profilePhoto || photoURL,
      },
      message: 'Login successful via Google / Firebase',
    });
  } catch (error) {
    console.error('Firebase Auth API Error:', error);
    return NextResponse.json({ error: 'Failed to process Google sign-in' }, { status: 500 });
  }
}
