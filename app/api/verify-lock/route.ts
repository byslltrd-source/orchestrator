import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ success: false, error: 'Password is required' }, { status: 400 });
    }

    const correctPassword = process.env.OMNIS_PASSWORD;

    if (!correctPassword) {
      console.error('[Orchestrator Lock] OMNIS_PASSWORD not set in environment');
      return NextResponse.json({ success: false, error: 'Lock not configured on server' }, { status: 500 });
    }

    if (password === correctPassword) {
      return NextResponse.json({ 
        success: true, 
        message: 'Orchestrator unlocked successfully' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: 'Incorrect password' 
      }, { status: 401 });
    }
  } catch (error) {
    console.error('[Orchestrator Lock] Error verifying password:', error);
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }
}
