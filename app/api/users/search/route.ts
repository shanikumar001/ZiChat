import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';

const mockUsers = [
  { id: 'user_alex', name: 'Alex Rivera', username: 'alex', email: 'alex@example.com', profilePhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex' },
  { id: 'user_sarah', name: 'Sarah Connor', username: 'sarah', email: 'sarah@example.com', profilePhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
  { id: 'user_john', name: 'John Doe', username: 'johndoe', email: 'john@example.com', profilePhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=johndoe' },
  { id: 'user_emily', name: 'Emily Davis', username: 'emily', email: 'emily@example.com', profilePhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily' },
  { id: 'user_michael', name: 'Michael Scott', username: 'michael', email: 'michael@example.com', profilePhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=michael' },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim().toLowerCase() || '';

    if (!q) {
      return NextResponse.json([]);
    }

    let dbConnected = false;
    try {
      await connectToDatabase();
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    if (dbConnected) {
      const regex = new RegExp(q, 'i');
      const users = await User.find({
        $or: [{ name: regex }, { username: regex }, { email: regex }],
      })
        .select('_id name username email profilePhoto')
        .limit(20);

      const formatted = users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        username: u.username,
        email: u.email,
        profilePhoto: u.profilePhoto,
      }));

      return NextResponse.json(formatted);
    }

    const results = mockUsers.filter(
      u => u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json([]);
  }
}
