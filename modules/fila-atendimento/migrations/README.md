# Migrations do módulo `fila-atendimento`

Este diretório será o destino das migrations próprias do módulo.

## Situação atual

- o estado atual ainda vive no backend da `incubadora/fila-atendimento`

## Regra desta fase

Antes de mover migrations para cá, definir:

- ownership exato das tabelas do módulo
- separação entre persistência do shell e persistência do domínio
- estratégia de transição sem quebrar o standalone atual
