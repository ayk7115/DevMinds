import path from 'path';
import fs from 'fs';
import os from 'os';

const projectRoot = path.resolve();

const expandHome = (value) => {
    if (!value?.startsWith('~')) return value;
    return path.join(os.homedir(), value.slice(1));
};

const resolveFromProject = (value, fallback) => {
    const candidate = expandHome(value?.trim() || fallback);
    return path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot, candidate);
};

export const runtimeConfig = {
    projectRoot,
    databasePath: resolveFromProject(process.env.DATABASE_URL, './devmind.sqlite'),
    runtimeDir: resolveFromProject(process.env.DEVMIND_RUNTIME_DIR, '.devmind-runtime'),
    openclawPath: resolveFromProject(process.env.DEVMIND_OPENCLAW_PATH, 'node_modules/.bin/openclaw'),
    localModel: process.env.DEVMIND_LOCAL_MODEL?.trim() || process.env.OLLAMA_FAST_MODEL?.trim() || 'ollama/llama3'
};

export const ensureDirectory = (dirPath) => {
    fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    return dirPath;
};

export const createRuntimeRunDir = (prefix = 'agent-run') => {
    ensureDirectory(runtimeConfig.runtimeDir);
    const runDir = fs.mkdtempSync(path.join(runtimeConfig.runtimeDir, `${prefix}-`));
    fs.chmodSync(runDir, 0o700);
    return runDir;
};
