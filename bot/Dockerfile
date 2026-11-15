# Образ бота для Timeweb App Platform (собирается из папки bot/, build_entry_path = /bot).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/index.ts"]
