FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server ./server
COPY web ./web
COPY config.example.json ./

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7345
ENV DATA_DIR=/app/data
ENV NO_OPEN=1
ENV IDLE_SHUTDOWN_MINUTES=0

VOLUME ["/app/data"]
EXPOSE 7345

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js", "--no-open"]
