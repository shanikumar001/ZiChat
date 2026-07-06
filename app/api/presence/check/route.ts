import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userIds } = body;
    const presenceMap: Record<string, boolean> = {};

    if (Array.isArray(userIds)) {
      userIds.forEach((id: string) => {
        presenceMap[id] = true;
      });
    }

    return NextResponse.json(presenceMap);
  } catch {
    return NextResponse.json({});
  }
}
