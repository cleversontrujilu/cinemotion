import { describe, expect, it } from 'vitest';
import { jwtTokenService } from '../../../src/modules/identity/infrastructure/jwt-token-service.js';
import { fixedClock } from '../../../src/shared/domain/clock.js';

const config = { secret: 'segredo-de-teste-com-pelo-menos-32-caracteres', ttlSeconds: 600 };
const user = { id: '0190f0e0-0000-7000-8000-000000000001', email: 'ana@email.com', role: 'customer' as const };

describe('jwtTokenService', () => {
  it('valida o próprio token e devolve o usuário', async () => {
    const service = jwtTokenService('customer', config);
    const { accessToken, tokenType, expiresIn } = await service.issue(user);

    expect(tokenType).toBe('Bearer');
    expect(expiresIn).toBe(600);
    await expect(service.verify(accessToken)).resolves.toEqual(user);
  });

  it('rejeita token da outra audiência, mesmo com o mesmo segredo', async () => {
    const admin = jwtTokenService('admin', config);
    const customer = jwtTokenService('customer', config);
    const { accessToken } = await admin.issue({ ...user, role: 'admin' });

    await expect(customer.verify(accessToken)).rejects.toMatchObject({ code: 'invalid-token' });
  });

  it('rejeita token assinado com outro segredo', async () => {
    const other = jwtTokenService('customer', { ...config, secret: 'outro-segredo-com-pelo-menos-32-caracteres!' });
    const { accessToken } = await other.issue(user);

    await expect(jwtTokenService('customer', config).verify(accessToken)).rejects.toMatchObject({
      code: 'invalid-token',
    });
  });

  it('rejeita token expirado', async () => {
    const issuedAt = '2030-01-01T12:00:00Z';
    const { accessToken } = await jwtTokenService('customer', config, fixedClock(issuedAt)).issue(user);
    const later = jwtTokenService('customer', config, fixedClock('2030-01-01T12:10:01Z'));

    await expect(later.verify(accessToken)).rejects.toMatchObject({
      code: 'invalid-token',
      message: 'Token expirado.',
    });
  });

  it('rejeita lixo', async () => {
    await expect(jwtTokenService('customer', config).verify('abc.def.ghi')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });
});
