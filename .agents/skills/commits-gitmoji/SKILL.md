---
name: commits-gitmoji
description: Padroniza mensagens de commit com Gitmoji e português brasileiro.
---

# Commits com Gitmoji em português

Use estas regras sempre que criar, sugerir ou revisar uma mensagem de commit neste projeto.

## Formato

`<gitmoji> <descrição curta em português, no imperativo>`

Exemplos:

- `✨ Adiciona cadastro de contatos`
- `🐛 Corrige validação do formulário de clientes`
- `♻️ Refatora consulta de empresas`
- `📝 Atualiza instruções de instalação`
- `🧪 Adiciona testes para criação de clientes`
- `🔥 Remove código não utilizado`

## Regras

- NUNCA faça o commit antes de o usuário validar a implementação; apenas prepare e sugira a mensagem e aguarde o aval explícito.
- Escreva toda a mensagem em português, inclusive o corpo, se houver. Preserve nomes próprios, identificadores e termos técnicos que não tenham tradução natural.
- Comece com um único Gitmoji adequado à mudança, seguido de um espaço.
- Descreva a mudança de forma clara, concisa e específica; prefira verbo no presente do indicativo (por exemplo, `Adiciona`, `Corrige`, `Atualiza`).
- Não inclua ponto final no título.
- Se necessário, acrescente um corpo separado por linha em branco, também em português, explicando contexto ou impacto. Não repita o título.
- Para mudanças de tipos diferentes sem relação entre si, prefira commits separados.
- Não invente escopo, número de issue ou impacto que não esteja confirmado.

## Gitmojis comuns

| Gitmoji | Uso                                                    |
| ------- | ------------------------------------------------------ |
| ✨      | Nova funcionalidade                                    |
| 🐛      | Correção de bug                                        |
| 📝      | Documentação                                           |
| 🎨      | Formatação ou estrutura visual sem alteração funcional |
| ♻️      | Refatoração sem mudança de comportamento               |
| 🧪      | Testes                                                 |
| ⚡️      | Melhoria de desempenho                                 |
| 🔒      | Segurança                                              |
| 🔧      | Configuração ou ferramentas                            |
| 🚀      | Implantação ou entrega                                 |
| 🔥      | Remoção de código ou arquivos                          |

Escolha o símbolo que melhor representa a intenção principal do commit; não use Gitmoji apenas como decoração.
