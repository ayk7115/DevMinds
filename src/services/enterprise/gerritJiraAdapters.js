import db from '../../config/db.js';

const JIRA_KEY_PATTERN = /([A-Z][A-Z0-9]+-\d+)/;

export const extractJiraKey = (...values) => {
    const text = values.filter(Boolean).join('\n');
    return text.match(JIRA_KEY_PATTERN)?.[1] || null;
};

export const normalizeGerritPatchset = (payload) => {
    const change = payload.change || payload;
    const patchSet = payload.patchSet || payload.patch_set || change.currentPatchSet || {};
    const project = change.project || payload.project || 'unknown-project';
    const branch = change.branch || payload.branch || 'main';
    const revision = patchSet.revision || payload.revision || change.current_revision;
    const changeNumber = change.number || change._number || payload.change_number;
    const subject = change.subject || payload.subject || 'Untitled Gerrit change';

    return {
        id: `gerrit:${project}:${changeNumber}:${revision || 'latest'}`,
        provider: 'gerrit',
        action: payload.type || payload.event_type || 'patchset-created',
        title: subject,
        body: change.commitMessage || payload.commitMessage || '',
        author: patchSet.uploader?.username || change.owner?.username || 'gerrit-user',
        repo: project,
        branch,
        revision,
        changeNumber,
        diff_url: payload.diff_url || null,
        ticketKey: extractJiraKey(subject, change.commitMessage, branch),
        timestamp: new Date().toISOString(),
        raw: payload
    };
};

export const persistIntegrationEvent = (event) => {
    const stmt = db.prepare(`
        INSERT OR IGNORE INTO integration_events
            (source, external_id, repo_name, ticket_key, event_type, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        event.provider,
        event.id,
        event.repo,
        event.ticketKey,
        event.action,
        JSON.stringify(event.raw || event)
    );
};

export const inferJiraTransition = (insight) => {
    const score = Number(insight.readinessScore || insight.readiness_score || 0);
    const risks = String(insight.securityRisks || insight.security_risks || '').toLowerCase();

    if (risks.includes('critical') || risks.includes('high') || score < 45) {
        return {
            status: process.env.JIRA_BLOCKED_STATUS || 'Blocked',
            reason: 'DevMind found high deployment risk or a low readiness score.'
        };
    }

    if (score >= 80 && !risks.includes('unchecked') && !risks.includes('buffer')) {
        return {
            status: process.env.JIRA_READY_STATUS || 'Ready for Review',
            reason: 'DevMind readiness score is high and no blocking security risk was detected.'
        };
    }

    return {
        status: process.env.JIRA_IN_REVIEW_STATUS || 'In Review',
        reason: 'DevMind analysis completed with moderate risk that needs reviewer attention.'
    };
};

const jiraHeaders = () => {
    const email = process.env.JIRA_EMAIL;
    const token = process.env.JIRA_API_TOKEN;
    const auth = Buffer.from(`${email}:${token}`).toString('base64');

    return {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
};

export const updateJiraFromInsight = async ({ ticketKey, insight, dryRun = false }) => {
    const transition = inferJiraTransition(insight);

    db.prepare(`
        INSERT INTO jira_transitions (ticket_key, target_status, reason, insight_id)
        VALUES (?, ?, ?, ?)
    `).run(ticketKey, transition.status, transition.reason, insight.id || null);

    if (dryRun || !process.env.JIRA_BASE_URL || !process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
        return { ticketKey, dryRun: true, ...transition };
    }

    const baseUrl = process.env.JIRA_BASE_URL.replace(/\/$/, '');
    const transitionsResponse = await fetch(`${baseUrl}/rest/api/3/issue/${ticketKey}/transitions`, {
        headers: jiraHeaders()
    });

    if (!transitionsResponse.ok) {
        throw new Error(`Jira transition lookup failed: ${transitionsResponse.status}`);
    }

    const transitions = await transitionsResponse.json();
    const target = transitions.transitions?.find(item =>
        item.name.toLowerCase() === transition.status.toLowerCase()
    );

    if (!target) {
        throw new Error(`Jira status "${transition.status}" is not available for ${ticketKey}`);
    }

    const updateResponse = await fetch(`${baseUrl}/rest/api/3/issue/${ticketKey}/transitions`, {
        method: 'POST',
        headers: jiraHeaders(),
        body: JSON.stringify({ transition: { id: target.id } })
    });

    if (!updateResponse.ok) {
        throw new Error(`Jira transition update failed: ${updateResponse.status}`);
    }

    return { ticketKey, dryRun: false, transitionId: target.id, ...transition };
};
