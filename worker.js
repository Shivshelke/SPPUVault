/**
 * worker.js — Cloudflare Worker Entrypoint
 * Bridges the Express application into Cloudflare Workers runtime via httpServerHandler.
 */
import { httpServerHandler } from 'cloudflare:node';
import app from './server.js';

export default httpServerHandler(app);
