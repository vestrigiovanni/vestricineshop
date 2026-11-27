import { redirect } from 'next/navigation';

/** Oggi arriva con la fetta 7: finché non c'è, il gestionale si apre sui film. */
export default function Inizio() {
  redirect('/admin/film');
}
