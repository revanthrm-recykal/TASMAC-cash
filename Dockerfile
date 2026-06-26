# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build the app
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy env values so Next.js build doesn't fail on missing vars
ENV NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_SECRET=build-placeholder
ENV ADMIN_PASSWORD=build-placeholder
ENV GOOGLE_SERVICE_ACCOUNT_EMAIL=build-placeholder
ENV GOOGLE_PRIVATE_KEY=build-placeholder
ENV GOOGLE_SHEET_ID=build-placeholder
ENV PAYMENT_DB_HOST=build-placeholder
ENV PAYMENT_DB_PORT=3306
ENV PAYMENT_DB_USER=build-placeholder
ENV PAYMENT_DB_PASSWORD=build-placeholder
ENV PAYMENT_DB_NAME=build-placeholder

RUN npm run build

# Stage 3: Production runner (minimal image)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy only what Next.js standalone needs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
