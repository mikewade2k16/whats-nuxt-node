# AGENTS.md - internal/domain/filaatendimento

Pacote temporário de integração hospedada do módulo `fila-atendimento` dentro do `plataforma-api`.

## Papel

- concentrar o bootstrap do runtime hospedado do módulo
- impedir que `cmd/server/main.go` conheça detalhes da incubadora diretamente
- preparar a troca futura da implementação do módulo sem espalhar import externo pelo serviço

## Responsabilidades

- abrir pool do schema `fila_atendimento`
- aplicar migrations do módulo quando `CORE_AUTO_MIGRATE=true`
- construir o handler HTTP hospedado do módulo

## Limites

- este pacote não é dono da regra de negócio do módulo
- este pacote não deve absorver handlers HTTP do shell nem lógica de auth do `platform_core`
- enquanto a implementação concreta ainda vier da incubadora, o acoplamento externo deve ficar isolado aqui

## Próximo corte esperado

- substituir o import externo de `moduleapi` pela implementação oficial internalizada do módulo
- manter a mesma assinatura pública usada hoje por `cmd/server/main.go`