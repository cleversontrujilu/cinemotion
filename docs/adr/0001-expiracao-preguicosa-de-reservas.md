# Expiração preguiçosa de Reservas, sem job agendado

Uma Reserva pendente expira 10 minutos após a criação, mas nenhum processo em segundo plano a encerra. Toda leitura trata `status = 'pending' AND expires_at <= now()` como expirada. A transação que cria uma nova Reserva marca como `expired` e libera (`released_at`) as Reservas vencidas **da mesma Sessão** antes de inserir. Escolhemos isso por economia: a API roda em AWS Lambda, e um job no EventBridge rodando a cada minuto custaria execuções contínuas sem trazer correção extra, já que mesmo com ele a verificação na leitura continuaria necessária por causa do intervalo entre execuções.

## Consequences

- O banco pode conter Reservas `pending` vencidas há muito tempo. Isso é esperado: o status gravado é um registro tardio, não a verdade.
- Não use `status` sozinho em nenhuma consulta. Mapa de ocupação, "minhas reservas", confirmação e cancelamento precisam aplicar a regra do prazo.
- O índice único parcial (`released_at IS NULL`) só fica correto porque a transação de reserva libera as vencidas da Sessão antes do INSERT.
