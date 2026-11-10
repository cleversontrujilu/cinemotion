# Cinemotion

## Codebase Overview

API REST de reservas de assentos de cinema que nunca vende o mesmo assento duas vezes, mesmo sob concorrência. Um único código gera duas APIs Express (cliente em `/api`, admin em `/api/admin`), cada uma com seu papel no banco e seu segredo/audience JWT, mais dois sites Nuxt estáticos que estendem uma camada compartilhada.

**Stack**: Node 22 + TypeScript, Express 5 (`serverless-http` para Lambda), PostgreSQL 18 (`uuidv7()`), node-pg-migrate em SQL puro, zod, jose (JWT HS256), Vitest + Supertest + Testcontainers, Nuxt 4 + Nuxt UI 4 + Tailwind 4, OpenTofu (planejado).

**Structure**: workspaces npm `api/` (módulos `identity`, `catalog`, `booking` em camadas domain/application/infrastructure/http) e `web/{shared,customer,admin}`; docs em `docs/` (swagger, ADRs, decisões técnicas), vocabulário em `GLOSSARY.md`, coleções em `http/`, infra em `infra/`.

Regras que mais pegam: expiração de reserva é preguiçosa (nunca filtre só por `reservation.status`), toda regra de tempo usa o `now()` do banco, nomes de constraints são contrato do tradutor de erros, e `docs/swagger.yaml` precisa casar exatamente com as rotas Express.

For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).
