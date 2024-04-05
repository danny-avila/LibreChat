import { io } from 'socket.io-client';

const URL = process.env.SERVER_URL ?? 'http://localhost:3080';

export const socket = io(URL);
