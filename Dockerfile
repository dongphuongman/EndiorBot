# EndiorBot Docker Image
# Multi-stage build for minimal production image (~150MB)

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Install dependencies first (cache layer)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# Stage 2: Production runtime
FROM node:20-alpine

# Non-root user for security
RUN adduser -D -h /app endiorbot
WORKDIR /app

# Copy only production artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY endiorbot.mjs ./
COPY .env.example ./.env.example

# Switch to non-root user
USER endiorbot

# Default gateway port
EXPOSE 18790

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:18790/api/health || exit 1

CMD ["node", "endiorbot.mjs", "serve", "--host", "0.0.0.0"]
