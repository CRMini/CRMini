---
name: release-semver
description: Define o versionamento SemVer e o processo de release do CRMini no GitHub.
---

# Versionamento e release

Use ao escolher a próxima versão, preparar uma release ou publicar instaladores do CRMini.

## Política de versão

O projeto usa SemVer: `MAJOR.MINOR.PATCH`. A versão é única e global, definida em `package.json` e repetida em `package-lock.json`; a tag de release é `v<versão>`.

| Componente          | Quando incrementar                                               | Exemplos                                                             |
| ------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| **PATCH** (`0.4.1`) | Correções compatíveis e ajustes internos sem funcionalidade nova | Corrigir uma validação, ajustar layout, corrigir uma consulta        |
| **MINOR** (`0.5.0`) | Funcionalidade nova compatível com o existente                   | Nova tela, novo endpoint, nova preferência, barra lateral recolhível |
| **MAJOR** (`1.0.0`) | Mudança incompatível ou marco de estabilidade                    | Remover/renomear API, alterar schema sem compatibilidade             |

Regras:

- A mudança de maior impacto define o número: se a release tem feature e correções, é MINOR; se tem quebra de compatibilidade, é MAJOR.
- Em `0.x`, o MINOR também absorve mudanças potencialmente incompatíveis, porque a API ainda não é considerada estável. Uma quebra hoje vira `0.5.0`, não `1.0.0`.
- Use `1.0.0` quando schema, APIs e fluxos principais estiverem consolidados, não apenas quando “acabarem as features”.
- Mudança apenas de documentação ou ferramentas internas pode não gerar release; se gerar, use PATCH.
- Não use pré-release (`-beta.1`) nem build metadata (`+build`) nesta versão: o updater está com `allowPrerelease` desligado e a release é publicada como estável.
- Não mova nem recrie uma tag já publicada. Se uma release falhar depois de publicada, corrija e publique a próxima versão PATCH.

## Checklist de release

1. Confirme que a árvore está limpa, que `main` está sincronizada com `origin/main` e que os testes passam.
2. Rode `npm test`, `npm run coverage`, `npm run lint` e `npm run build`. Não reduza os pisos de cobertura nem exclua arquivos do relatório.
3. Escolha a versão pelo critério acima e atualize os dois arquivos:
   ```bash
   npm version X.Y.Z --no-git-tag-version
   ```
4. Faça um commit separado de versionamento, seguindo `commits-gitmoji`:
   ```bash
   git add package.json package-lock.json
   git commit -m "🔖 CRMini X.Y.Z"
   ```
5. Crie uma tag anotada:
   ```bash
   git tag -a vX.Y.Z -m "🔖 CRMini X.Y.Z"
   ```
6. Envie o commit e a tag:
   ```bash
   git push origin main
   git push origin vX.Y.Z
   ```
7. Acompanhe o workflow `Release`:
   ```bash
   gh run list --workflow Release --limit 1
   gh run watch <run-id> --exit-status
   ```
8. Confira a release publicada e os artefatos:
   ```bash
   gh release view vX.Y.Z --json tagName,isDraft,isPrerelease,assets,url
   ```

## Descrição da release

O workflow usa `generate_release_notes`, mas isso pode produzir apenas o link do changelog. Sempre confira a descrição depois da publicação e, se necessário, preencha com um arquivo de notas em português:

```bash
gh release edit vX.Y.Z --notes-file /tmp/opencode/release-vX.Y.Z.md
```

Estrutura recomendada:

```markdown
## Novidades

- Funcionalidade nova, em linguagem de produto.

## Correções

- Correções relevantes.

## Qualidade

- Número de testes e cobertura.

**Full Changelog**: https://github.com/CRMini/CRMini/compare/vX.Y.Z-anterior...vX.Y.Z
```

Não invente impacto, número de issue ou mudança que não esteja no diff.

## Guardrails

- A tag deve ser idêntica à `version` do `package.json`; o workflow falha se não for.
- O pacote Windows é gerado no runner `windows-latest`; não tente publicar um pacote montado em Linux.
- `latest.yml` e os `*.blockmap` são obrigatórios para a atualização automática. Confirme que foram anexados.
- A release é pública e passa a ser oferecida pelo `electron-updater` aos usuários instalados.
- `workflow_dispatch` apenas gera o artefato `crmini-windows`; não publica release.
- Não faça release com testes, lint ou build falhando, nem com o banco ou dados locais alterados.
