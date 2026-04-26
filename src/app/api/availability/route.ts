import { NextResponse } from 'next/server';
import { getAvailabilityMap } from '@/services/availability.service';

export const revalidate = 0; 

export async function GET() {
  try {
    const availabilityMap = await getAvailabilityMap();
    return NextResponse.json(availabilityMap);
  } catch (error) {
    console.error('[API Availability] Error:', error);
    return NextResponse.json({});
  }
}
