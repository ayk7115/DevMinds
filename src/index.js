import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import webhookRoutes from './routes/webhooks.js';
import chatRoutes from './routes/chat.js';
import analyzeRepoRoutes from './routes/analyzeRepo.js';
import historyRoutes from './routes/history.js';
import enterpriseRoutes from './routes/enterprise.js';
import integrationRoutes from './routes/integrations.js';
import repositoryRoutes from './routes/repository.js';
import { createRateLimit } from './middleware/rateLimit.js';

import { analyzeRepository } from './services/repoAnalyzer.js';
import { startHeartbeat } from './services/heartbeatService.js';
import { registerEnterpriseSocketHandlers } from './services/enterprise/liveWalkthrough.js';
import { startTelegramBot } from './services/telegramBot.js';
import path from 'path';

// Initialize Express application
const app = express();
const PORT = process.env.PORT || 3000;
const chatRateLimit = createRateLimit({ windowMs: 60000, max: 20, message: 'Chat is rate limited. Please wait a moment before sending more messages.' });
const repoAnalysisRateLimit = createRateLimit({ windowMs: 300000, max: 5, message: 'Repository analysis is rate limited. Please wait before scanning another repository.' });

// Security Middlewares
app.use(helmet()); // Basic security headers

const configuredFrontendOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const allowedFrontendOrigins = new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredFrontendOrigins
]);

// Strict CORS Configuration - accepts local Vite origins by default.
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedFrontendOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by DevMind CORS.`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-hub-signature-256'],
    credentials: true,
};
app.use(cors(corsOptions));

// Built-in middleware for parsing JSON with a limit to avoid large payload attacks
// We also need raw body for GitHub signature verification, so we capture it
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Mount Routes
app.use('/api/webhooks', webhookRoutes);
app.use('/api/chat', chatRateLimit, chatRoutes);
app.use('/api/analyze-repo', repoAnalysisRateLimit, analyzeRepoRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/repository', repositoryRoutes);


// Architecture API (Phase 2)
app.get('/api/architecture', (req, res) => {
    try {
        const rootPath = path.resolve(); // Root of the project
        const analysis = analyzeRepository(rootPath);
        res.status(200).json(analysis);
    } catch (error) {
        console.error('[API] Architecture analysis failed:', error);
        res.status(500).json({ error: 'Failed to analyze repository' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', service: 'devmind-backend' });
});

// Initialize HTTP Server for Socket.IO attachment
const server = http.createServer(app);

// Initialize Socket.IO server
const io = new Server(server, {
    cors: corsOptions
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log(`[Socket.IO] New client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

registerEnterpriseSocketHandlers(io);

// Attach io instance to the app so routes/services can access it
app.set('io', io);

// Start the Weekly Digest Cron
startHeartbeat();

// Start the server
server.listen(PORT, () => {
    console.log(`[Server] DevMind Backend running on http://localhost:${PORT}`);
    console.log(`[Socket.IO] Real-time engine ready.`);
    
    // Start Interactive Telegram Agent
    startTelegramBot();
});
