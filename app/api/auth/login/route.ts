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
    const { emailOrUsername, password } = body;

    if (!emailOrUsername || !password) {
      return NextResponse.json({ error: 'Please enter ZiName and password' }, { status: 400 });
    }

    const query = String(emailOrUsername).trim().toLowerCase();

    // 1. Authenticate using the ZiName verification server
    try {
      const zinameRes = await fetch('https://ziname.onrender.com/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ziName: query, password }),
      });

      const zinameData = await zinameRes.json();

      if (!zinameRes.ok || !zinameData.authenticated) {
        return NextResponse.json({ 
          error: zinameData.message || 'Invalid credentials. User verification failed on ZiName.' 
        }, { status: 401 });
      }

      const verifiedUser = zinameData.user;

      // 2. Find or create user in our database (ZiuroDB primary, MongoDB Atlas fallback)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dbUser: any = await withFallback(
        // ZiuroDB: find user by username
        () => ziurodb.findOne('users', { username: verifiedUser.ziName }),
        // Mongoose fallback
        async () => {
          await connectToDatabase();
          return User.findOne({ username: verifiedUser.ziName });
        },
        'login:findUser'
      );

      if (!dbUser) {
        // Auto-provision user in our database
        const placeholderEmail = `${verifiedUser.ziName}@ziuro.com`;

        // Check email uniqueness
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emailExists: any = await withFallback(
          () => ziurodb.findOne('users', { email: placeholderEmail }),
          async () => {
            await connectToDatabase();
            return User.findOne({ email: placeholderEmail });
          },
          'login:checkEmail'
        );

        const finalEmail = emailExists ? `${verifiedUser.ziName}_${Date.now()}@ziuro.com` : placeholderEmail;
        const hashedPassword = await bcrypt.hash(password, 10);

        dbUser = await withFallback(
          // ZiuroDB: insert new user
          () => ziurodb.insertOne('users', {
            name: verifiedUser.fullName,
            username: verifiedUser.ziName,
            email: finalEmail,
            password: hashedPassword,
            bio: '',
            profilePhoto: verifiedUser.profilePhoto || '',
          }),
          // Mongoose fallback
          async () => {
            await connectToDatabase();
            return User.create({
              name: verifiedUser.fullName,
              username: verifiedUser.ziName,
              email: finalEmail,
              password: hashedPassword,
              profilePhoto: verifiedUser.profilePhoto || '',
            });
          },
          'login:createUser'
        );
      } else {
        // Sync profile info from ZiName
        await withFallback(
          () => ziurodb.updateOne('users', { username: verifiedUser.ziName }, {
            $set: {
              name: verifiedUser.fullName,
              profilePhoto: verifiedUser.profilePhoto || '',
            },
          }),
          async () => {
            await connectToDatabase();
            const user = await User.findOne({ username: verifiedUser.ziName });
            if (user) {
              user.name = verifiedUser.fullName;
              user.profilePhoto = verifiedUser.profilePhoto || '';
              await user.save();
            }
            return user;
          },
          'login:syncProfile'
        );

        // Re-fetch to get latest data
        if (!dbUser.name || dbUser.name !== verifiedUser.fullName) {
          dbUser.name = verifiedUser.fullName;
          dbUser.profilePhoto = verifiedUser.profilePhoto || '';
        }
      }

      const userId = dbUser._id?.toString?.() || dbUser._id || dbUser.id;
      const token = jwt.sign(
        { id: userId, email: dbUser.email, username: dbUser.username },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return NextResponse.json({
        token,
        user: {
          id: userId,
          name: dbUser.name,
          email: dbUser.email,
          username: dbUser.username,
          profilePhoto: dbUser.profilePhoto,
        },
        message: 'Login successful via ZiName',
      });

    } catch (authErr) {
      console.error('ZiName connection error during login:', authErr);
      return NextResponse.json({ 
        error: 'Unable to connect to ZiName authentication server. Please try again later.' 
      }, { status: 503 });
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
