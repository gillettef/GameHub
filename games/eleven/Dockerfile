# 단일 컨테이너: Node 서버가 빌드된 React 클라이언트까지 서빙한다 (HTTP + WebSocket /ws, 포트 $PORT).
# Fly.io / Railway / Render(Docker) 등 컨테이너 호스팅 어디서나 그대로 쓸 수 있다.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["node", "server/dist/index.js"]
