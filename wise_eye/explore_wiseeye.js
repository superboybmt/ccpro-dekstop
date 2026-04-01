const sql = require('mssql');
const fs = require('fs');

const config = {
  user: 'sa',
  password: 'Pnj@12345',
  server: '10.60.1.4',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 10000,
  requestTimeout: 15000,
};

async function explore() {
  const output = [];
  const log = (msg) => { output.push(msg); console.log(msg); };
  
  let pool;
  try {
    log('Connecting to SQL Server 10.60.1.4...');
    pool = await sql.connect(config);
    log('Connected!\n');

    // 1. List all databases
    log('========== DATABASES ==========');
    const dbs = await pool.request().query(`
      SELECT name, database_id, create_date, state_desc
      FROM sys.databases 
      WHERE name NOT IN ('master','tempdb','model','msdb')
      ORDER BY name
    `);
    for (const db of dbs.recordset) {
      log(`  [${db.database_id}] ${db.name} (${db.state_desc}) - Created: ${db.create_date}`);
    }

    // 2. For each user database, list tables and columns
    for (const db of dbs.recordset) {
      log(`\n========== DATABASE: ${db.name} ==========`);
      try {
        const tables = await pool.request().query(`
          SELECT t.TABLE_SCHEMA, t.TABLE_NAME, t.TABLE_TYPE
          FROM [${db.name}].INFORMATION_SCHEMA.TABLES t
          ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
        `);
        for (const tbl of tables.recordset) {
          log(`  [${tbl.TABLE_TYPE}] ${tbl.TABLE_SCHEMA}.${tbl.TABLE_NAME}`);
        }

        for (const tbl of tables.recordset) {
          if (tbl.TABLE_TYPE !== 'BASE TABLE') continue;
          log(`\n  --- ${tbl.TABLE_SCHEMA}.${tbl.TABLE_NAME} ---`);
          const cols = await pool.request().query(`
            SELECT 
              c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_MAXIMUM_LENGTH,
              c.IS_NULLABLE, c.COLUMN_DEFAULT,
              CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PK' ELSE '' END as IS_PK
            FROM [${db.name}].INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
              SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
              FROM [${db.name}].INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
              JOIN [${db.name}].INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
              WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA 
                 AND c.TABLE_NAME = pk.TABLE_NAME 
                 AND c.COLUMN_NAME = pk.COLUMN_NAME
            WHERE c.TABLE_SCHEMA = '${tbl.TABLE_SCHEMA}' 
              AND c.TABLE_NAME = '${tbl.TABLE_NAME}'
            ORDER BY c.ORDINAL_POSITION
          `);
          for (const col of cols.recordset) {
            const typeStr = col.CHARACTER_MAXIMUM_LENGTH 
              ? `${col.DATA_TYPE}(${col.CHARACTER_MAXIMUM_LENGTH})` 
              : col.DATA_TYPE;
            const nullable = col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
            const pk = col.IS_PK ? ' [PK]' : '';
            const def = col.COLUMN_DEFAULT ? ` DEFAULT ${col.COLUMN_DEFAULT}` : '';
            log(`    ${col.COLUMN_NAME}: ${typeStr} ${nullable}${pk}${def}`);
          }
        }
      } catch (dbErr) {
        log(`  Error accessing ${db.name}: ${dbErr.message}`);
      }
    }

    // 3. Sample data from key tables
    log('\n========== SAMPLE DATA: CheckInOut (TOP 10) ==========');
    try {
      const checkInOut = await pool.request().query(`
        SELECT TOP 10 * FROM [WiseEye].dbo.CheckInOut ORDER BY TimeStr DESC
      `);
      log(JSON.stringify(checkInOut.recordset, null, 2));
    } catch (e) { log('Error: ' + e.message); }

    log('\n========== SAMPLE DATA: UserInfo (TOP 5) ==========');
    try {
      const users = await pool.request().query(`
        SELECT TOP 5 UserEnrollNumber, UserFullCode, UserFullName, UserLastName, 
               UserEnrollName, UserCardNo, UserHireDay, UserSex, UserEnabled, SchID
        FROM [WiseEye].dbo.UserInfo ORDER BY UserEnrollNumber
      `);
      log(JSON.stringify(users.recordset, null, 2));
    } catch (e) { log('Error: ' + e.message); }

    log('\n========== SAMPLE DATA: VerifyLogs (TOP 10) ==========');
    try {
      const vLogs = await pool.request().query(`
        SELECT TOP 10 * FROM [WiseEye].dbo.VerifyLogs ORDER BY TimeStr DESC
      `);
      log(JSON.stringify(vLogs.recordset, null, 2));
    } catch (e) { log('Error: ' + e.message); }

    log('\n========== TOTAL RECORD COUNTS ==========');
    try {
      const counts = await pool.request().query(`
        SELECT 'CheckInOut' as TableName, COUNT(*) as RecordCount FROM [WiseEye].dbo.CheckInOut
        UNION ALL
        SELECT 'UserInfo', COUNT(*) FROM [WiseEye].dbo.UserInfo
        UNION ALL
        SELECT 'Punch', COUNT(*) FROM [WiseEye].dbo.Punch
        UNION ALL
        SELECT 'VerifyLogs', COUNT(*) FROM [WiseEye].dbo.VerifyLogs
      `);
      log(JSON.stringify(counts.recordset, null, 2));
    } catch (e) { log('Error: ' + e.message); }

  } catch (err) {
    log('Connection Error: ' + err.message);
  } finally {
    if (pool) await pool.close();
  }

  // Save to file
  fs.writeFileSync('wiseeye_schema.txt', output.join('\n'), 'utf8');
  console.log('\n✅ Saved to wiseeye_schema.txt');
}

explore();
