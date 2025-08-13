FROM node:20-bullseye

# Install system deps: tesseract + java (for tabula)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    default-jre \
    poppler-utils \
    curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Build TypeScript per produzione
RUN npm run build

# Provide tabula.jar at runtime via volume or bake it into the image
# ENV TABULA_JAR_PATH=/app/tabula.jar

ENV PORT=8787
# Scarica Tabula jar (versione stabile)
RUN curl -L -o /app/tabula.jar https://github.com/tabulapdf/tabula-java/releases/download/v1.0.5/tabula-1.0.5-jar-with-dependencies.jar || true
ENV TABULA_JAR_PATH=/app/tabula.jar
EXPOSE 8787

# Avvio produzione: esegue il bundle compilato
CMD ["node","dist/server.js"]


