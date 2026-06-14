import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadUserFile } from '@/lib/supabase/storage';
import type { StoredAsset } from '@/lib/supabase/storage';
import { OWNER_USER_ID } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    // SINGLE-OWNER MODE: uploads always go under the platform owner.
    // The purchaser controls auth / access when they integrate the platform.
    const ownerId = OWNER_USER_ID;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const asset: StoredAsset = await uploadUserFile(ownerId, file, file.name);

    return NextResponse.json({ asset });
  } catch (err: any) {
    console.error("Storage upload error:", err);
    return NextResponse.json({ error: err.message || "Upload failed" }, { status: 500 });
  }
}
