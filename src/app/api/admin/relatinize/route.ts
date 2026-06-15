import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { relatinizeStoredNames } from '@/services/tmdb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Ri-latinizza i nomi di regista/cast già salvati nel DB che sono rimasti in
 * scrittura non latina (es. 是枝裕和 -> Hirokazu Kore-eda).
 * Idempotente: i film già "puliti" vengono saltati, i nomi latini non vengono toccati.
 */
export async function GET() {
  try {
    const result = await relatinizeStoredNames();
    if (result.updated > 0) {
      revalidatePath('/', 'layout');
    }
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[RELATINIZE] Failed:', error);
    return NextResponse.json({ success: false, error: 'Relatinize failed' }, { status: 500 });
  }
}
