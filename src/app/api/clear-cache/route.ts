import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { clearPretixCache } from '@/services/pretix';

export async function GET() {
  clearPretixCache();
  revalidatePath('/', 'layout');
  return NextResponse.json({ success: true, message: 'Cache cleared and path revalidated' });
}
