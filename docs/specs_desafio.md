# Desafio Técnico





## Proposta: 

Desenvolver uma API REST para gerenciar salas, filmes, sessões e reservas de assentos de uma rede de cinemas. O sistema deve garantir que um assento nunca seja vendido duas vezes, mesmo com vários usuários tentando reservá-lo ao mesmo tempo. 



## Especificações técnicas
A stack principal da empresa é C# (.NET) e Angular.
Caso prefira outra linguagem, sinta-se à vontade, mas justifique a escolha no README.
Banco de dados relacional (PostgreSQL, SQL Server ou MySQL), com migrations versionadas.
Documentação da API com OpenAPI/Swagger.
Será um diferencial realizar o deploy da aplicação, você pode usar ferramentas gratuitas como Vercel ou semelhantes.

## Funcionalidades obrigatórias

Gestão de salas: cadastrar salas com mapa de assentos (fileiras e números, ex.: A1 a J12). Alguns assentos podem ser marcados como indisponíveis (manutenção) ou acessíveis.
Gestão de filmes e sessões: cadastrar filmes (com duração) e sessões (filme, sala, data/hora, preço).
Listagem de sessões: listar sessões futuras com filtros por filme, data e sala, com paginação.
Mapa de ocupação: consultar o estado de cada assento de uma sessão (livre, reservado, vendido, indisponível).
Reserva de assentos: reservar um ou mais assentos de uma sessão em uma única operação.
Confirmação e cancelamento: confirmar o pagamento (simulado) de uma reserva ou cancelá-la.

## Regras de negócio

Uma sessão não pode se sobrepor a outra na mesma sala, considerando a duração do filme mais 15 minutos de limpeza.
Uma reserva fica pendente por 10 minutos. Se não for confirmada nesse prazo, os assentos voltam a ficar livres.
Uma reserva pode ter no máximo 6 assentos.
A operação é atômica: ou todos os assentos são reservados, ou nenhum.
Não é possível reservar assentos de sessões que já começaram.
Cancelamentos são permitidos até 2 horas antes do início da sessão.
Concorrência: duas requisições simultâneas para o mesmo assento devem resultar em
exatamente uma reserva bem-sucedida. A outra deve receber um erro claro (ex.: HTTP
409).

## Requisitos de qualidade

Testes unitários das regras de negócio.
Pelo menos um teste de integração que comprove a regra de concorrência.
Respostas de erro padronizadas (ex.: Problem Details, RFC 9457), com códigos HTTP
corretos.
Validação de entrada em todos os endpoints.
Autenticação simples (JWT) separando dois perfis: administrador (gerencia salas, filmes e
sessões) e cliente (reserva).

## Entrega

Data de entrega: [11/11/2026]

Deve ser realizada por email, com:

Código em repositório público (GitHub, GitLab etc.), com histórico de commits que mostre a evolução do trabalho.

## README 

**Com instruções para rodar a aplicação e os testes.**

Seção no README com: premissas assumidas, decisões técnicas e o que ficou de fora (e por quê algo ficou de fora).
Scripts ou migrations de criação do banco e dados de exemplo (seed).
Collection (Postman, Insomnia ou arquivo .http) com os principais fluxos.
Em caso de dúvidas, pode enviar no e-mail.