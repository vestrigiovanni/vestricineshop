import { NextResponse } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { updateEventAvailability, syncNewlyCreatedEvents } from '@/services/sync.service';

/**
 * Handle Pretix Webhooks for Real-time Availability Sync.
 * Events to configure on Pretix: 
 * - order.placed, order.paid, order.canceled, order.expired
 * - subevent.added, subevent.changed, subevent.deleted
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, event, organizer } = body;

    console.log(`[Pretix Webhook] Received ${action} for ${organizer}/${event}`);

    const orderActions = [
      'pretix.event.order.placed',
      'pretix.event.order.paid',
      'pretix.event.order.canceled',
      'pretix.event.order.expired',
      'pretix.event.order.placed.require_approval'
    ];

    const subeventSyncActions = [
      'pretix.event.subevent.added',
      'pretix.event.subevent.changed'
    ];

    const subeventDeleteActions = [
      'pretix.event.subevent.deleted'
    ];

    const isOrderAction = orderActions.includes(action);
    const isSubeventSyncAction = subeventSyncActions.includes(action);
    const isSubeventDeleteAction = subeventDeleteActions.includes(action);

    if (isOrderAction || isSubeventSyncAction || isSubeventDeleteAction) {
      // 1. Gather all subevent IDs from the webhook payload
      const subeventIds = new Set<number>();

      if (body.subevent) {
        const id = typeof body.subevent === 'number' ? body.subevent : parseInt(body.subevent);
        if (!isNaN(id)) subeventIds.add(id);
      }
      if (body.data?.subevent) {
        const id = typeof body.data.subevent === 'number' ? body.data.subevent : parseInt(body.data.subevent);
        if (!isNaN(id)) subeventIds.add(id);
      }
      if (Array.isArray(body.data?.positions)) {
        for (const pos of body.data.positions) {
          if (pos.subevent) {
            const id = typeof pos.subevent === 'number' ? pos.subevent : parseInt(pos.subevent);
            if (!isNaN(id)) subeventIds.add(id);
          }
        }
      }

      const subeventIdsArray = Array.from(subeventIds);
      console.log(`[Pretix Webhook] Identified subevent IDs for action ${action}:`, subeventIdsArray);

      // 2. Perform database synchronization based on the webhook action
      if (isOrderAction && subeventIdsArray.length > 0) {
        for (const subeventId of subeventIdsArray) {
          try {
            console.log(`[Pretix Webhook] Surgically updating availability for subevent ${subeventId}...`);
            await updateEventAvailability(subeventId, true); // Force bypass throttling
            console.log(`[Pretix Webhook] Availability update complete for subevent ${subeventId}`);
          } catch (err) {
            console.error(`[Pretix Webhook] Failed to update availability for subevent ${subeventId}:`, err);
          }
        }
      } else if (isSubeventSyncAction && subeventIdsArray.length > 0) {
        try {
          console.log(`[Pretix Webhook] Surgically syncing added/changed subevents:`, subeventIdsArray);
          await syncNewlyCreatedEvents(subeventIdsArray);
          console.log(`[Pretix Webhook] Sync complete for subevents:`, subeventIdsArray);
        } catch (err) {
          console.error(`[Pretix Webhook] Failed to sync added/changed subevents:`, err);
        }
      } else if (isSubeventDeleteAction && subeventIdsArray.length > 0) {
        for (const subeventId of subeventIdsArray) {
          try {
            console.log(`[Pretix Webhook] Deleting subevent ${subeventId} from database...`);
            await prisma.pretixSync.delete({
              where: { pretixId: subeventId }
            });
            console.log(`[Pretix Webhook] Deleted subevent ${subeventId} from database successfully`);
          } catch (err) {
            console.error(`[Pretix Webhook] Failed to delete subevent ${subeventId} from database:`, err);
          }
        }
      }

      // 3. Trigger cache revalidation
      console.log('[Pretix Webhook] Triggering cache and path revalidations');
      revalidateTag('availability', { expire: 0 });
      revalidatePath('/');
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Pretix Webhook] Error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
