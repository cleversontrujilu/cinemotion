import { describe, expect, it } from 'vitest';
import { registerCustomer } from '../../../src/modules/identity/application/register-customer.js';
import { fakeHasher, inMemoryUsers } from './fakes.js';

describe('registerCustomer', () => {
  it('cria sempre customer, com e-mail normalizado e senha com hash', async () => {
    const { repo, users } = inMemoryUsers();
    const user = await registerCustomer({ users: repo, hasher: fakeHasher })({
      email: ' Novo@Email.COM ',
      password: 'Senha@123',
    });

    expect(user).toEqual({ id: 'user-1', email: 'novo@email.com', role: 'customer' });
    expect(users[0]?.passwordHash).toBe('hashed:Senha@123');
  });

  it('não devolve o hash da senha', async () => {
    const { repo } = inMemoryUsers();
    const user = await registerCustomer({ users: repo, hasher: fakeHasher })({
      email: 'a@b.com',
      password: 'Senha@123',
    });
    expect(user).not.toHaveProperty('passwordHash');
  });
});
