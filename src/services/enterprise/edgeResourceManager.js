const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

const MODEL_PROFILES = [
    {
        name: process.env.OLLAMA_FAST_MODEL || 'llama3.1:8b-instruct-q4_K_M',
        maxVramGb: 6,
        maxPromptChars: 18000,
        numCtx: 4096,
        numGpu: 28,
        useCase: 'webhook-fast-path'
    },
    {
        name: process.env.OLLAMA_TINY_MODEL || 'phi3:mini-4k-instruct-q4_K_M',
        maxVramGb: 4,
        maxPromptChars: 10000,
        numCtx: 3072,
        numGpu: 20,
        useCase: 'interactive-walkthrough'
    }
];

class EdgeResourceManager {
    constructor() {
        this.queue = [];
        this.active = 0;
        this.maxConcurrent = Number(process.env.DEVMIND_LLM_CONCURRENCY || 1);
    }

    selectProfile({ promptChars = 0, interactive = false } = {}) {
        if (interactive) return MODEL_PROFILES[1];
        return MODEL_PROFILES.find(profile => promptChars <= profile.maxPromptChars) || MODEL_PROFILES[1];
    }

    async enqueue(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.drain();
        });
    }

    drain() {
        if (this.active >= this.maxConcurrent || this.queue.length === 0) return;
        const item = this.queue.shift();
        this.active += 1;
        item.task()
            .then(item.resolve)
            .catch(item.reject)
            .finally(() => {
                this.active -= 1;
                this.drain();
            });
    }

    async infer(prompt, options = {}) {
        const profile = this.selectProfile({ promptChars: prompt.length, interactive: options.interactive });
        const body = {
            model: options.model || profile.name,
            prompt: prompt.slice(0, profile.maxPromptChars),
            stream: false,
            options: {
                num_ctx: options.numCtx || profile.numCtx,
                num_gpu: options.numGpu || profile.numGpu,
                temperature: options.temperature ?? 0.2,
                num_predict: options.numPredict || 900
            }
        };

        return this.enqueue(async () => {
            const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!response.ok) throw new Error(`Ollama inference failed: ${response.status}`);
            const json = await response.json();
            return json.response || '';
        });
    }

    async stream(prompt, onChunk, options = {}) {
        const profile = this.selectProfile({ promptChars: prompt.length, interactive: true });
        return this.enqueue(async () => {
            const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: options.model || profile.name,
                    prompt: prompt.slice(0, profile.maxPromptChars),
                    stream: true,
                    options: {
                        num_ctx: options.numCtx || profile.numCtx,
                        num_gpu: options.numGpu || profile.numGpu,
                        temperature: options.temperature ?? 0.25,
                        num_predict: options.numPredict || 700
                    }
                })
            });

            if (!response.ok) throw new Error(`Ollama streaming failed: ${response.status}`);

            let full = '';
            const decoder = new TextDecoder();
            for await (const raw of response.body) {
                const text = decoder.decode(raw, { stream: true });
                for (const line of text.split('\n').filter(Boolean)) {
                    const json = JSON.parse(line);
                    const chunk = json.response || '';
                    full += chunk;
                    onChunk?.(chunk);
                }
            }
            return full;
        });
    }
}

export const edgeResourceManager = new EdgeResourceManager();
export { MODEL_PROFILES };
