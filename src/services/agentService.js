import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import db from '../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Converts a Windows path to a WSL path
 * e.g., C:\Users\name -> /mnt/c/Users/name
 */
const toWslPath = (winPath) => {
    const absolutePath = path.resolve(winPath).replace(/\\/g, '/');
    const driveMatch = absolutePath.match(/^([a-zA-Z]):/);
    if (driveMatch) {
        const drive = driveMatch[1].toLowerCase();
        return `/mnt/${drive}${absolutePath.substring(2)}`;
    }
    return absolutePath;
};

/**
 * Agent Service (Phase 2)
 * Orchestrates the execution of OpenClaw on Ubuntu via WSL.
 */
export const processPullRequest = async (prData, io) => {
    console.log(`[AgentService] Initializing OpenClaw execution for PR: ${prData.title}`);

    // Read prompt files directly
    const soulPath = path.join(__dirname, '../agent/SOUL.md');
    const skillPath = path.join(__dirname, '../agent/SKILL.md');
    
    const soulContent = fs.readFileSync(soulPath, 'utf-8');
    const skillContent = fs.readFileSync(skillPath, 'utf-8');

    // Emit event to frontend
    if (io) {
        io.emit('agent:status', {
            status: 'initializing',
            message: 'Waking up the Strategic Twin on Ubuntu...',
            prId: prData.id
        });
    }

    return new Promise((resolve, reject) => {
        const nodePath = '/home/aadi/.nvm/versions/node/v22.22.2/bin/node';
        const openclawPath = '/home/aadi/.nvm/versions/node/v22.22.2/bin/openclaw';
        
        // Construct the full prompt context
        const fullPrompt = `${soulContent}\n\n${skillContent}\n\nAnalyze this PR Diff URL and output a readinessScore, summary, architecturalImpact, and securityRisks in JSON format:\nPR Title: ${prData.title}\nDiff URL: ${prData.diff_url}`;

        // To prevent Windows WSL from treating newlines as separate commands,
        // we write the prompt and a runner script to disk, then execute the script.
        const promptFilePath = path.join(__dirname, '../agent/temp_prompt.txt');
        const scriptFilePath = path.join(__dirname, '../agent/temp_runner.sh');
        
        fs.writeFileSync(promptFilePath, fullPrompt);
        
        const bashScript = `#!/bin/bash
PROMPT=$(cat "${toWslPath(promptFilePath)}")
"${nodePath}" "${openclawPath}" infer model run --local --json --prompt "$PROMPT"
`;
        fs.writeFileSync(scriptFilePath, bashScript);

        const args = ['bash', toWslPath(scriptFilePath)];

        console.log(`[AgentService] Spawning WSL process: wsl ${args.join(' ')}`);

        const child = spawn('wsl', args);

        let fullOutput = '';

        // Capture real-time stream from OpenClaw
        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            fullOutput += chunk;
            
            // Stream token-by-token to the frontend for a "typing" effect
            if (io) {
                io.emit('agent:stream', {
                    prId: prData.id,
                    chunk: chunk
                });
            }
        });

        child.stderr.on('data', (data) => {
            console.error(`[OpenClaw Error]: ${data}`);
        });

        child.on('close', (code) => {
            console.log(`[AgentService] OpenClaw process exited with code ${code}`);

            if (code !== 0) {
                if (io) io.emit('agent:error', { message: 'OpenClaw execution failed.', prId: prData.id });
                return reject(new Error(`OpenClaw exited with code ${code}`));
            }

            // Simple parsing of the output (in production, use structured JSON from OpenClaw)
            // Here we mock the extraction logic
            const insight = {
                readinessScore: 80, // Mocked score
                summary: "Analysis complete. The PR is architecturally sound.",
                architecturalImpact: "Medium",
                securityRisks: "Low",
                rawOutput: fullOutput
            };

            // Persist the results to SQLite
            try {
                const stmt = db.prepare(`
                    INSERT INTO insights (pr_id, repo_name, author, title, readiness_score, summary, architectural_impact, security_risks, raw_output)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                stmt.run(
                    prData.id.toString(), 
                    prData.repo, 
                    prData.author, 
                    prData.title, 
                    insight.readinessScore, 
                    insight.summary, 
                    insight.architecturalImpact, 
                    insight.securityRisks, 
                    insight.rawOutput
                );
                console.log('[Database] Insight persisted for PR:', prData.id);
            } catch (dbError) {
                console.error('[Database] Error saving insight:', dbError);
            }

            // Emit final completion event
            if (io) {
                io.emit('agent:complete', {
                    status: 'complete',
                    prId: prData.id,
                    insights: insight
                });
            }

            resolve(insight);
        });

        child.on('error', (err) => {
            console.error('[AgentService] Failed to start WSL process:', err);
            reject(err);
        });
    });
};
