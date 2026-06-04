# ── Stage 1: Build the React client ──
FROM node:20-alpine AS client-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

# ── Stage 2: Production server ──
FROM node:20-alpine AS production

WORKDIR /app

# Copy and install ALL dependencies at root level
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./
COPY api/src/ ./api/src/

# Copy built client from stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "server.js"]
