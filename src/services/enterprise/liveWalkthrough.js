import { edgeResourceManager } from './edgeResourceManager.js';
import { scanTextForVulnerabilities } from './sastScanner.js';

const activeSockets = new Map();

const walkthroughPrompt = ({ title, code, findings }) => `
You are DevMind explaining a selected changelog node to a non-technical PM.
Explain business impact, user-visible behavior, deployment risk, and what an engineer should verify.
Avoid jargon unless you immediately define it.

Node title: ${title || 'Selected code block'}

SAST signals:
${findings.length ? findings.map(f => `- ${f.severity}: ${f.message}`).join('\n') : '- No lightweight SAST findings in this selection.'}

Code or diff selection:
${code}
`.trim();

export const registerEnterpriseSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        activeSockets.set(socket.id, { startedAt: Date.now(), walkthroughs: 0 });

        socket.on('agent:walkthrough:ask', async (payload = {}) => {
            const state = activeSockets.get(socket.id) || { walkthroughs: 0 };
            state.walkthroughs += 1;
            activeSockets.set(socket.id, state);

            if (state.walkthroughs > 20) {
                socket.emit('agent:walkthrough:error', { message: 'Walkthrough rate limit reached for this session.' });
                return;
            }

            const { nodeId, title, code = '', filePath = 'selection.diff', prId = 'adhoc' } = payload;
            const findings = scanTextForVulnerabilities({ filePath, content: code, prId });
            const prompt = walkthroughPrompt({ title, code: code.slice(0, 9000), findings });

            socket.emit('agent:walkthrough:start', { nodeId, prId, findings });

            try {
                let full = '';
                await edgeResourceManager.stream(prompt, (chunk) => {
                    full += chunk;
                    socket.emit('agent:walkthrough:chunk', { nodeId, prId, chunk });
                }, { interactive: true });

                socket.emit('agent:walkthrough:complete', { nodeId, prId, text: full, findings });
            } catch (error) {
                socket.emit('agent:walkthrough:error', { nodeId, prId, message: error.message });
            }
        });

        socket.on('disconnect', () => {
            activeSockets.delete(socket.id);
        });
    });
};
