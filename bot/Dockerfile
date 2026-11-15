# Образ бота для Timeweb App Platform (собирается из папки bot/, build_entry_path = /bot).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# curl нужен проверке здоровья App Platform (она запускается внутри контейнера), как у сайта
RUN apk add --no-cache curl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8080/health -o /dev/null || exit 1
CMD ["node", "--import", "tsx", "src/index.ts"]
