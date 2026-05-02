'use server';

import { getTicketsByDate, renderBatchTickets, checkBatchStatus } from '@/services/pretix';
import { revalidatePath } from 'next/cache';

/**
 * Server Action to fetch tickets for a specific date.
 */
export async function getTicketsByDateAction(dateStr: string) {
  try {
    return await getTicketsByDate(dateStr);
  } catch (error) {
    console.error(`[TicketRecovery] Error fetching tickets for ${dateStr}:`, error);
    throw new Error('Impossibile recuperare i biglietti per la data selezionata.');
  }
}

/**
 * Server Action to handle batch printing.
 * Initiates the process and polls until completion.
 */
export async function startBatchPrintingAction(orderPositions: string[]) {
  try {
    const renderResult = await renderBatchTickets(orderPositions);
    if (!renderResult.status_url) {
      throw new Error('Pretix non ha restituito un URL di stato per il rendering.');
    }
    
    const finalResult = await checkBatchStatus(renderResult.status_url);
    return finalResult.download_url; // Return the final PDF download URL
  } catch (error) {
    console.error('[TicketRecovery] Error in batch printing:', error);
    throw new Error('Errore durante la generazione del PDF batch.');
  }
}
