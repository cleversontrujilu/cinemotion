import serverless from 'serverless-http';
import { createCustomerApp } from '../apps/customer.js';
import { loadAuthConfig, loadDbConfig } from '../config/env.js';
import { createPool } from '../shared/db/pool.js';

// Fora do handler: config e pool são reaproveitados enquanto a instância da Lambda viver.
const db = loadDbConfig(process.env);
const pool = createPool(db);
const auth = loadAuthConfig(process.env);

export const handler = serverless(createCustomerApp({ pool, auth, timezone: db.timezone }));
