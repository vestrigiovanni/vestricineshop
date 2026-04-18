import { getSeatingPlansMap } from './src/services/pretix';

async function test() {
  const map = await getSeatingPlansMap();
  console.log('Seating Plans Map:');
  console.log(JSON.stringify(map, null, 2));
  
  if (map[9659] === 'SALA NICCOLINI') {
    console.log('\n✅ SUCCESS: Room 9659 is correctly mapped to "SALA NICCOLINI"');
  } else {
    console.log('\n❌ FAILURE: Room 9659 mapping is:', map[9659]);
  }
}

test().catch(console.error);
