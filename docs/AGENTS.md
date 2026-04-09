# AGENTS.md - docs

Diretorio de documentacao tecnica e operacional do repositorio.

## Papel

- registrar arquitetura viva, playbooks, troubleshooting e auditorias
- servir como memoria operacional complementar aos `AGENTS.md`
- separar documento historico de documento que descreve estado atual

## Regras

- quando um documento descrever estado atual, informar a data do snapshot
- quando houver divergencia entre doc e codigo, atualizar a doc ou marcar explicitamente que ela e historica
- evitar referencias a caminhos mortos como `apps/web` se o caminho atual for outro
- auditorias automatizadas devem apontar para script, prerequisitos e data de execucao
- documentacao deve ser escrita em `pt-BR`, com acentuacao correta e encoding `UTF-8`
- evitar salvar docs com conversao quebrada de caracteres; se aparecer mojibake (`Ã`, `â€¦`, `Â`), corrigir antes de fechar a tarefa
- em texto operacional e institucional, preferir redacao tecnica consistente com o padrao brasileiro/ABNT

## Tipos de documento

- `architecture.md`, `backend.md`, `frontend-ui.md`: mapa de funcionamento
- `deploy-*`, `troubleshooting*`: operacao
- `security-*`, `access-control-matrix.md`: postura de acesso e riscos
- `metrics/`: saidas geradas por scripts

## Estado atual conhecido

- ha docs ainda desatualizadas em relacao ao front legado e aos seeds
- usar `repo-audit-2026-04-03.md` como snapshot consolidado mais recente ate nova auditoria
