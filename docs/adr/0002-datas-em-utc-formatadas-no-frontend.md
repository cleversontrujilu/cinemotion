# Datas trafegam em UTC e são formatadas no frontend, no fuso da rede

A API não formata data e hora para exibição. Os horários são gravados em `timestamptz`, as respostas trazem ISO 8601 em UTC (`2030-01-01T22:00:00.000Z`), e os frontends convertem para o fuso da rede (`America/Sao_Paulo`) na hora de mostrar. Na entrada, a API exige o fuso explícito (`2030-01-01T19:00:00-03:00`) e recusa data/hora sem offset, porque "19:00" sozinho não diz de qual fuso é. Escolhemos isso para manter a API como contrato de dados, não de apresentação: um instante em UTC é inequívoco e ordenável como texto, e serializar com offset local exigiria tabela de fusos no backend só para decidir a exibição, que é papel do frontend.

## Considered Options

- **Responder com o offset da rede (`-03:00`).** Mais legível no JSON cru, mas o `Date` do JavaScript só serializa em UTC. Formatar com offset de outro fuso exige `Intl` ou uma biblioteca de fusos no backend, e o offset mudaria se o horário de verão voltar. Nada disso muda o instante, só a aparência.
- **Responder com horário local sem offset (`2030-01-01T19:00:00`).** Rejeitado: é ambíguo e quebra se algum dia a rede tiver cinemas em outro fuso (hoje fora do escopo).

## Consequences

- **O frontend formata sempre no fuso da rede, nunca no do navegador.** Use `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ... })`. Um cliente com o navegador em outro fuso precisa ver o horário do cinema ("19:00"), não o convertido para o fuso dele.
- **O frontend envia datas com offset.** O formulário de Sessão do admin monta o ISO com `-03:00` (ou converte para UTC) antes de enviar.
- **O "dia" continua sendo calculado na API.** O filtro `date=YYYY-MM-DD` da listagem é o Dia da Sessão no fuso da rede, não o dia em UTC: uma Sessão às 23:30 em Brasília pertence ao próprio dia, mesmo já sendo o dia seguinte em UTC. O frontend manda a data do calendário como está, sem converter.
- O fuso da rede fica numa configuração só (`APP_TIMEZONE` na API e uma constante compartilhada nos frontends). Se mudar, os dois lados mudam juntos.
