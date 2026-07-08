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

      // Connect to next-app's MongoDB database
      let dbConnected = false;
      try {
        await connectToDatabase();
        dbConnected = true;
      } catch (err) {
        console.error('Failed to connect to database:', err);
      }

      const verifiedUser = zinameData.user;

      if (dbConnected) {
        // Find existing user or create a new one based on ZiName user details
        let dbUser = await User.findOne({ username: verifiedUser.ziName });

        if (!dbUser) {
          // Auto-provision user in next-app's database
          // Since email is required and unique, generate a placeholder email
          const placeholderEmail = `${verifiedUser.ziName}@ziuro.com`;
          
          // Verify placeholder email uniqueness, if taken add a timestamp
          let finalEmail = placeholderEmail;
          const emailExists = await User.findOne({ email: finalEmail });
          if (emailExists) {
            finalEmail = `${verifiedUser.ziName}_${Date.now()}@ziuro.com`;
          }

          dbUser = await User.create({
            name: verifiedUser.fullName,
            username: verifiedUser.ziName,
            email: finalEmail,
            password: await bcrypt.hash(password, 10), // Save encrypted password locally for backup
            profilePhoto: verifiedUser.profilePhoto || '',
          });
        } else {
          // Sync profile info with main ZiName identity profile
          dbUser.name = verifiedUser.fullName;
          dbUser.profilePhoto = verifiedUser.profilePhoto || '';
          await dbUser.save();
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
          message: 'Login successful via ZiName',
        });
      }

      // Dev fallback: in case database is down, return the user info from ZiName directly
      const token = jwt.sign(
        { id: verifiedUser._id, email: `${verifiedUser.ziName}@ziuro.com`, username: verifiedUser.ziName },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      return NextResponse.json({
        token,
        user: {
          id: verifiedUser._id,
          name: verifiedUser.fullName,
          email: `${verifiedUser.ziName}@ziuro.com`,
          username: verifiedUser.ziName,
          profilePhoto: verifiedUser.profilePhoto,
        },
        message: 'Login successful (Dev Fallback)',
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
