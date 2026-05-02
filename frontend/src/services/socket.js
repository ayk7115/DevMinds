import { io } from 'socket.io-client';

// Connect to the Node.js backend
// In production, this would be an environment variable
const SOCKET_URL = 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
});
