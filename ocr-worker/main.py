"""
OCR Worker Serverless
Gestisce PDF da 6MB+ con pipeline OCR + Tabula
Segue architettura applogicprd.md
"""

import os
import io
import json
import tempfile
from flask import Flask, request, jsonify
import pytesseract
from pdf2image import convert_from_path
import tabula
import pandas as pd
import requests
from PIL import Image

app = Flask(__name__)

# Configuration
MAX_PDF_SIZE = 50 * 1024 * 1024  # 50MB limit for B2B docs
TESSERACT_CONFIG = r'--oem 3 --psm 6'
DPI = 200  # High quality per documenti tecnici

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "ocr-worker"})

@app.route('/process-pdf', methods=['POST'])
def process_pdf():
    """
    Main endpoint per processing PDF B2B
    Input: PDF file via URL or binary
    Output: structured data (text + tables)
    """
    try:
        # Get PDF source
        if 'pdf_url' in request.json:
            pdf_url = request.json['pdf_url']
            pdf_data = download_pdf(pdf_url)
        elif 'pdf_data' in request.files:
            pdf_data = request.files['pdf_data'].read()
        else:
            return jsonify({"error": "No PDF provided"}), 400
        
        # Size check for B2B docs
        if len(pdf_data) > MAX_PDF_SIZE:
            return jsonify({
                "error": f"PDF too large: {len(pdf_data)} bytes > {MAX_PDF_SIZE} limit"
            }), 413
        
        print(f"Processing PDF: {len(pdf_data)} bytes")
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp_file:
            tmp_file.write(pdf_data)
            pdf_path = tmp_file.name
        
        try:
            # Step 1: Extract tables with Tabula (native PDF tables)
            tables = extract_tables_with_tabula(pdf_path)
            print(f"Tabula extracted {len(tables)} tables")
            
            # Step 2: OCR for scanned content
            text_blocks = extract_text_with_ocr(pdf_path)
            print(f"OCR extracted {len(text_blocks)} text blocks")
            
            # Step 3: Combine and structure results
            result = {
                "pages": max(1, len(text_blocks)),
                "extraction_method": "ocr+tabula",
                "extraction_quality": calculate_quality(text_blocks, tables),
                "tables": tables,
                "text_blocks": text_blocks,
                "logs": [
                    f"Processed {len(pdf_data)} bytes",
                    f"Found {len(tables)} tables via Tabula",
                    f"Extracted {len(text_blocks)} text blocks via OCR"
                ]
            }
            
            return jsonify(result)
            
        finally:
            # Cleanup
            os.unlink(pdf_path)
            
    except Exception as e:
        print(f"Error processing PDF: {str(e)}")
        return jsonify({
            "error": "PDF processing failed",
            "message": str(e),
            "pages": 1,
            "extraction_method": "error",
            "extraction_quality": 0,
            "tables": [],
            "text_blocks": [{"page": 1, "text": f"Processing failed: {str(e)}"}],
            "logs": [f"Error: {str(e)}"]
        }), 500

def download_pdf(url: str) -> bytes:
    """Download PDF from URL"""
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.content

def extract_tables_with_tabula(pdf_path: str) -> list:
    """
    Extract structured tables using Tabula
    Perfect for native PDF tables in B2B documents
    """
    tables = []
    
    try:
        # Use tabula to extract all tables
        dfs = tabula.read_pdf(
            pdf_path, 
            pages='all',
            multiple_tables=True,
            pandas_options={'header': None}
        )
        
        for i, df in enumerate(dfs):
            if df.empty:
                continue
                
            # Convert DataFrame to our format
            rows = []
            for _, row in df.iterrows():
                cells = []
                for value in row:
                    # Clean cell values
                    cell_text = str(value).strip() if pd.notna(value) else ""
                    if cell_text and cell_text != 'nan':
                        cells.append({"text": cell_text})
                
                if cells:  # Only add non-empty rows
                    rows.append({"cells": cells})
            
            if rows:
                tables.append({
                    "page": i + 1,
                    "table_id": f"tabula_{i}",
                    "rows": rows,
                    "extraction_method": "tabula"
                })
                
    except Exception as e:
        print(f"Tabula extraction failed: {str(e)}")
        
    return tables

def extract_text_with_ocr(pdf_path: str) -> list:
    """
    Extract text using OCR for scanned PDFs
    High quality extraction for technical documents
    """
    text_blocks = []
    
    try:
        # Convert PDF to images
        images = convert_from_path(
            pdf_path, 
            dpi=DPI,
            first_page=1,
            last_page=20  # Limit to first 20 pages for large docs
        )
        
        for page_num, image in enumerate(images, 1):
            try:
                # Extract text using Tesseract
                text = pytesseract.image_to_string(
                    image, 
                    config=TESSERACT_CONFIG,
                    lang='eng+ita'
                )
                
                # Clean and structure text
                cleaned_text = clean_ocr_text(text)
                
                if cleaned_text and len(cleaned_text) > 20:
                    text_blocks.append({
                        "page": page_num,
                        "text": cleaned_text[:2000],  # Limit text per page
                        "extraction_method": "tesseract_ocr"
                    })
                    
            except Exception as e:
                print(f"OCR failed for page {page_num}: {str(e)}")
                text_blocks.append({
                    "page": page_num,
                    "text": f"OCR extraction failed for page {page_num}: {str(e)}",
                    "extraction_method": "error"
                })
                
    except Exception as e:
        print(f"PDF to image conversion failed: {str(e)}")
        text_blocks.append({
            "page": 1,
            "text": f"Could not convert PDF to images: {str(e)}",
            "extraction_method": "error"
        })
        
    return text_blocks

def clean_ocr_text(text: str) -> str:
    """Clean OCR output for better LangChain processing"""
    if not text:
        return ""
    
    # Basic cleaning
    cleaned = text.strip()
    
    # Remove excessive whitespace
    cleaned = ' '.join(cleaned.split())
    
    # Remove short isolated characters
    words = cleaned.split()
    filtered_words = [word for word in words if len(word) > 1 or word.isdigit()]
    
    return ' '.join(filtered_words)

def calculate_quality(text_blocks: list, tables: list) -> float:
    """Calculate extraction quality score"""
    if not text_blocks and not tables:
        return 0.0
    
    text_score = min(1.0, len(text_blocks) / 5)  # Up to 5 pages gets full score
    table_score = min(1.0, len(tables) / 3)     # Up to 3 tables gets full score
    
    # Weight tables higher for B2B docs
    return (text_score * 0.4) + (table_score * 0.6)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)