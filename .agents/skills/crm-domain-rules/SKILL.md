---
name: crm-domain-rules
description: Preserva as regras de negócio e a integridade dos dados de clientes e contatos neste CRM.
---

# Regras de domínio do CRM

Use ao alterar fluxos, telas, endpoints ou dados de clientes e contatos.

## Contexto atual

- Um cliente representa uma empresa; um contato pertence a um cliente por `client_id`.
- Um cliente pode ter vários contatos. O schema define `contacts.client_id` como obrigatório e exclui os contatos em cascata quando o cliente é removido.
- O nome da empresa é obrigatório e o cliente pode ser salvo sem contatos; contato é opcional e um cartão sem nome não é persistido. Os demais campos, inclusive aniversário, são opcionais.
- O campo `is_primary` identifica um contato principal, mas o schema atual não garante que exista exatamente um por cliente.
- Não assuma regras não implementadas, como unicidade de CNPJ/e-mail, obrigatoriedade de contato principal ou restrições de exclusão lógica.

## Orientações

- Antes de mudar uma regra, inspecione schema, endpoints e formulários afetados. Mantenha validação coerente no servidor e na interface; a validação do cliente não substitui a do servidor.
- Preserve associações: contatos criados junto com um cliente devem receber o ID do cliente correto; mudanças em relações devem tratar transações e erros sem deixar dados parciais.
- Trate valores opcionais de forma consistente (`null`/vazio) e não descarte dados existentes inadvertidamente em atualizações parciais.
- Ao introduzir uma nova regra, explicite seu comportamento para registros existentes e atualize schema/validação e testes relevantes.
- Em regras de validação baseadas em regex, use constantes nomeadas pelo padrão validado (por exemplo, `taxIdPattern` ou `isoTimestampPattern`), não regex inline.
- Formate chamadas encadeadas/estilo funcional com uma chamada por linha, seguindo `src/lib/task-date.ts`.
- Não altere a semântica de exclusão em cascata nem introduza restrições de unicidade sem confirmar os requisitos e avaliar dados existentes.

## Verificação

Cubra casos válidos, campos obrigatórios ausentes, valores opcionais, contatos associados e limites entre clientes. Execute as verificações disponíveis no projeto, como `npm run lint` e `npm run build`.
