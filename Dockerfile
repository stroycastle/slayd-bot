# Hosting (Render va h.k.) uchun: Node + LibreOffice (PDF yasash uchun)
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-impress fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY assets ./assets
COPY miniapp ./miniapp

# Maʼlumot (balans, buyurtmalar) /data da saqlanadi: pullik rejada shu yoʻlga disk ulanadi
ENV NODE_ENV=production \
    HOME=/tmp \
    DATA_DIR=/data \
    TMP_DIR=/tmp/slayd

CMD ["node", "src/index.js"]
