# Reload Schema

O schema vem das migrations em `api/migrations/` (o pgModeler em `docs/model/` é só o diagrama de referência).

Recriar o banco local do zero (DROP/CREATE, migrations, senhas de dev dos roles e seed):

```bash
cp api/.env.example api/.env   # primeira vez
npm run db:reset -w api
```

Outros comandos:

```bash
npm run db:migrate -w api        # aplica migrations pendentes
npm run db:migrate:down -w api   # desfaz a última
npm run db:seed -w api           # recarrega só os dados de exemplo
```
