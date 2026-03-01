// Restore all MongoDB collections from a backup directory
// Run with: npm run db:restore <backup-dir>
// Example: npm run db:restore scripts/backups/backup-2026-03-01T12-00-00-000Z

import { MongoClient, ObjectId } from 'mongodb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI!;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'bearwood-fantasy';

// Revive MongoDB-specific types from JSON
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviveDocument(doc: any): any {
  if (doc === null || doc === undefined) return doc;
  if (typeof doc !== 'object') return doc;

  // Handle MongoDB extended JSON formats
  if (doc.$oid) return new ObjectId(doc.$oid as string);
  if (doc.$date) return new Date(doc.$date as string);

  // Handle plain ObjectId-like strings in _id fields
  if (Array.isArray(doc)) return doc.map(reviveDocument);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (
      (key === '_id' || key.endsWith('Id') || key === 'userId' || key === 'golferId' ||
        key === 'tournamentId' || key === 'captainId') &&
      typeof value === 'string' &&
      /^[0-9a-fA-F]{24}$/.test(value)
    ) {
      result[key] = new ObjectId(value);
    } else if (
      (key === 'createdAt' || key === 'updatedAt' || key === 'startDate' || key === 'endDate' ||
        key === 'changedAt' || key === 'expiresAt' || key === 'lastUsedAt') &&
      typeof value === 'string'
    ) {
      result[key] = new Date(value);
    } else if (key === 'golferIds' && Array.isArray(value)) {
      result[key] = (value as string[]).map((v) =>
        typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? new ObjectId(v) : reviveDocument(v)
      );
    } else if (key === 'participatingGolferIds' && Array.isArray(value)) {
      result[key] = (value as string[]).map((v) =>
        typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? new ObjectId(v) : reviveDocument(v)
      );
    } else {
      result[key] = reviveDocument(value);
    }
  }
  return result;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer === 'YES');
    });
  });
}

async function restore() {
  const backupDir = process.argv[2];
  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error('Usage: npx tsx scripts/restore.ts <backup-dir>');
    console.error('Example: npx tsx scripts/restore.ts scripts/backups/backup-2026-03-01T12-00-00-000Z');
    process.exit(1);
  }

  // Load metadata if available
  const metadataPath = path.join(backupDir, '_metadata.json');
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log(`📦 Backup from: ${metadata.timestamp}`);
    console.log(`   Database: ${metadata.database}`);
    console.log(`   Documents: ${metadata.totalDocuments}`);
  }

  console.log(`\n⚠️  Target database: ${MONGODB_DB_NAME}`);
  const confirmed = await confirm(
    `   This will REPLACE ALL DATA in "${MONGODB_DB_NAME}". Type YES to continue: `
  );
  if (!confirmed) {
    console.log('Aborted.');
    return;
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));

    console.log();
    let totalDocs = 0;
    for (const file of files) {
      const collectionName = file.replace('.json', '');
      const raw = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf-8'));
      const docs = raw.map(reviveDocument);

      await db.collection(collectionName).deleteMany({});
      if (docs.length > 0) {
        await db.collection(collectionName).insertMany(docs);
      }
      console.log(`   ✅ ${collectionName}: restored ${docs.length} documents`);
      totalDocs += docs.length;
    }

    console.log(`\n✅ Restore complete: ${totalDocs} total documents in ${MONGODB_DB_NAME}`);
  } finally {
    await client.close();
  }
}

restore().catch((err) => {
  console.error('❌ Restore failed:', err);
  process.exit(1);
});
