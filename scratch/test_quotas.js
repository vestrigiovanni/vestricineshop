const https = require('https');

const API_TOKEN = 'Token uqvj3n2vyn1yc0xzqqcqw44f93ug86s8x8l5uj61jb2wd3aywsfdfmyq9apshgjb';
const ORG = 'vestri';
const EVENT = 'npkez';
const ENDPOINT = `/api/v1/organizers/${ORG}/events/${EVENT}/quotas/?with_availability=true`;

const options = {
  hostname: 'pretix.eu',
  path: ENDPOINT,
  method: 'GET',
  headers: {
    'Authorization': API_TOKEN,
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const availabilities = json.results.map(q => ({
        id: q.id,
        name: q.name,
        available: q.available_number,
        items: q.items
      }));
      console.log('QUOTAS:', JSON.stringify(availabilities.slice(0, 20), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});
req.end();
