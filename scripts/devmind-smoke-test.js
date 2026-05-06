import 'dotenv/config';
import db from '../src/config/db.js';
import { analyzeRepository } from '../src/services/repoAnalyzer.js';
import { getChatStatus } from '../src/services/chatService.js';
import { getTelegramStatus, formatPRMessage } from '../src/services/telegramService.js';

const checks = [];

const addCheck = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
};

try {
    const analysis = analyzeRepository(process.cwd());
    addCheck('Repo analyzer', analysis.metrics.files > 0, `${analysis.metrics.files} files, ${analysis.metrics.apiEndpoints} endpoints`);
    addCheck('Repo X-Ray details', analysis.apiEndpoints.length > 0, `${analysis.apiEndpoints.length} API endpoints detected`);
} catch (error) {
    addCheck('Repo analyzer', false, error.message);
}

try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM insights').get();
    addCheck('SQLite insights table', Number.isInteger(row.count), `${row.count} stored insights`);
} catch (error) {
    addCheck('SQLite insights table', false, error.message);
}

try {
    const status = getChatStatus();
    addCheck('Groq chat config', status.configured, status.configured ? `model ${status.model}` : 'GROQ_API_KEY missing or placeholder');
} catch (error) {
    addCheck('Groq chat config', false, error.message);
}

try {
    const status = getTelegramStatus();
    addCheck('Telegram config', status.configured, status.configured ? 'bot token and chat id present' : 'missing token or chat id');

    const sample = formatPRMessage(
        {
            readinessScore: 88,
            architecturalImpact: 'Medium <escaped>',
            securityRisks: 'Low & controlled',
            stakeholder_summary: 'Smoke test verifies Telegram escaping for PR titles like feature_x.'
        },
        {
            title: 'Smoke: feature_x <telegram>',
            author: 'devmind',
            repo: 'local/devmind',
            diff_url: 'https://github.com/local/devmind/pull/1.diff'
        }
    );
    addCheck('Telegram formatter', sample.includes('&lt;telegram&gt;'), 'HTML escaping works');
} catch (error) {
    addCheck('Telegram formatter', false, error.message);
}

console.log('\nDevMind Smoke Test');
console.log('==================');
for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'WARN'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

const failed = checks.filter(check => !check.ok);
if (failed.length > 0) {
    console.log('\nWarnings mean the project can run, but a feature is not fully connected yet.');
}
