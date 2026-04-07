import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

/**
 * Handle Pretix Webhooks for Real-time Availability Sync.
 * Events to configure on Pretix: order.placed, order.paid, order.canceled, order.expired.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, event, organizer } = body;

    console.log(`[Pretix Webhook] Received ${action} for ${organizer}/${event}`);

    // We revalidate only on relevant actions that affect availability
    const relevantActions = [
      'pretix.event.order.placed',
      'pretix.event.order.paid',
      'pretix.event.order.canceled',
      'pretix.event.order.expired',
      'pretix.event.order.placed.require_approval'
    ];

    if (relevantActions.includes(action)) {
      console.log('[Pretix Webhook] Triggering revalidation for "availability" tag');
      revalidateTag('availability', { expire: 0 });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Pretix Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
