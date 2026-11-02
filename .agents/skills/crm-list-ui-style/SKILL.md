---
name: crm-list-ui-style
description: Mantém as telas de listagem do CRM consistentes com a listagem de contatos.
---

# Padrão visual para listagens do CRM

Ao criar ou ajustar telas de listagem, use `src/components/contacts-view.tsx` como referência visual e funcional.

## Estrutura

- Use `main.records-page` com `records-header`: eyebrow em caixa alta, título, subtítulo curto e ação principal alinhada à direita.
- Organize busca e filtros em uma barra compacta branca (`contact-filters`), com contagem de resultados (`contact-count`).
- Apresente registros em linhas/cards (`contact-list`, `contact-row`), não em tabela larga por padrão. Use colunas responsivas, hierarquia tipográfica compacta e divisores discretos.
- Use `empty-state` para ausência de resultados e `form-error` para falhas, mantendo mensagens visíveis.
- Preserve navegação por teclado, rótulos acessíveis e comportamento móvel.

## Aparência

- Reutilize as variáveis e classes de `src/app/globals.css`: fundo `#fafbf9`, superfícies brancas, bordas suaves, cantos arredondados, texto secundário cinza e verde `--accent` para ação/ênfase.
- Use `DM Sans` no conteúdo e mantenha o padrão compacto: metadados pequenos, títulos de registro em aproximadamente 12px, espaçamento uniforme e avatares/ícones discretos.
- Todos os controles de filtro devem compartilhar o mesmo tratamento visual: campos dentro de `label` (inclusive `input[type=date]`) devem ter altura de 38px, largura fluida, borda `#dfe4dd`, raio 4px, fundo branco e fonte `12px DM Sans`, com foco `--accent` e anel de foco. Não dependa apenas do seletor `.contact-filters > input`, pois controles embrulhados em `label` não são filhos diretos.
- Controles de status editáveis em cada linha devem ter estilo explícito e consistente com os campos da barra de filtros (borda, raio, tipografia e estado de foco), dimensão compatível com o conteúdo e posicionamento responsivo. Não deixe `<select>` nativo sem estilo nem remova o indicador de foco.
- Ações por linha ficam no fim da linha e usam botões de pictograma com tooltip (`row-action` / `row-action--danger`, componente `src/components/row-action.tsx`): o pictograma é decorativo, o texto da ação aparece no tooltip e no `aria-label` com contexto. Ação destrutiva continua exigindo confirmação.
- Não introduza paleta, sombras, botões, filtros ou padrões de tabela independentes quando classes existentes forem adequadas.
- Em larguras menores, reordene informações em vez de permitir overflow horizontal; siga breakpoints e adaptações existentes para contatos (`900px` e `600px`).

## Verificação

- Compare visual e estruturalmente a listagem alterada com `ContactsView`.
- Verifique filtros, contagem, estado vazio, erro, foco visível e layout em tela estreita.
- Execute lint, build e testes disponíveis.
