import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.MIGRATE_URL!, { ssl: 'require' });
  const cats = await sql`select id, code, name_th from ticket_category order by id limit 12`;
  console.log('CATEGORIES ' + JSON.stringify(cats));
  const co = await sql`select id, code, name_th from company order by id limit 8`;
  console.log('COMPANIES ' + JSON.stringify(co));
  await sql.end();
}
main();
