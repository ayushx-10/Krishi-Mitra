/**
 * Neon Database Service — Serverless PostgreSQL Integration
 * 
 * Uses @neondatabase/serverless neon driver to log farmer field predictions
 * and retrieve historical sessions directly from Neon PostgreSQL database.
 */

import { neon } from '@neondatabase/serverless';

const connectionString = import.meta.env.VITE_NEON_DATABASE_URL || import.meta.env.DATABASE_URL;

let sql = null;
if (connectionString) {
  try {
    sql = neon(connectionString);
  } catch (err) {
    console.warn('Neon DB initialization warning:', err.message);
  }
}

/**
 * Initialize Neon Database table schema if not already present.
 */
export async function initNeonDatabase() {
  if (!sql) return false;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS farmer_sessions (
        id SERIAL PRIMARY KEY,
        farmer_name VARCHAR(100),
        location_name VARCHAR(255),
        latitude NUMERIC(10, 6),
        longitude NUMERIC(10, 6),
        crop_id VARCHAR(50),
        field_type VARCHAR(50),
        added_nitrogen NUMERIC(8, 2),
        soil_ph NUMERIC(4, 2),
        advisory_status VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('Neon Database table schema verified.');
    return true;
  } catch (err) {
    console.warn('Neon DB schema creation notice:', err.message);
    return false;
  }
}

/**
 * Log a farmer prediction session to Neon Database.
 */
export async function saveFieldSession(data) {
  if (!sql) {
    console.warn('Neon DB not configured — saving session to local memory fallback.');
    return false;
  }

  try {
    await initNeonDatabase();

    const farmerName = data.farmerName || 'Anonymous Farmer';
    const locationName = data.locationName || 'Farm Field';
    const lat = data.coordinates?.lat || 0;
    const lng = data.coordinates?.lng || 0;
    const cropId = data.cropId || 'wheat';
    const fieldType = data.fieldType || 'irrigated';
    const addedN = parseFloat(data.addedNitrogen) || 0;
    const ph = parseFloat(data.customPh) || 6.8;
    const status = data.advisory?.status || 'safe_to_wait';

    const result = await sql`
      INSERT INTO farmer_sessions (
        farmer_name, location_name, latitude, longitude, crop_id, field_type, added_nitrogen, soil_ph, advisory_status
      ) VALUES (
        ${farmerName}, ${locationName}, ${lat}, ${lng}, ${cropId}, ${fieldType}, ${addedN}, ${ph}, ${status}
      ) RETURNING id;
    `;

    console.log('Session saved to Neon DB successfully. Record ID:', result[0]?.id);
    return result[0]?.id;
  } catch (err) {
    console.warn('Neon DB save session notice:', err.message);
    return false;
  }
}

/**
 * Fetch recent farmer sessions from Neon DB.
 */
export async function fetchRecentFieldSessions(limit = 5) {
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT id, farmer_name, location_name, latitude, longitude, crop_id, field_type, added_nitrogen, soil_ph, advisory_status, created_at
      FROM farmer_sessions
      ORDER BY created_at DESC
      LIMIT ${limit};
    `;
    return rows;
  } catch (err) {
    console.warn('Neon DB fetch sessions notice:', err.message);
    return [];
  }
}
