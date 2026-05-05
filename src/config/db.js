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

db.exec(`
    CREATE TABLE IF NOT EXISTS integration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        repo_name TEXT,
        ticket_key TEXT,
        event_type TEXT,
        payload_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, external_id, event_type)
    );

    CREATE TABLE IF NOT EXISTS jira_transitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_key TEXT NOT NULL,
        previous_status TEXT,
        target_status TEXT NOT NULL,
        reason TEXT,
        insight_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ast_symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        language TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        symbol_type TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        complexity_score INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_name, file_path, symbol_name, start_line)
    );

    CREATE TABLE IF NOT EXISTS technical_debt_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_name TEXT NOT NULL,
        module_path TEXT NOT NULL,
        commit_count INTEGER DEFAULT 0,
        bug_regression_count INTEGER DEFAULT 0,
        complexity_score REAL DEFAULT 0,
        churn_score REAL DEFAULT 0,
        predicted_risk REAL NOT NULL,
        risk_band TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pr_vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        ticket_key TEXT,
        title TEXT,
        summary TEXT,
        embedding_model TEXT NOT NULL,
        embedding_dims INTEGER NOT NULL,
        embedding BLOB NOT NULL,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS diff_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        symbol_name TEXT,
        chunk_type TEXT NOT NULL,
        priority_score REAL NOT NULL,
        token_estimate INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sast_findings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pr_id TEXT,
        repo_name TEXT,
        file_path TEXT NOT NULL,
        line INTEGER,
        severity TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        message TEXT NOT NULL,
        evidence TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

console.log('[Database] SQLite initialized and schema verified.');

export default db;
