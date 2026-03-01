// Export all MongoDB collections to timestamped JSON backup
// Run with: npm run db:backup

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

const COLLECTIONS = [
  'golfers',
  'scores',
  'tournaments',
  'picks',
  'pickHistory',
  'users',
  'seasons',
  'settings',
  'refreshTokens',
];

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, 'backups', `backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`📦 Backing up database: ${MONGODB_DB_NAME}`);
  console.log(`   Output: ${backupDir}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    let totalDocs = 0;
    for (const name of COLLECTIONS) {
      const docs = await db.collection(name).find({}).toArray();
      const filePath = path.join(backupDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
      console.log(`   ✅ ${name}: ${docs.length} documents`);
      totalDocs += docs.length;
    }

    // Write metadata
    fs.writeFileSync(
      path.join(backupDir, '_metadata.json'),
      JSON.stringify(
        {
          timestamp,
          database: MONGODB_DB_NAME,
          collections: COLLECTIONS,
          totalDocuments: totalDocs,
        },
        null,
        2
      )
    );

    console.log(`\n✅ Backup complete: ${totalDocs} total documents`);
    console.log(`   ${backupDir}`);
  } finally {
    await client.close();
  }
}

backup().catch((err) => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
