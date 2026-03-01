# Build Stage
FROM golang:1.23-alpine AS builder
WORKDIR /app

# Copy go mod files
COPY go.mod ./

# Copy the source code
COPY . .

# Build the Go app
RUN go build -o orchestrator ./cmd/orchestrator/main.go

# Run Stage
FROM alpine:latest
WORKDIR /root/

# Copy the pre-built binary file from the previous stage
COPY --from=builder /app/orchestrator .

# Expose port 8080 to the outside world
EXPOSE 8080

# Command to run the executable
CMD ["./orchestrator"]