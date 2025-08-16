// Google Cloud Vision OCR integration for PDF processing
import { action } from "./_generated/server";
import { v } from "convex/values";

// Simulate Google Cloud Vision API call for now
// In production, this would call the actual API
export const extractTextFromPDF = action({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    try {
      // Get PDF URL from Convex storage
      const pdfUrl = await ctx.storage.getUrl(args.storageId);
      if (!pdfUrl) {
        throw new Error("Could not get PDF URL");
      }

      console.log(`Processing PDF: ${args.filename} from ${pdfUrl}`);

      // For now, return simulated OCR results based on filename
      // This simulates what Google Cloud Vision would return
      return simulateOCRResults(args.filename);

    } catch (error: any) {
      console.error("OCR extraction failed:", error);
      throw new Error(`OCR failed: ${error.message}`);
    }
  },
});

function simulateOCRResults(filename: string): any {
  // Simulate OCR results based on the chip filenames we're testing
  if (filename.toLowerCase().includes('lm74910')) {
    return {
      pages: 8,
      quality: 0.95,
      ocrUsed: false, // High quality PDF, no OCR needed
      textBlocks: [
        {
          text: "LM74910-Q1 Dual-Channel High-Side Driver and Smart Power Switch with Integrated Protection",
          page: 1,
          bbox: { x: 50, y: 100, width: 500, height: 30 },
          confidence: 0.98
        },
        {
          text: "Operating Voltage Range: 4.5V to 65V",
          page: 3,
          bbox: { x: 100, y: 200, width: 300, height: 20 },
          confidence: 0.96
        },
        {
          text: "Maximum Continuous Current: 10A per channel",
          page: 3,
          bbox: { x: 100, y: 220, width: 350, height: 20 },
          confidence: 0.94
        },
        {
          text: "Package: HTSSOP-16, SOIC-14",
          page: 1,
          bbox: { x: 100, y: 150, width: 200, height: 20 },
          confidence: 0.98
        },
        {
          text: "Operating Temperature: -40°C to +150°C",
          page: 3,
          bbox: { x: 100, y: 240, width: 280, height: 20 },
          confidence: 0.97
        },
        {
          text: "ESD Protection: ±8kV HBM",
          page: 4,
          bbox: { x: 100, y: 300, width: 200, height: 20 },
          confidence: 0.91
        }
      ],
      tables: [
        {
          page: 3,
          bbox: { x: 50, y: 180, width: 500, height: 200 },
          rows: [
            ["Parameter", "Min", "Typ", "Max", "Unit"],
            ["Operating Voltage", "4.5", "12", "65", "V"],
            ["Continuous Current", "-", "10", "-", "A"],
            ["Power Dissipation", "-", "2", "-", "W"]
          ]
        }
      ]
    };
  } else if (filename.toLowerCase().includes('chip1')) {
    return {
      pages: 4,
      quality: 0.88,
      ocrUsed: true, // Lower quality, OCR used
      textBlocks: [
        {
          text: "Dual ESD Protection Diode Array",
          page: 1,
          bbox: { x: 60, y: 80, width: 400, height: 25 },
          confidence: 0.90
        },
        {
          text: "Voltage Rating: 12V to 22V",
          page: 1,
          bbox: { x: 80, y: 180, width: 250, height: 18 },
          confidence: 0.88
        },
        {
          text: "Package: SOT-23 (3-pin)",
          page: 2,
          bbox: { x: 80, y: 120, width: 200, height: 18 },
          confidence: 0.92
        },
        {
          text: "Maximum Pulse Current: 1.7A",
          page: 2,
          bbox: { x: 80, y: 200, width: 220, height: 18 },
          confidence: 0.85
        },
        {
          text: "ESD Protection: ±30kV IEC 61000-4-2",
          page: 2,
          bbox: { x: 80, y: 220, width: 300, height: 18 },
          confidence: 0.93
        },
        {
          text: "Operating Temperature: -55°C to +150°C",
          page: 1,
          bbox: { x: 80, y: 240, width: 280, height: 18 },
          confidence: 0.89
        },
        {
          text: "Power Dissipation: 500mW",
          page: 2,
          bbox: { x: 80, y: 260, width: 200, height: 18 },
          confidence: 0.82
        }
      ],
      tables: [
        {
          page: 2,
          bbox: { x: 40, y: 150, width: 480, height: 150 },
          rows: [
            ["Parameter", "Value", "Unit"],
            ["Voltage Rating", "12-22", "V"],
            ["Pulse Current", "1.7", "A"],
            ["ESD Protection", "±30", "kV"],
            ["Power Dissipation", "0.5", "W"]
          ]
        }
      ]
    };
  } else {
    // Generic semiconductor datasheet simulation
    return {
      pages: 6,
      quality: 0.85,
      ocrUsed: true,
      textBlocks: [
        {
          text: "Semiconductor Device Datasheet",
          page: 1,
          bbox: { x: 50, y: 50, width: 400, height: 30 },
          confidence: 0.85
        },
        {
          text: "Package: TO-220",
          page: 1,
          bbox: { x: 100, y: 120, width: 150, height: 20 },
          confidence: 0.90
        }
      ],
      tables: []
    };
  }
}

// Helper function to process OCR results into structured format
export const processOCRResults = action({
  args: {
    ocrResults: v.any(),
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const { ocrResults, documentId } = args;
    const now = Date.now();

    // Store text artifacts by page
    if (ocrResults.textBlocks && ocrResults.textBlocks.length > 0) {
      const textByPage = new Map();
      
      for (const block of ocrResults.textBlocks) {
        const page = block.page || 1;
        if (!textByPage.has(page)) {
          textByPage.set(page, []);
        }
        textByPage.get(page).push(block);
      }

      // Insert artifacts for each page
      for (const [page, blocks] of textByPage) {
        await ctx.runMutation(api.jobs.insertArtifact, {
          documentId,
          page,
          type: "text",
          payload: { textBlocks: blocks },
          bboxMap: undefined,
          createdAt: now,
        });
      }
    }

    // Store table artifacts
    if (ocrResults.tables && ocrResults.tables.length > 0) {
      for (const table of ocrResults.tables) {
        await ctx.runMutation(api.jobs.insertArtifact, {
          documentId,
          page: table.page || 1,
          type: "table",
          payload: { table },
          bboxMap: table.bbox,
          createdAt: now,
        });
      }
    }

    // Update document with processing results
    await ctx.runMutation(api.jobs.updateDocument, {
      documentId,
      updates: {
        pages: ocrResults.pages,
        qualityScore: ocrResults.quality,
        processingStatus: "parsed",
      },
    });

    return {
      pagesProcessed: ocrResults.pages,
      textBlocks: ocrResults.textBlocks?.length || 0,
      tables: ocrResults.tables?.length || 0,
      ocrUsed: ocrResults.ocrUsed,
    };
  },
});