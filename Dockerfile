FROM node:20-alpine

WORKDIR /app

# Only copy what the static server needs
COPY server.js ./
COPY index.html ./
COPY app.js ./
COPY styles.css ./

EXPOSE 3000

CMD ["node", "server.js"]
