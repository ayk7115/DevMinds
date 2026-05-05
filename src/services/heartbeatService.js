import cron from 'node-cron';
import db from '../config/db.js';
import { sendTelegramMessage } from './telegramService.js';

/**
 * Heartbeat Service
 * Generates automated weekly aggregations of PR insights for stakeholders.
 */

export const startHeartbeat = () => {
    console.log('[HeartbeatService] Initialized. Cron scheduled for Friday at 5:00 PM.');

    // Schedule: Every Friday at 17:00 (5:00 PM)
    cron.schedule('0 17 * * 5', () => {
        console.log('[HeartbeatService] Triggering Weekly Digest Generation...');
        generateAndSendWeeklyDigest();
    });
};

const generateAndSendWeeklyDigest = async () => {
    try {
        // Fetch insights from the last 7 days
        const stmt = db.prepare(`
            SELECT * FROM insights 
            WHERE created_at >= date('now', '-7 days')
        `);
        const recentInsights = stmt.all();

        if (recentInsights.length === 0) {
            console.log('[HeartbeatService] No PRs this week. Skipping digest.');
            return;
        }

        // Aggregate Data
        const totalPRs = recentInsights.length;
        const avgScore = Math.round(
            recentInsights.reduce((sum, pr) => sum + pr.readiness_score, 0) / totalPRs
        );
        const criticalRisks = recentInsights.filter(pr => pr.security_risks.toLowerCase() === 'high' || pr.security_risks.toLowerCase() === 'critical').length;

        // Build Digest Message
        let message = `
📈 *DevMind Weekly Digest*
*Activity for the past 7 days*

🚀 *Total PRs Merged:* ${totalPRs}
🎯 *Average Readiness Score:* ${avgScore}/100
🛡️ *Critical Security Risks Found:* ${criticalRisks}

*Key Updates:*
`;

        // Add top 3 summaries
        recentInsights.slice(0, 3).forEach(pr => {
            message += `- *${pr.title}*: ${pr.summary}\n`;
        });

        if (recentInsights.length > 3) {
            message += `\n_...and ${recentInsights.length - 3} more updates._`;
        }

        // Send via Telegram securely using async/await
        await sendTelegramMessage(message.trim());
        console.log('[HeartbeatService] Weekly digest sent successfully.');

    } catch (error) {
        console.error('[HeartbeatService] Failed to generate weekly digest:', error);
        // Fallback Alert: Send failure notification to admin
        try {
            await sendTelegramMessage(`⚠️ *[SYSTEM ALERT]*\nDevMind Weekly Digest generation failed.\n_Cause: ${error.message}_`);
        } catch (telegramErr) {
            console.error('[HeartbeatService] FATAL: Could not even send fallback Telegram alert.', telegramErr);
        }
    }
};

// Expose a manual trigger for testing purposes
export const triggerManualDigest = () => {
    console.log('[HeartbeatService] Manual digest triggered.');
    generateAndSendWeeklyDigest();
};
