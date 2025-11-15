/**
 * Migration Script: Enable Multiple Buildings per Tile
 * 
 * This script updates the database schema to support multiple buildings per tile:
 * 1. Removes UNIQUE constraint on (q, r) in buildings table
 * 2. Removes building_id column from tile_ownership table
 * 3. Updates foreign key constraints
 */

import { Pool } from 'pg';

async function migrateMultipleBuildings() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'hex_kingdom',
    user: process.env.POSTGRES_USER || 'hex_user',
    password: process.env.POSTGRES_PASSWORD || 'hex_pass_dev',
  });

  const client = await pool.connect();

  try {
    console.log('🔄 Starting migration: Multiple Buildings per Tile...\n');

    await client.query('BEGIN');

    // Step 1: Remove UNIQUE constraint from buildings table
    console.log('1️⃣  Removing UNIQUE constraint (q, r) from buildings table...');
    try {
      await client.query(`
        ALTER TABLE buildings 
        DROP CONSTRAINT IF EXISTS unique_tile_building
      `);
      console.log('   ✅ UNIQUE constraint removed\n');
    } catch (err) {
      console.log('   ⚠️  Constraint might not exist (safe to ignore)\n');
    }

    // Step 2: Remove building_id column from tile_ownership
    console.log('2️⃣  Removing building_id column from tile_ownership table...');
    try {
      // First remove foreign key constraint
      await client.query(`
        ALTER TABLE tile_ownership 
        DROP CONSTRAINT IF EXISTS fk_tile_building
      `);
      console.log('   ✅ Foreign key constraint removed');

      // Then remove column
      await client.query(`
        ALTER TABLE tile_ownership 
        DROP COLUMN IF EXISTS building_id
      `);
      console.log('   ✅ building_id column removed\n');
    } catch (err) {
      console.log('   ⚠️  Column might not exist (safe to ignore)\n');
    }

    // Step 3: Verify schema
    console.log('3️⃣  Verifying new schema...');
    
    const buildingsSchema = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'buildings'
      ORDER BY ordinal_position
    `);
    console.log('   Buildings table columns:', buildingsSchema.rows.map(r => r.column_name).join(', '));

    const tileOwnershipSchema = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tile_ownership'
      ORDER BY ordinal_position
    `);
    console.log('   Tile ownership columns:', tileOwnershipSchema.rows.map(r => r.column_name).join(', '));

    const constraints = await client.query(`
      SELECT constraint_name, constraint_type 
      FROM information_schema.table_constraints 
      WHERE table_name = 'buildings' OR table_name = 'tile_ownership'
      ORDER BY table_name, constraint_name
    `);
    console.log('   Active constraints:', constraints.rows.length);

    await client.query('COMMIT');

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Multiple buildings per tile: ENABLED');
    console.log('   - Buildings are linked via (q, r) coordinates');
    console.log('   - No more building_id in tile_ownership');
    console.log('   - Use getBuildingsAtPosition() instead of getBuildingAtPosition()');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
if (require.main === module) {
  migrateMultipleBuildings()
    .then(() => {
      console.log('\n👋 Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { migrateMultipleBuildings };
