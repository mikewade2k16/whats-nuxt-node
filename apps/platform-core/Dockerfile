FROM golang:1.24-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/platform-core ./cmd/server && \
    CGO_ENABLED=0 GOOS=linux go build -o /out/platform-core-migrate ./cmd/migrate

FROM alpine:3.21
RUN apk add --no-cache ca-certificates && adduser -D app
WORKDIR /app

COPY --from=builder /out/platform-core /usr/local/bin/platform-core
COPY --from=builder /out/platform-core-migrate /usr/local/bin/platform-core-migrate
COPY --from=builder /src/migrations ./migrations

USER app
EXPOSE 4100

CMD ["platform-core"]
