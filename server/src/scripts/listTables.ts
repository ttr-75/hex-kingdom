import pg from 'pg';

const client = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'hex_kingdom',
  user: 'hex_user',
  password: 'hex_pass_dev'
});

client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
  .then(result => {
    console.log('\n📊 PostgreSQL Tabellen:');
    result.rows.forEach(row => console.log(`   - ${row.table_name}`));
    client.end();
  });
