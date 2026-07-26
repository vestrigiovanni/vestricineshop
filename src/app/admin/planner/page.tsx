import { redirect } from 'next/navigation';

/**
 * Il planner automatico è confluito nel wizard di programmazione.
 *
 * La rotta resta viva come reindirizzamento perché è nei segnalibri e nella
 * memoria delle dita: farla morire con un 404 sarebbe una piccola crudeltà.
 */
export default function PlannerRedirect() {
  redirect('/admin/programmazione');
}
