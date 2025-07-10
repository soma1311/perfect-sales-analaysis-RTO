import { insertSalesDataSchema, type InsertSalesData } from "@shared/schema";
import 'dotenv/config';
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import * as XLSX from "xlsx";
import { storage } from "./storage";

interface MulterRequest extends Request {
  file?: any;
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req: any, file: any, cb: any) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.oasis.opendocument.spreadsheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload an Excel file.'));
    }
  }
});

// Move this helper function to the top-level of the file (outside of any block)
async function parallelGeocode(rows: any[], concurrency = 10): Promise<any[]> {
  let index = 0;
  const results = new Array(rows.length);
  async function worker() {
    while (index < rows.length) {
      const i = index++;
      const row = rows[i];
      try {
        const rowData = row as any;
        const year = parseInt(rowData['Year'] || rowData['year'] || '0');
        const state = rowData['state'] || rowData['State'] || '';
        const city = rowData['city'] || rowData['City'] || '';
        const maker = rowData['Maker'] || rowData['maker'] || '';
        const rto = rowData['rto'] || '';
        const district = rowData['district'] || rowData['District'] || '';

        // Only process years 2022-2025
        if (![2022, 2023, 2024, 2025].includes(year)) return;

        // Use geocoding API to get coordinates
        let latitude = 0;
        let longitude = 0;
        const apiKey = process.env.GOOGLE_MAP_API || process.env.GOOGLE_GEOCODING_API;
        if (apiKey && state && city) {
          try {
            const address = `${city}, ${state}, India`;
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
            const geocodeResponse = await fetch(geocodeUrl);
            const geocodeData = await geocodeResponse.json();
            if (geocodeData.status === 'OK' && geocodeData.results.length > 0) {
              const location = geocodeData.results[0].geometry.location;
              latitude = location.lat;
              longitude = location.lng;
            }
          } catch {}
        }

        // Sum all months for the year
        const months = [
          'JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'
        ];
        let yearTotal = 0;
        const monthValues: Record<string, number> = {};
        for (const m of months) {
          const val = parseInt(rowData[m] || rowData[m.toLowerCase()] || '0');
          yearTotal += val;
          monthValues[m] = val;
        }
        const total = parseInt(rowData['total'] || rowData['Total'] || '0') || yearTotal;

        // Prepare sales fields
        let sales2022 = 0, sales2023 = 0, sales2024 = 0, sales2025 = 0;
        if (year === 2022) sales2022 = yearTotal;
        if (year === 2023) sales2023 = yearTotal;
        if (year === 2024) sales2024 = yearTotal;
        if (year === 2025) sales2025 = yearTotal;

        if (!state || !city) return;

        const salesData: InsertSalesData & Record<string, number | string> = {
          state,
          city,
          maker,
          rto,
          district,
          latitude,
          longitude,
          sales2022,
          sales2023,
          sales2024,
          sales2025,
          total,
          ...monthValues // for frontend filtering
        };

        // Validate with schema (ignore extra month fields)
        const validatedData = insertSalesDataSchema.parse(salesData);
        results[i] = { ...validatedData, ...monthValues, maker };
      } catch (error) {
        results[i] = undefined;
      }
    }
  }
  // Start workers
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Get all sales data
  app.get("/api/sales-data", async (req, res) => {
    try {
      const data = await storage.getAllSalesData();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales data" });
    }
  });

  // Upload and parse Excel file
  app.post("/api/upload-excel", upload.single('file'), async (req: MulterRequest, res) => {
    try {
      console.log('Upload request received:', {
        hasFile: !!req.file,
        contentType: req.headers['content-type'],
        bodyKeys: Object.keys(req.body || {}),
        fileKeys: req.file ? Object.keys(req.file) : []
      });
      
      if (!req.file) {
        console.log('No file found in request');
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse Excel file
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonDataRaw = XLSX.utils.sheet_to_json(worksheet);
      // Normalize all keys to lowercase
      const jsonData = jsonDataRaw.map(row =>
        Object.fromEntries(
          Object.entries(row as Record<string, any>).map(([key, value]) => [key.trim().toLowerCase(), value])
        )
      );

      // Validate and transform data
      
      // Use parallel geocoding for all rows
      const salesDataArray = await parallelGeocode(jsonData, 10); // 10 concurrent requests

      if (salesDataArray.length === 0) {
        return res.status(400).json({ 
          message: "No valid data found in the Excel file. Please check the format and required columns." 
        });
      }

      // Clear existing data and insert new data in batches
      await storage.clearSalesData();
      const BATCH_SIZE = 1000;
      let insertedCount = 0;
      for (let i = 0; i < salesDataArray.length; i += BATCH_SIZE) {
        const batch = salesDataArray.slice(i, i + BATCH_SIZE);
        const inserted = await storage.createMultipleSalesData(batch);
        insertedCount += inserted.length;
        // Yield to event loop to avoid blocking
        await new Promise(resolve => setImmediate(resolve));
      }

      res.json({ 
        message: `Successfully imported ${insertedCount} records`,
        count: insertedCount,
      });

    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process Excel file" 
      });
    }
  });

  // Get analytics/metrics
  app.get("/api/analytics", async (req, res) => {
    try {
      const data = await storage.getAllSalesData();
      
      if (data.length === 0) {
        return res.json({
          totalMarkets: 0,
          totalSales2024: 0,
          avgGrowthRate: 0,
          marketPenetration: 0,
          activeMarkets: 0,
          growthMarkets: 0,
          emergingMarkets: 0
        });
      }

      const totalMarkets = data.length;
      const totalSales2024 = data.reduce((sum, item) => sum + item.sales2024, 0);
      
      // Calculate average growth rate (2022 to 2025)
      const growthRates = data.map(item => {
        if (item.sales2022 === 0) return 0;
        return ((item.sales2025 - item.sales2022) / item.sales2022) * 100;
      }).filter(rate => !isNaN(rate) && isFinite(rate));
      
      const avgGrowthRate = growthRates.length > 0 
        ? growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length 
        : 0;

      // Market categorization
      const activeMarkets = data.filter(item => item.total > 0).length;
      const growthMarkets = data.filter(item => {
        if (item.sales2022 === 0) return item.sales2025 > 0;
        return ((item.sales2025 - item.sales2022) / item.sales2022) > 0.1; // >10% growth
      }).length;
      const emergingMarkets = data.filter(item => {
        if (item.sales2022 === 0) return item.sales2025 > 0;
        return ((item.sales2025 - item.sales2022) / item.sales2022) > 0.5; // >50% growth
      }).length;

      const marketPenetration = totalMarkets > 0 ? (activeMarkets / totalMarkets) * 100 : 0;

      res.json({
        totalMarkets,
        totalSales2024,
        avgGrowthRate: Math.round(avgGrowthRate * 10) / 10,
        marketPenetration: Math.round(marketPenetration * 10) / 10,
        activeMarkets,
        growthMarkets,
        emergingMarkets
      });

    } catch (error) {
      res.status(500).json({ message: "Failed to calculate analytics" });
    }
  });

  // Geocoding proxy endpoint
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;
      const apiKey = process.env.GOOGLE_MAP_API || process.env.GOOGLE_GEOCODING_API || process.env.VITE_GOOGLE_MAPS_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ message: "Google Maps API key not configured" });
      }

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
      );
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Geocoding failed" });
    }
  });

  // Get Google Maps API key
  app.get("/api/maps-config", async (req, res) => {
    try {
      const apiKey = process.env.GOOGLE_MAP_API || process.env.GOOGLE_GEOCODING_API;
      res.json({ apiKey: apiKey || null });
    } catch (error) {
      res.status(500).json({ message: "Failed to get maps configuration" });
    }
  });

  // Clear all sales data
  app.post("/api/clear-sales-data", async (req, res) => {
    try {
      await storage.clearSalesData();
      res.json({ message: "Sales data cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear sales data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
