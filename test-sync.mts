import { syncSeatingPlansWithMirror } from './src/services/pretix.js';

async function run() {
  const res = await syncSeatingPlansWithMirror();
  console.log(res);
}
run();
