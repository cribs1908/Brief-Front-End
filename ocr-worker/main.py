"""
OCR Worker Serverless - Production Ready
Gestisce PDF da 6MB+ con pipeline Google Cloud Vision + Tabula
Segue architettura applogicprd.md con tecnologie enterprise-grade
"""

import os
import io
import json
import tempfile
from flask import Flask, request, jsonify
try:
    from google.cloud import vision
    from google.cloud import documentai
    GOOGLE_CLOUD_AVAILABLE = True
except ImportError:
    print("Warning: Google Cloud libraries not available")
    GOOGLE_CLOUD_AVAILABLE = False
from pdf2image import convert_from_path
import tabula
import pandas as pd
import requests
from PIL import Image
import PyPDF2

app = Flask(__name__)

# Configuration - Production Ready
MAX_PDF_SIZE = 100 * 1024 * 1024  # 100MB limit for large B2B docs
DPI = 200  # High quality per documenti tecnici
GOOGLE_CLOUD_PROJECT = os.environ.get('GOOGLE_CLOUD_PROJECT', 'crafty-tracker-469021-k8')
DOCUMENT_AI_PROCESSOR_ID = os.environ.get('DOCUMENT_AI_PROCESSOR_ID')
USE_DOCUMENT_AI = bool(DOCUMENT_AI_PROCESSOR_ID)

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
            
            # Step 2: Google Cloud Vision/Document AI for text extraction
            if GOOGLE_CLOUD_AVAILABLE and USE_DOCUMENT_AI:
                text_blocks = extract_text_with_document_ai(pdf_data)
                extraction_method = "document_ai+tabula"
            elif GOOGLE_CLOUD_AVAILABLE:
                text_blocks = extract_text_with_vision_api(pdf_path)
                extraction_method = "vision_api+tabula"
            else:
                # Fallback to PyPDF2 for testing/local development
                text_blocks = extract_text_with_pypdf2(pdf_path)
                extraction_method = "pypdf2+tabula"
            
            print(f"Text extraction completed: {len(text_blocks)} text blocks using {extraction_method}")
            
            # Step 3: Combine and structure results
            result = {
                "pages": max(1, len(text_blocks)),
                "extraction_method": extraction_method,
                "extraction_quality": calculate_quality(text_blocks, tables),
                "tables": tables,
                "text_blocks": text_blocks,
                "logs": [
                    f"Processed {len(pdf_data)} bytes",
                    f"Found {len(tables)} tables via Tabula",
                    f"Extracted {len(text_blocks)} text blocks via Google Cloud",
                    f"Using extraction method: {extraction_method}"
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
    Enhanced for B2B technical documents (chip datasheets, API specs, SaaS features)
    """
    tables = []
    
    try:
        # Enhanced Tabula extraction for complex B2B documents
        # Use multiple strategies for robust table detection
        extraction_strategies = [
            # Strategy 1: Standard extraction (good for clean tables)
            {
                'pages': 'all',
                'multiple_tables': True,
                'pandas_options': {'header': None},
                'strategy': 'standard'
            },
            # Strategy 2: Lattice mode (good for tables with visible borders)
            {
                'pages': 'all', 
                'multiple_tables': True,
                'lattice': True,
                'pandas_options': {'header': None},
                'strategy': 'lattice'
            },
            # Strategy 3: Stream mode (good for tables without borders)
            {
                'pages': 'all',
                'multiple_tables': True, 
                'stream': True,
                'pandas_options': {'header': None},
                'strategy': 'stream'
            }
        ]
        
        all_dfs = []
        successful_strategy = None
        
        # Try each strategy and use the one that extracts most tables
        for strategy in extraction_strategies:
            try:
                strategy_name = strategy.pop('strategy')
                print(f"DEBUG: Trying Tabula strategy: {strategy_name}")
                
                dfs = tabula.read_pdf(pdf_path, **strategy)
                if dfs and len(dfs) > len(all_dfs):
                    all_dfs = dfs
                    successful_strategy = strategy_name
                    print(f"DEBUG: Strategy {strategy_name} found {len(dfs)} tables")
                    
            except Exception as e:
                print(f"DEBUG: Strategy {strategy_name} failed: {e}")
                continue
        
        print(f"DEBUG: Using best strategy: {successful_strategy} with {len(all_dfs)} tables")
        
        # Process tables with enhanced cleaning for B2B documents
        for i, df in enumerate(all_dfs):
            if df.empty:
                continue
                
            # Enhanced table processing for technical documents
            rows = []
            header_detected = False
            
            for row_idx, (_, row) in enumerate(df.iterrows()):
                cells = []
                non_empty_cells = 0
                
                for col_idx, value in enumerate(row):
                    # Enhanced cell cleaning for technical specs
                    cell_text = str(value).strip() if pd.notna(value) else ""
                    
                    # Skip 'nan', 'NaN', empty strings
                    if cell_text and cell_text.lower() not in ['nan', 'none', '']:
                        # Clean technical specifications formatting
                        cell_text = clean_technical_cell(cell_text)
                        cells.append({
                            "text": cell_text,
                            "col": col_idx,
                            "is_header": row_idx == 0 and not header_detected
                        })
                        non_empty_cells += 1
                
                # Only keep rows with sufficient content for B2B analysis
                if non_empty_cells >= 1:  # At least 1 meaningful cell
                    rows.append({
                        "cells": cells,
                        "row_type": "header" if row_idx == 0 and not header_detected else "data"
                    })
                    if row_idx == 0:
                        header_detected = True
            
            # Only add tables with meaningful content
            if rows and len(rows) >= 2:  # At least header + 1 data row
                tables.append({
                    "page": i + 1,
                    "table_id": f"tabula_{successful_strategy}_{i}",
                    "rows": rows,
                    "extraction_method": f"tabula_{successful_strategy}",
                    "columns": len(rows[0]["cells"]) if rows else 0,
                    "data_rows": len([r for r in rows if r["row_type"] == "data"])
                })
                print(f"DEBUG: Added table {i}: {len(rows)} rows, {len(rows[0]['cells']) if rows else 0} columns")
                
    except Exception as e:
        print(f"Tabula extraction failed: {str(e)}")
        
    return tables

def extract_text_with_vision_api(pdf_path: str) -> list:
    """
    Extract text using Google Cloud Vision API
    Production-ready OCR for B2B technical documents
    """
    text_blocks = []
    
    try:
        # Initialize Vision API client
        client = vision.ImageAnnotatorClient()
        
        # Convert PDF to images - process all pages for complete B2B document extraction
        images = convert_from_path(
            pdf_path, 
            dpi=DPI,
            first_page=1
            # No page limit for complete B2B documents
        )
        
        for page_num, image in enumerate(images, 1):
            try:
                # Convert PIL image to bytes
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format='PNG')
                img_byte_arr = img_byte_arr.getvalue()
                
                # Create Vision API image object
                vision_image = vision.Image(content=img_byte_arr)
                
                # Extract text using Vision API
                response = client.text_detection(image=vision_image)
                texts = response.text_annotations
                
                if texts:
                    # Use the full text detection (first result)
                    full_text = texts[0].description
                    cleaned_text = clean_ocr_text(full_text)
                    
                    if cleaned_text and len(cleaned_text) > 20:
                        text_blocks.append({
                            "page": page_num,
                            "text": cleaned_text[:4000],  # Increased limit for B2B docs
                            "extraction_method": "google_vision_api",
                            "confidence": calculate_vision_confidence(texts)
                        })
                else:
                    print(f"No text detected on page {page_num}")
                    
                # Check for errors
                if response.error.message:
                    raise Exception(f"Vision API error: {response.error.message}")
                    
            except Exception as e:
                print(f"Vision API failed for page {page_num}: {str(e)}")
                text_blocks.append({
                    "page": page_num,
                    "text": f"Vision API extraction failed for page {page_num}: {str(e)}",
                    "extraction_method": "error"
                })
                
    except Exception as e:
        print(f"Vision API processing failed: {str(e)}")
        text_blocks.append({
            "page": 1,
            "text": f"Could not process with Vision API: {str(e)}",
            "extraction_method": "error"
        })
        
    return text_blocks

def extract_text_with_document_ai(pdf_data: bytes) -> list:
    """
    Extract text using Google Cloud Document AI
    Enterprise-grade document processing for structured B2B documents
    """
    text_blocks = []
    
    try:
        # Initialize Document AI client
        client = documentai.DocumentProcessorServiceClient()
        
        # Create the processor name
        processor_name = f"projects/{GOOGLE_CLOUD_PROJECT}/locations/us/processors/{DOCUMENT_AI_PROCESSOR_ID}"
        
        # Create request
        request = documentai.ProcessRequest(
            name=processor_name,
            raw_document=documentai.RawDocument(
                content=pdf_data,
                mime_type="application/pdf"
            )
        )
        
        # Process document
        result = client.process_document(request=request)
        document = result.document
        
        # Extract text blocks by page
        if document.pages:
            for page_num, page in enumerate(document.pages, 1):
                page_text = ""
                
                # Extract paragraphs
                if page.paragraphs:
                    for paragraph in page.paragraphs:
                        # Get text from layout
                        paragraph_text = get_text_from_layout(document.text, paragraph.layout)
                        page_text += paragraph_text + "\n"
                
                # Extract tables separately (Document AI finds tables automatically)
                if page.tables:
                    for table in page.tables:
                        table_text = extract_table_text_from_document_ai(document.text, table)
                        page_text += f"\n[TABLE]\n{table_text}\n[/TABLE]\n"
                
                # Clean and add to results
                cleaned_text = clean_ocr_text(page_text)
                if cleaned_text and len(cleaned_text) > 20:
                    text_blocks.append({
                        "page": page_num,
                        "text": cleaned_text[:4000],
                        "extraction_method": "google_document_ai",
                        "confidence": 0.95  # Document AI is very reliable
                    })
        else:
            # Fallback: extract all text
            cleaned_text = clean_ocr_text(document.text)
            if cleaned_text:
                text_blocks.append({
                    "page": 1,
                    "text": cleaned_text[:4000],
                    "extraction_method": "google_document_ai_fallback"
                })
                
    except Exception as e:
        print(f"Document AI processing failed: {str(e)}")
        text_blocks.append({
            "page": 1,
            "text": f"Could not process with Document AI: {str(e)}",
            "extraction_method": "error"
        })
        
    return text_blocks

def calculate_vision_confidence(annotations) -> float:
    """Calculate average confidence from Vision API annotations"""
    if not annotations or len(annotations) < 2:
        return 0.8  # Default confidence
    
    # Skip first annotation (full text) and calculate from individual words
    word_annotations = annotations[1:]
    if not word_annotations:
        return 0.8
        
    total_confidence = sum(getattr(ann, 'confidence', 0.8) for ann in word_annotations)
    return min(1.0, total_confidence / len(word_annotations))

def get_text_from_layout(document_text: str, layout) -> str:
    """Extract text from Document AI layout object"""
    text = ""
    for segment in layout.text_anchor.text_segments:
        start_index = int(segment.start_index) if segment.start_index else 0
        end_index = int(segment.end_index) if segment.end_index else len(document_text)
        text += document_text[start_index:end_index]
    return text

def extract_table_text_from_document_ai(document_text: str, table) -> str:
    """Extract table content from Document AI table object"""
    table_text = ""
    for row in table.body_rows:
        row_text = []
        for cell in row.cells:
            cell_text = get_text_from_layout(document_text, cell.layout).strip()
            row_text.append(cell_text)
        table_text += "\t".join(row_text) + "\n"
    return table_text

def extract_text_with_pypdf2(pdf_path: str) -> list:
    """
    Fallback text extraction using PyPDF2
    Used for local development and testing when Google Cloud is not available
    """
    text_blocks = []
    
    try:
        with open(pdf_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            
            for page_num, page in enumerate(pdf_reader.pages, 1):
                try:
                    # Extract text from page
                    text = page.extract_text()
                    
                    # Clean and structure text
                    cleaned_text = clean_ocr_text(text)
                    
                    if cleaned_text and len(cleaned_text) > 20:
                        text_blocks.append({
                            "page": page_num,
                            "text": cleaned_text[:4000],
                            "extraction_method": "pypdf2_fallback",
                            "confidence": 0.7  # Lower confidence for fallback method
                        })
                        
                except Exception as e:
                    print(f"PyPDF2 failed for page {page_num}: {str(e)}")
                    text_blocks.append({
                        "page": page_num,
                        "text": f"PyPDF2 extraction failed for page {page_num}: {str(e)}",
                        "extraction_method": "error"
                    })
                    
    except Exception as e:
        print(f"PyPDF2 processing failed: {str(e)}")
        text_blocks.append({
            "page": 1,
            "text": f"Could not process with PyPDF2: {str(e)}",
            "extraction_method": "error"
        })
        
    return text_blocks

def clean_technical_cell(cell_text: str) -> str:
    """Clean technical specification cells for B2B analysis"""
    if not cell_text:
        return ""
    
    # Remove extra whitespace
    cleaned = ' '.join(cell_text.split())
    
    # Handle common technical formatting
    # Example: "4.5 V to 18 V" should stay as is
    # Example: "±5%" should stay as is
    # Example: "TYP." should become "typical"
    
    replacements = {
        'TYP.': 'typical',
        'MIN.': 'minimum', 
        'MAX.': 'maximum',
        'NOM.': 'nominal',
        'TYP': 'typical',
        'MIN': 'minimum',
        'MAX': 'maximum',
        'NOM': 'nominal'
    }
    
    cleaned_upper = cleaned.upper()
    for old, new in replacements.items():
        if old in cleaned_upper:
            cleaned = cleaned.replace(old.lower(), new)
            cleaned = cleaned.replace(old, new)
    
    return cleaned

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
    """Calculate extraction quality score for B2B documents"""
    if not text_blocks and not tables:
        return 0.0
    
    # Improved scoring for larger B2B documents
    text_score = min(1.0, len(text_blocks) / 10)  # Up to 10 pages gets full score for B2B docs
    table_score = min(1.0, len(tables) / 5)      # Up to 5 tables gets full score for B2B docs
    
    # Count valid content blocks (with substantial text)
    valid_blocks = sum(1 for block in text_blocks if len(block.get('text', '')) > 100)
    content_score = min(1.0, valid_blocks / 8)
    
    # Combined scoring weighted for B2B technical documents
    return (text_score * 0.3) + (table_score * 0.4) + (content_score * 0.3)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)