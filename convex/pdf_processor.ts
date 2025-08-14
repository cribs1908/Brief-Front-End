/**
 * Direct PDF processing in Convex Actions
 * Replaces Railway processor with integrated solution
 */

import { action } from "./_generated/server";
import { v } from "convex/values";
import { extractMetricCandidates } from "./langchain_parser";

// Types for PDF processing
type TextBlock = { page: number; text: string };
type TableCell = { text: string; bbox?: number[] };
type Table = { page: number; rows: { cells: TableCell[] }[] };

/**
 * Direct PDF processing action - replaces Railway processor
 * Handles PDF extraction using server-side libraries
 */
export const processPdfDirect = action({
  args: {
    storageId: v.id("_storage"),
    vendor_hint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Get PDF file from Convex storage
      const pdfUrl = await ctx.storage.getUrl(args.storageId);
      if (!pdfUrl) {
        throw new Error("PDF file not found in storage");
      }

      // Download PDF
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status}`);
      }
      
      const pdfBuffer = await response.arrayBuffer();
      console.log(`Processing PDF: ${pdfBuffer.byteLength} bytes`);

      // Basic text extraction using simple methods
      // For MVP, we'll use a simple approach that works in serverless
      const textBlocks = await extractTextFromPdf(pdfBuffer);
      const tables = await extractTablesFromPdf(pdfBuffer);
      
      console.log(`Extracted ${textBlocks.length} text blocks, ${tables.length} tables`);

      return {
        pages: Math.max(1, textBlocks.length),
        ocr_used: false,
        extraction_quality: Math.min(1, textBlocks.length / 5), 
        tables,
        text_blocks: textBlocks,
        logs: [`Processed ${textBlocks.length} text blocks`, `Found ${tables.length} tables`]
      };
    } catch (error) {
      console.error("Direct PDF processing failed:", error);
      
      // Fallback: return minimal structure to prevent frontend crashes
      return {
        pages: 1,
        ocr_used: false,
        extraction_quality: 0.1,
        tables: [],
        text_blocks: [{ 
          page: 1, 
          text: `PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}. This may be due to PDF format, size, or content complexity.` 
        }],
        logs: [`Error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  },
});

/**
 * Improved text extraction using PDF.js (serverless compatible)
 * Handles text extraction properly and respects Convex size limits
 */
async function extractTextFromPdf(pdfBuffer: ArrayBuffer): Promise<TextBlock[]> {
  const textBlocks: TextBlock[] = [];
  
  try {
    // Try PDF.js for proper text extraction first
    try {
      const pdfjs = await import('pdfjs-dist');
      
      // Configure PDF.js for serverless  
      (pdfjs as any).GlobalWorkerOptions = (pdfjs as any).GlobalWorkerOptions || {};
      (pdfjs as any).GlobalWorkerOptions.workerSrc = null;
      
      const loadingTask = pdfjs.getDocument({
        data: pdfBuffer,
        verbosity: 0,
        standardFontDataUrl: undefined,
        cMapUrl: undefined,
        cMapPacked: false,
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
        useWorkerFetch: false,
        disableRange: true,
        disableStream: true,
      });
      
      const pdf = await loadingTask.promise;
      console.log(`PDF loaded: ${pdf.numPages} pages`);
      
      // Extract text from first 5 pages max (prevent size issues)
      const maxPages = Math.min(pdf.numPages, 5);
      
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          
          const pageText = textContent.items
            .map((item: any) => item.str || '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (pageText && pageText.length > 10) {
            // Limit text per page to 1500 chars to prevent size issues
            const limitedText = pageText.length > 1500 ? pageText.substring(0, 1500) + '...' : pageText;
            textBlocks.push({
              page: pageNum,
              text: limitedText
            });
          }
          
          page.cleanup();
        } catch (pageError) {
          console.warn(`Failed to extract page ${pageNum}:`, pageError);
          textBlocks.push({
            page: pageNum,
            text: `Page ${pageNum}: Text extraction failed - ${pageError instanceof Error ? pageError.message : 'Unknown error'}`
          });
        }
      }
      
      pdf.destroy();
      
    } catch (pdfjsError) {
      console.warn("PDF.js extraction failed, falling back to basic method:", pdfjsError);
      
      // Fallback: basic text extraction (improved)
      const uint8Array = new Uint8Array(pdfBuffer);
      const chunks: string[] = [];
      let currentChunk = '';
      
      // Look for text patterns in PDF
      for (let i = 0; i < Math.min(uint8Array.length, 500000); i++) { // Limit to first 500KB
        const char = uint8Array[i];
        
        // Only collect printable ASCII and spaces
        if ((char >= 32 && char <= 126) || char === 10 || char === 13) {
          currentChunk += String.fromCharCode(char);
          
          // Split into chunks to prevent memory issues
          if (currentChunk.length > 2000) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
        }
      }
      
      if (currentChunk) chunks.push(currentChunk);
      
      // Process chunks into text blocks
      chunks.forEach((chunk, index) => {
        const cleanText = chunk
          .replace(/[^\x20-\x7E\n]/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/(.)\1{10,}/g, '$1') // Remove repeated chars
          .trim();
        
        if (cleanText.length > 20) {
          textBlocks.push({
            page: index + 1,
            text: cleanText.substring(0, 1000) // Limit each block
          });
        }
      });
    }
    
    // If no meaningful text found
    if (textBlocks.length === 0 || textBlocks.every(b => b.text.length < 20)) {
      textBlocks.splice(0); // Clear array
      textBlocks.push({
        page: 1,
        text: "PDF appears to contain primarily images or uses unsupported text encoding. Consider using a different PDF or ensuring it contains searchable text."
      });
    }
    
    // Final safety check - limit total size
    let totalSize = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
    if (totalSize > 50000) { // 50KB text limit
      console.warn(`Text too large (${totalSize} chars), truncating...`);
      let accumulated = 0;
      textBlocks.forEach(block => {
        if (accumulated + block.text.length > 50000) {
          block.text = block.text.substring(0, Math.max(0, 50000 - accumulated)) + '...';
        }
        accumulated += block.text.length;
      });
    }
    
  } catch (error) {
    console.error("PDF text extraction completely failed:", error);
    textBlocks.splice(0);
    textBlocks.push({
      page: 1, 
      text: `PDF processing error: ${error instanceof Error ? error.message : 'Unknown error'}. This PDF may be corrupted or use an unsupported format.`
    });
  }
  
  console.log(`Final extraction: ${textBlocks.length} blocks, total chars: ${textBlocks.reduce((sum, b) => sum + b.text.length, 0)}`);
  return textBlocks;
}

/**
 * Basic table detection from PDF content
 */
async function extractTablesFromPdf(pdfBuffer: ArrayBuffer): Promise<Table[]> {
  const tables: Table[] = [];
  
  try {
    // For MVP, we'll do basic table detection based on text patterns
    // In a real implementation, this would use proper PDF parsing libraries
    
    // Convert to text first
    const textBlocks = await extractTextFromPdf(pdfBuffer);
    const allText = textBlocks.map(b => b.text).join('\n');
    
    // Look for table-like patterns (multiple columns with consistent spacing)
    const lines = allText.split('\n');
    const tableRows: { cells: TableCell[] }[] = [];
    
    for (const line of lines) {
      // Detect lines that look like table rows (multiple words separated by spaces)
      if (line.includes(':') || line.match(/\s{2,}/)) {
        const cells = line.split(/\s{2,}/).map(text => ({ text: text.trim() }));
        if (cells.length > 1 && cells.some(c => c.text.length > 0)) {
          tableRows.push({ cells });
        }
      }
    }
    
    if (tableRows.length > 0) {
      tables.push({
        page: 1,
        rows: tableRows.slice(0, 20) // Limit to first 20 rows
      });
    }
    
  } catch (error) {
    console.error("Table extraction failed:", error);
  }
  
  return tables;
}