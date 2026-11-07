import serverless from 'serverless-http';
import { createAdminApp } from '../apps/admin.js';
import { loadDbConfig } from '../config/env.js';
import { createPool } from '../shared/db/pool.js';

// Fora do handler: o pool é reaproveitado enquanto a instância da Lambda viver.
const pool = createPool(loadDbConfig(process.env));

export const handler = serverless(createAdminApp({ pool }));
