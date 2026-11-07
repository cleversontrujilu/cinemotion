# Cinemotion

Venda de assentos para sessões de uma rede de cinemas, garantindo que um assento nunca seja vendido duas vezes.

## Salas e programação

**Sala** (`theater`):
Espaço físico de exibição com um mapa fixo de assentos. Nunca designa o cinema ou a rede.
_Avoid_: Cinema, auditório, room

**Assento** (`seat`):
Posição física de uma Sala, identificada por fileira e número (ex.: A1).
_Avoid_: Lugar, cadeira

**Mapa de assentos**:
Conjunto fixo de Assentos de uma Sala (fileiras × números), definido na criação da Sala e nunca alterado depois.
_Avoid_: Layout, planta

**Acessível**:
Característica física de um Assento. É uma marcação, não um estado de ocupação.

**Em manutenção**:
Assento retirado de uso na Sala. Impede novas Reservas dele em qualquer Sessão; Reservas e Vendas já existentes continuam valendo.
_Avoid_: Bloqueado, desativado

**Filme** (`movie`):
Obra exibida, com uma duração em minutos.

**Sessão** (`session`):
Exibição de um Filme em uma Sala, com início e preço definidos.
_Avoid_: Horário, exibição

**Preço da Sessão**:
Valor único cobrado por Assento naquela Sessão, sem variação por tipo de Assento ou de Cliente.
_Avoid_: Valor do ingresso

**Fim da Sessão**:
Momento em que a Sala volta a ficar livre: início + duração do Filme + 15 minutos de limpeza. Fixado quando a Sessão é criada.
_Avoid_: Fim do filme

**Dia da Sessão**:
Data do início da Sessão no fuso horário único da rede (Brasília).

**Sessão iniciada**:
Sessão cujo horário de início já chegou. Não aceita novas Reservas.

**Sessão futura**:
Sessão cujo início ainda não chegou.

## Reservas e vendas

**Reserva** (`reservation`):
Retenção de 1 a 6 Assentos de uma Sessão por um Cliente. Fica pendente até ser confirmada, cancelada ou expirar. Um Cliente pode ter várias Reservas na mesma Sessão.
_Avoid_: Pedido, booking

**Reserva pendente**:
Reserva ainda não paga e dentro do prazo de 10 minutos.

**Venda**:
Reserva com pagamento confirmado. Não existe uma entidade Ingresso separada.
_Avoid_: Ingresso, ticket, compra

**Reserva expirada**:
Reserva pendente que passou do prazo de 10 minutos sem ser confirmada, mesmo que ainda não tenha sido marcada assim. Seus Assentos voltam a ficar livres.

**Confirmação**:
Pagamento (simulado) que transforma uma Reserva pendente em Venda. Aceita enquanto a Reserva estiver no prazo, mesmo com a Sessão já iniciada.

**Cancelamento**:
Encerramento de uma Reserva (pendente ou Venda) pelo próprio Cliente, permitido até 2 horas antes do início da Sessão, inclusive.

**Estado do Assento**:
Situação de um Assento em uma Sessão específica: *livre*, *reservado* (em Reserva pendente), *vendido* (em Venda) ou *indisponível* (em manutenção, sem Reserva ativa). Reservado e vendido prevalecem sobre indisponível. É sempre derivado, nunca registrado.
_Avoid_: Status da cadeira

**Mapa de ocupação**:
Estado de todos os Assentos da Sala para uma Sessão.

## Pessoas

**Cliente** (`customer`):
Usuário que faz Reservas. Cadastra-se por conta própria.
_Avoid_: Comprador, user

**Administrador** (`admin`):
Usuário que gerencia Salas, Filmes e Sessões. Não reserva e não cancela Reservas de Clientes. Existe apenas por carga inicial, sem cadastro público.
