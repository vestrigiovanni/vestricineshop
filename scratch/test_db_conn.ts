import pg from 'pg';

console.log('ENV VARIABLES:');
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('POSTGRES_PRISMA_URL:', process.env.POSTGRES_PRISMA_URL);
console.log('PGDATABASE:', process.env.PGDATABASE);
console.log('PGUSER:', process.env.PGUSER);
console.log('PGHOST:', process.env.PGHOST);

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;
console.log('Using connectionString:', connectionString);

const pool = new pg.Pool({ connectionString });
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Connection error:', err);
  } else {
    console.log('Connection success:', res.rows[0]);
  }
  pool.end();
});
