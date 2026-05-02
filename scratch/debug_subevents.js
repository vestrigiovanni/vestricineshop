
const PRETIX_API_URL = 'https://pretix.eu/api/v1';
const PRETIX_ORGANIZER = 'vestri';
const PRETIX_EVENT = 'npkez';
const PRETIX_TOKEN = 'Token uqvj3n2vyn1yc0xzqqcqw44f93ug86s8x8l5uj61jb2wd3aywsfdfmyq9apshgjb';

async function test() {
  const dateStr = '2026-05-02';
  const url = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}/subevents/?date_from_after=${dateStr}T00:00:00Z&date_from_before=${dateStr}T23:59:59Z`;
  
  console.log('Fetching:', url);
  
  const res = await fetch(url, {
    headers: {
      'Authorization': PRETIX_TOKEN
    }
  });
  
  console.log('Status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    console.log('Error:', text);
    return;
  }

  const data = await res.json();
  const ids = data.results.map(s => s.id);
  console.log('IDs:', ids);

  if (ids.length > 0) {
    const subeventParams = ids.map(id => `subevent=${id}`).join('&');
    const opUrl = `${PRETIX_API_URL}/organizers/${PRETIX_ORGANIZER}/events/${PRETIX_EVENT}/orderpositions/?${subeventParams}&order__status=p`;
    console.log('Fetching OrderPositions:', opUrl);
    const opRes = await fetch(opUrl, {
      headers: { 'Authorization': PRETIX_TOKEN }
    });
    console.log('OP Status:', opRes.status);
    if (!opRes.ok) {
      const opError = await opRes.text();
      console.log('OP Error:', opError);
      return;
    }
    const opData = await opRes.json();
    console.log('OrderPositions count:', opData.count);
    if (opData.results) {
      opData.results.slice(0, 3).forEach(op => {
        console.log(`Order: ${op.order}, Attendee: ${op.attendee_name}, Email: ${op.attendee_email}, Seat: ${op.seat?.name}`);
      });
    }
  }
}

test();
