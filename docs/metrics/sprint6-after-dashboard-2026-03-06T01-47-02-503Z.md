# Sprint 6 Metrics (after-dashboard)

- Gerado em: 2026-03-06T01:47:02.503Z
- Base URL: http://host.docker.internal:3000
- Runs por endpoint: 7
- Timeout por request: 30000ms

## Resultados

| Endpoint | AVG (ms) | P95 (ms) | MIN (ms) | MAX (ms) | OK rate | Status codes |
|---|---:|---:|---:|---:|---:|---|
| PAGE /admin/omnichannel/docs | 987.99 | 1319.39 | 565.26 | 1319.39 | 100% | {"200":7} |
| PAGE /admin/omnichannel/inbox | 3611.62 | 23322.09 | 291.51 | 23322.09 | 100% | {"200":7} |
| PAGE /admin/omnichannel/operacao | 891.81 | 3673.67 | 299.69 | 3673.67 | 100% | {"200":7} |
| API /api/docs | 415.71 | 664.12 | 60.86 | 664.12 | 100% | {"200":7} |
| API /api/bff/conversations | 238.45 | 365.27 | 69.95 | 365.27 | 100% | {"200":7} |
| API /api/bff/tenant/whatsapp/status | 167.19 | 308.8 | 32.64 | 308.8 | 100% | {"200":7} |
| API /api/bff/users | 95.84 | 278.94 | 26.27 | 278.94 | 100% | {"200":7} |
| API /api/bff/contacts | 97.23 | 268.75 | 28.15 | 268.75 | 100% | {"200":7} |
| API /api/bff/tenant/metrics/failures?days=7 | 183.07 | 316.72 | 35.04 | 316.72 | 100% | {"200":7} |
| API /api/bff/conversations/:id/messages?limit=50 | 360.18 | 641.56 | 125.74 | 641.56 | 100% | {"200":7} |

## Notas

- Este arquivo foi gerado com o mesmo roteiro de medicao para comparacao entre rodadas.
- Gere outro relatorio mudando `METRICS_LABEL` para comparar antes/depois.
