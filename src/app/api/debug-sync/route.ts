import { NextResponse } from 'next/server';
import { syncPretixToDatabase } from '@/services/sync.service';

export async function GET() {
  try {
    const result = await syncPretixToDatabase({ forceMetadataRefresh: true });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
}
