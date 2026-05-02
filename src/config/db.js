import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../devmind.db');

// Initialize SQLite database
const db = new Database(dbPath, { verbose: console.log });

// Create the insights table if it doesn't exist
db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        author TEXT NOT NULL,
        title TEXT NOT NULL,
        readiness_score INTEGER,
        summary TEXT,
        architectural_impact TEXT,
        security_risks TEXT,
        raw_output TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

console.log('[Database] SQLite initialized and schema verified.');

export default db;
