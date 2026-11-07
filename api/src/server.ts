/**
 * Servidor local de desenvolvimento: sobe as duas APIs, cada uma com o role do seu papel.
 * Uso: npm run dev -w api (lê api/.env)
 */
import { createAdminApp } from './apps/admin.js';
import { createCustomerApp } from './apps/customer.js';
import { loadDbConfig } from './config/env.js';
import { createPool } from './shared/db/pool.js';

const env = process.env;
const customerPort = Number(env.CUSTOMER_PORT ?? 3000);
const adminPort = Number(env.ADMIN_PORT ?? 3001);

const customerPool = createPool(loadDbConfig(env, 'CUSTOMER_DATABASE_URL'));
const adminPool = createPool(loadDbConfig(env, 'ADMIN_DATABASE_URL'));

const servers = [
  createCustomerApp({ pool: customerPool }).listen(customerPort, () =>
    console.log(`API cliente em http://localhost:${customerPort}`),
  ),
  createAdminApp({ pool: adminPool }).listen(adminPort, () =>
    console.log(`API admin   em http://localhost:${adminPort}`),
  ),
];

async function shutdown(): Promise<void> {
  servers.forEach((server) => server.close());
  await Promise.all([customerPool.end(), adminPool.end()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
