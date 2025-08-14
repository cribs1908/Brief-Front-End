# OCR Worker Dockerfile per PDF processing B2B
FROM python:3.11-slim

# Install system dependencies per OCR e Tabula
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-ita \
    tesseract-ocr-eng \
    poppler-utils \
    default-jre \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Download Tabula JAR
RUN wget -O /usr/local/bin/tabula.jar https://github.com/tabulapdf/tabula-java/releases/latest/download/tabula-1.0.5-jar-with-dependencies.jar

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8080

# Run the application
CMD ["python", "main.py"]