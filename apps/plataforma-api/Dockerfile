FROM golang:1.24-alpine AS builder
WORKDIR /src/apps/plataforma-api

COPY apps/plataforma-api/go.mod apps/plataforma-api/go.sum ./
COPY modules/fila-atendimento/backend/go.mod modules/fila-atendimento/backend/go.sum /src/modules/fila-atendimento/backend/
RUN go mod download

COPY apps/plataforma-api /src/apps/plataforma-api
COPY modules/fila-atendimento/backend /src/modules/fila-atendimento/backend
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/plataforma-api ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -o /out/plataforma-api-migrate ./cmd/migrate

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D app
WORKDIR /app

COPY --from=builder /out/plataforma-api /usr/local/bin/plataforma-api
COPY --from=builder /out/plataforma-api-migrate /usr/local/bin/plataforma-api-migrate
COPY --from=builder /src/apps/plataforma-api/migrations ./migrations

USER app
EXPOSE 4100

CMD ["plataforma-api"]
