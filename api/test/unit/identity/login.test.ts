import { describe, expect, it, vi } from 'vitest';
import { login } from '../../../src/modules/identity/application/login.js';
import type { TokenIssuer } from '../../../src/modules/identity/domain/ports.js';
import { DomainError } from '../../../src/shared/domain/errors.js';
import { fakeHasher, inMemoryUsers } from './fakes.js';

const tokens: TokenIssuer = {
  issue: vi.fn(async (user) => ({ accessToken: `token-for-${user.id}`, tokenType: 'Bearer' as const, expiresIn: 3600 })),
};

const { repo } = inMemoryUsers([
  { email: 'ana@email.com', password: 'Senha@123', role: 'customer' },
  { email: 'admin@cinemotion.dev', password: 'Senha@123', role: 'admin' },
]);

const customerLogin = login({ role: 'customer', users: repo, hasher: fakeHasher, tokens });

async function expectInvalidCredentials(promise: Promise<unknown>) {
  const err = await promise.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(DomainError);
  expect(err).toMatchObject({ kind: 'unauthorized', code: 'invalid-credentials' });
}

describe('login', () => {
  it('emite token para credencial correta do papel da API', async () => {
    const result = await customerLogin({ email: 'ana@email.com', password: 'Senha@123' });
    expect(result.accessToken).toBe('token-for-user-1');
  });

  it('ignora maiúsculas e espaços no e-mail', async () => {
    await expect(customerLogin({ email: '  ANA@Email.com ', password: 'Senha@123' })).resolves.toBeTruthy();
  });

  it('senha errada é credencial inválida', async () => {
    await expectInvalidCredentials(customerLogin({ email: 'ana@email.com', password: 'errada' }));
  });

  it('e-mail inexistente dá o mesmo erro (não revela cadastro)', async () => {
    await expectInvalidCredentials(customerLogin({ email: 'ninguem@email.com', password: 'Senha@123' }));
  });

  it('usuário de outro papel não entra nesta API', async () => {
    await expectInvalidCredentials(customerLogin({ email: 'admin@cinemotion.dev', password: 'Senha@123' }));
  });

  it('e-mail inexistente ainda passa pela verificação de senha (tempo constante)', async () => {
    const verify = vi.fn(fakeHasher.verify);
    const timed = login({ role: 'customer', users: repo, hasher: { ...fakeHasher, verify }, tokens });
    await timed({ email: 'ninguem@email.com', password: 'x' }).catch(() => {});
    expect(verify).toHaveBeenCalledOnce();
  });
});
