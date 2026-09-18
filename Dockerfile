FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package.json ./
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
CMD ["node","dist/index.js"]
