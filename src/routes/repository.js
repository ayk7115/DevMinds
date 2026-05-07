import express from 'express';
import path from 'path';
import {
    explainRepositoryFile,
    getRepositoryFileList,
    getRepositoryOverview,
    readRepositoryFile
} from '../services/repositoryExplorer.js';

const router = express.Router();
const projectRoot = path.resolve();

const handleExplorerError = (res, error) => {
    const status = error.status || 500;
    if (status >= 500) {
        console.error('[RepositoryRoute] Request failed:', error);
    }
    res.status(status).json({ error: error.message || 'Repository request failed.' });
};

router.get('/overview', (req, res) => {
    try {
        res.status(200).json(getRepositoryOverview(projectRoot));
    } catch (error) {
        handleExplorerError(res, error);
    }
});

router.get('/files', (req, res) => {
    try {
        res.status(200).json(getRepositoryFileList(projectRoot));
    } catch (error) {
        handleExplorerError(res, error);
    }
});

router.get('/file', (req, res) => {
    try {
        if (!req.query.path) {
            return res.status(400).json({ error: 'path query parameter is required.' });
        }
        res.status(200).json(readRepositoryFile(projectRoot, req.query.path));
    } catch (error) {
        handleExplorerError(res, error);
    }
});

router.get('/explain', (req, res) => {
    try {
        if (!req.query.path) {
            return res.status(400).json({ error: 'path query parameter is required.' });
        }
        res.status(200).json(explainRepositoryFile(projectRoot, req.query.path));
    } catch (error) {
        handleExplorerError(res, error);
    }
});

router.get('/security', (req, res) => {
    try {
        const overview = getRepositoryOverview(projectRoot);
        res.status(200).json({
            repoName: overview.repoName,
            generatedAt: overview.generatedAt,
            summary: overview.securitySummary,
            risks: overview.risks,
            vulnerabilities: overview.vulnerabilities
        });
    } catch (error) {
        handleExplorerError(res, error);
    }
});

export default router;

