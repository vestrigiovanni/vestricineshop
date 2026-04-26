const https = require('https');

const API_TOKEN = 'Token uqvj3n2vyn1yc0xzqqcqw44f93ug86s8x8l5uj61jb2wd3aywsfdfmyq9apshgjb';
const ORG = 'vestri';
const EVENT = 'npkez';
const ENDPOINT = `/api/v1/organizers/${ORG}/events/${EVENT}/subevents/`;

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
      const soldOut = json.results.filter(se => se.best_availability_state === 'sold_out');
      console.log('SOLD OUT SUBEVENTS:', JSON.stringify(soldOut.slice(0, 5), null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (e) => {
  console.error(e);
});
req.end();
