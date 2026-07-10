const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function migrate() {
  console.log('Starting migration of files from PostgreSQL to Backblaze B2 S3...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const endpoint = process.env.S3_ENDPOINT || 's3.eu-central-003.backblazeb2.com';
  const formattedEndpoint = endpoint.startsWith('http') ? endpoint : `https://${endpoint}`;
  
  const s3 = new S3Client({
    endpoint: formattedEndpoint,
    region: process.env.S3_REGION || 'eu-central-003',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
    },
  });

  const bucketName = process.env.S3_BUCKET_NAME || 'kom18-storage';

  try {
    // 1. Initialize day counts from existing S3 keys in DB to avoid collisions
    const dayCounts = {};
    const { rows: existingRows } = await pool.query(
      'SELECT s3_key, created_at FROM files WHERE s3_key IS NOT NULL'
    );
    
    for (const r of existingRows) {
      const date = new Date(r.created_at);
      const yyyy = date.getUTCFullYear();
      const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const dd = date.getUTCDate().toString().padStart(2, '0');
      const dayKey = `${yyyy}${mm}${dd}`;
      
      const match = r.s3_key.match(/roadsync\/\d{4}\/\d{6}(\d{2})\./);
      const nn = match ? parseInt(match[1], 10) : 0;
      if (nn > 0) {
        dayCounts[dayKey] = Math.max(dayCounts[dayKey] || 0, nn);
      }
    }
    
    console.log(`Initialized day counts from ${existingRows.length} existing S3 records.`);

    // 2. Fetch all legacy files that still reside in DB
    const { rows: filesToMigrate } = await pool.query(
      'SELECT id, filename, mime_type, size_bytes, data, created_at FROM files WHERE s3_key IS NULL AND data IS NOT NULL ORDER BY created_at ASC'
    );

    console.log(`Found ${filesToMigrate.length} files to migrate.`);

    if (filesToMigrate.length === 0) {
      console.log('No files require migration.');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const file of filesToMigrate) {
      try {
        const date = new Date(file.created_at);
        const yyyy = date.getUTCFullYear();
        const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
        const dd = date.getUTCDate().toString().padStart(2, '0');
        const yy = yyyy.toString().slice(-2);
        const dayKey = `${yyyy}${mm}${dd}`;

        // Get next unique nn for this day
        dayCounts[dayKey] = (dayCounts[dayKey] || 0) + 1;
        const nn = dayCounts[dayKey].toString().padStart(2, '0');

        // Extract extension and map .jpg -> .jpeg
        let ext = '.jpeg';
        const parts = file.filename.split('.');
        if (parts.length > 1) {
          const fileExt = parts.pop().toLowerCase();
          if (fileExt === 'jpg') {
            ext = '.jpeg';
          } else if (fileExt) {
            ext = `.${fileExt}`;
          }
        }

        const s3Key = `roadsync/${yyyy}/${yy}${mm}${dd}${nn}${ext}`;

        console.log(`Migrating file ID ${file.id} (${file.filename}) -> S3 Key: ${s3Key}...`);

        // Upload file binary payload to S3
        await s3.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: file.data,
          ContentType: file.mime_type,
        }));

        // Update record in database: set s3_key and set data to null
        await pool.query(
          'UPDATE files SET s3_key = $1, data = NULL WHERE id = $2',
          [s3Key, file.id]
        );

        successCount++;
      } catch (err) {
        console.error(`Failed to migrate file ID ${file.id}:`, err);
        failCount++;
      }
    }

    console.log(`\nMigration completed: ${successCount} succeeded, ${failCount} failed.`);
    
    if (successCount > 0) {
      console.log('\nRunning database disk space reclamation (VACUUM)...');
      await pool.query('VACUUM FULL files');
      console.log('PostgreSQL disk space reclaimed successfully.');
    }

  } catch (error) {
    console.error('Migration process encountered a fatal error:', error);
  } finally {
    await pool.end();
  }
}

migrate();
