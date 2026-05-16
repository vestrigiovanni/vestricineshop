
const { PrismaClient } = require('@prisma/client');
// Load .env if needed
require('dotenv').config();

const prisma = new PrismaClient();

async function check() {
  try {
    const movie = await prisma.movieOverride.findUnique({
      where: { tmdbId: '1313006' },
      include: { awards: true }
    });
    console.log('--- MOVIE DATA ---');
    console.log(JSON.stringify(movie, null, 2));
    
    const syncs = await prisma.pretixSync.findMany({
      where: { tmdbId: '1313006' }
    });
    console.log('--- SHOWTIMES IN DB ---');
    console.log(JSON.stringify(syncs, null, 2));
    
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
