import db from '../../config/db.js';

const MODEL_VERSION = 'devmind-debt-v0.1';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export const predictDebtRisk = ({
    commitCount = 0,
    bugRegressionCount = 0,
    complexityScore = 0,
    churnScore = 0
}) => {
    const normalizedCommitPressure = clamp(commitCount / 80);
    const normalizedBugPressure = clamp(bugRegressionCount / 12);
    const normalizedComplexity = clamp(complexityScore / 40);
    const normalizedChurn = clamp(churnScore / 4000);

    const risk =
        (normalizedBugPressure * 0.38) +
        (normalizedComplexity * 0.28) +
        (normalizedChurn * 0.22) +
        (normalizedCommitPressure * 0.12);

    const predictedRisk = Number((risk * 100).toFixed(2));
    const riskBand = predictedRisk >= 75 ? 'critical' : predictedRisk >= 55 ? 'high' : predictedRisk >= 35 ? 'medium' : 'low';

    return {
        predictedRisk,
        riskBand,
        modelVersion: MODEL_VERSION,
        drivers: {
            bugRegressionPressure: normalizedBugPressure,
            complexityPressure: normalizedComplexity,
            churnPressure: normalizedChurn,
            commitPressure: normalizedCommitPressure
        }
    };
};

export const recordDebtSnapshot = (input) => {
    const prediction = predictDebtRisk(input);

    db.prepare(`
        INSERT INTO technical_debt_snapshots
            (repo_name, module_path, commit_count, bug_regression_count, complexity_score, churn_score, predicted_risk, risk_band, model_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        input.repoName,
        input.modulePath,
        input.commitCount || 0,
        input.bugRegressionCount || 0,
        input.complexityScore || 0,
        input.churnScore || 0,
        prediction.predictedRisk,
        prediction.riskBand,
        prediction.modelVersion
    );

    return prediction;
};

export const getDebtHotspots = ({ repoName, limit = 20 } = {}) => {
    const params = [];
    const where = repoName ? 'WHERE repo_name = ?' : '';
    if (repoName) params.push(repoName);

    return db.prepare(`
        SELECT repo_name, module_path, commit_count, bug_regression_count, complexity_score,
               churn_score, predicted_risk, risk_band, created_at
        FROM technical_debt_snapshots
        ${where}
        ORDER BY predicted_risk DESC, created_at DESC
        LIMIT ?
    `).all(...params, limit);
};
