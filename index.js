/*****
 * Full Code Example: index.js
 *
 * This example demonstrates how to:
 * 1. Receive input text and generate a prescription using Gemini AI,
 * 2. Create a PDF entirely in memory with PDFKit,
 * 3. Upload the PDF to Firebase Storage using the Firebase client SDK,
 * 4. Retrieve the download URL, and
 * 5. Send the URL via WhatsApp using the provided API.
 *
 * Make sure you have installed the dependencies:
 *   npm install express fs path pdfkit @google/genai firebase axios cors
 *
 * To run:
 *   node index.js
 *****/

const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { GoogleGenAI, Type } = require("@google/genai");
const axios = require("axios");
const cors = require("cors"); // Import the CORS middleware

// Initialize Firebase using the client SDK
const { initializeApp } = require("firebase/app");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAR9FUui8byCaWX5M4uYeOfQQiuNK9QgMU",
  authDomain: "billing-468b4.firebaseapp.com",
  databaseURL: "https://billing-468b4-default-rtdb.firebaseio.com",
  projectId: "billing-468b4",
  storageBucket: "billing-468b4.firebasestorage.app", // Verify this value in your Firebase console
  messagingSenderId: "710763854212",
  appId: "1:710763854212:web:06d1d4dfbecbf2e6ed05d1",
  measurementId: "G-F4TRTVBGKZ"
};

const firebaseApp = initializeApp(firebaseConfig);
const storage = getStorage(firebaseApp);

const app = express();

// Use CORS middleware to allow requests from any origin
app.use(cors());

// Middleware to parse JSON bodies
app.use(express.json());

// (Optional) Serve static files from the public folder
app.use(express.static("public"));

// Initialize Gemini AI with your API key
const apiKey = "AIzaSyA0G8Jhg6yJu-D_OI97_NXgcJTlOes56P8";
const ai = new GoogleGenAI({ apiKey });

// New endpoint: /generatePrescription
app.post("/generatePrescription", async (req, res) => {
  const inputText = req.body.text;
  if (!inputText) {
    return res.status(400).json({ error: "Missing text input" });
  }

  // Build a prompt for Gemini AI to extract details and generate a prescription
  const prompt = ` Extract the following information and generate a prescription  from the text  if there is any kind thing purchase from medical so add in medicine section:

Text: "${inputText}"

Extract the following details in JSON format:
{
  "patient": {
      "name": "string",
      "age": number,
      "number": "string",
      "gender": "string"
  },
  "symptoms": "string", // e.g., "fever"
  "medicines": [
    {
      "name": "string",
      "consumptionDays": number,
      "times": {
         "morning": boolean,
         "afternoon": boolean,
         "evening": boolean,
         "night": boolean
      },
      "instruction": "string"
    }
  ],
  "overallInstruction": "string"
}

Ensure the JSON is properly formatted.`;

  try {
    // Call Gemini AI to generate the prescription JSON
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            patient: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                age: { type: Type.NUMBER },
                number: { type: Type.STRING },
                gender: { type: Type.STRING }
              },
              required: ["name", "age", "number", "gender"]
            },
            symptoms: { type: Type.STRING },
            medicines: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  consumptionDays: { type: Type.NUMBER },
                  times: {
                    type: Type.OBJECT,
                    properties: {
                      morning: { type: Type.BOOLEAN },
                      afternoon: { type: Type.BOOLEAN },
                      evening: { type: Type.BOOLEAN },
                      night: { type: Type.BOOLEAN }
                    },
                    required: ["morning", "afternoon", "evening", "night"]
                  },
                  instruction: { type: Type.STRING }
                },
                required: ["name", "consumptionDays", "times", "instruction"]
              }
            },
            overallInstruction: { type: Type.STRING }
          },
          required: ["patient", "symptoms", "medicines", "overallInstruction"]
        },
      },
    });

    // Parse the JSON response from Gemini AI
    const extractedData = JSON.parse(response.text);

    // Decide treatment based on symptoms (e.g., if "fever" is mentioned)
    const treatmentType = extractedData.symptoms.toLowerCase().includes("fever")
      ? "Fever Management"
      : "General Management";

    // Build the data structure for PDF generation
    const pdfData = {
      patient: {
        name: extractedData.patient.name,
        phone: extractedData.patient.number,
        doctor: "mudassir", // static doctor name
        treatment: treatmentType
      },
      symptoms: extractedData.symptoms,
      medicines: extractedData.medicines,
      overallInstruction: extractedData.overallInstruction,
      reportGeneratedAt: new Date().toISOString()
    };

    // -----------------------------
    // Create PDF entirely in memory using PDFKit
    // -----------------------------
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      info: {
        Title: `Prescription for ${pdfData.patient.name}`,
        Author: pdfData.patient.doctor,
        Subject: "Medical Prescription",
        Keywords: "prescription, medical, healthcare",
      },
    });

    // Collect PDF data into buffers
    const buffers = [];
    doc.on("data", (chunk) => buffers.push(chunk));

    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(buffers);
      try {
        // Generate a unique filename for the PDF
        const safeName = pdfData.patient.name.replace(/\s+/g, "_");
        const fileName = `${safeName}-${Date.now()}.pdf`;

        // Create a reference to the file in Firebase Storage
        const storageRef = ref(storage, fileName);

        // Upload the PDF buffer to Firebase Storage
        await uploadBytes(storageRef, pdfBuffer, { contentType: "application/pdf" });

        // Retrieve the download URL
        const downloadUrl = await getDownloadURL(storageRef);

        // ---------------------------------------
        // Send the PDF link via WhatsApp using the provided API
        // ---------------------------------------
        const phoneNumber = pdfData.patient.phone.replace(/\s+/g, "");
        const bodyData = {
          token: "9958399157",
          number: `91${phoneNumber}`,
          imageUrl: downloadUrl,
          caption: "Hello, here is your medical prescription. Please review and follow the instructions carefully."
        };

        await axios.post("https://wa.medblisss.com/send-image-url", bodyData);

        return res.status(200).json({
          message: "Prescription generated, uploaded to Firebase, and sent via WhatsApp successfully.",
          firebaseLink: downloadUrl
        });
      } catch (error) {
        console.error("Error uploading to Firebase or sending WhatsApp message:", error);
        return res.status(500).json({ error: "Failed to upload PDF or send WhatsApp message." });
      }
    });

    // -----------------------------
    // Begin writing PDF content
    // -----------------------------
    // Define colors for styling
    const primaryColor = "#1a5276";
    const secondaryColor = "#2e86c1";
    const accentColor = "#0f4ad8";
    const textColor = "#333333";

    // Add letterhead background image if available
    const letterheadPath = path.join(__dirname, "letterhead", "letterhead.png");
    if (fs.existsSync(letterheadPath)) {
      doc.image(letterheadPath, 0, 0, { width: doc.page.width, height: doc.page.height });
    } else {
      console.warn("Letterhead image not found at", letterheadPath);
    }

    // Header & Patient Information Section
    doc.moveDown(1.5);
    const leftX = doc.page.margins.left;
    const rightX = doc.page.width / 2 + 10;
    const currentY = doc.y + 35;

    // Left column: Patient Name and Contact
    doc.font("Helvetica-Bold").fontSize(12)
      .text("Patient Name: ", leftX, currentY, { continued: true })
      .font("Helvetica")
      .text(pdfData.patient.name);

    doc.font("Helvetica-Bold")
      .text("Contact: ", leftX, doc.y + 5, { continued: true })
      .font("Helvetica")
      .text(pdfData.patient.phone);

    // Right column: Attending Physician and Treatment Type
    doc.font("Helvetica-Bold")
      .text("Attending Physician: ", rightX, currentY, { continued: true });
    doc.font("Helvetica")
      .text(pdfData.patient.doctor);

    doc.font("Helvetica-Bold")
      .text("Treatment Type: ", rightX, doc.y + 5, { continued: true });
    doc.font("Helvetica")
      .text(pdfData.patient.treatment);

    doc.moveDown(1.5);

    // Medicines Table Section
    if (pdfData.medicines.length > 0) {
      doc.font("Helvetica-Bold").fontSize(12);
      const tableTop = doc.y;
      const col1X = leftX;         // Medicine Name
      const col2X = col1X + 130;     // Duration
      const col3X = col2X + 80;      // Timing
      const col4X = col3X + 120;     // Instructions

      // Table header background
      doc.rect(
        leftX - 5,
        tableTop - 5,
        doc.page.width - doc.page.margins.left - doc.page.margins.right + 10,
        25
      ).fill(accentColor);

      // Table header text
      doc.fillColor("white")
        .text("MEDICATION", col1X, tableTop, { width: 180, align: "left" })
        .text("DURATION", col2X, tableTop, { width: 70, align: "center" })
        .text("TIMING", col3X, tableTop, { width: 80, align: "center" })
        .text("INSTRUCTIONS", col4X, tableTop, { width: 150, align: "left" });
      doc.moveDown(0.8);

      // Table body rows with alternating background
      doc.fillColor(textColor);
      pdfData.medicines.forEach((med, index) => {
        let rowY = doc.y;

        // Calculate row height based on content
        const medNameHeight = doc.heightOfString(med.name, { width: 180, align: "left" });
        const daysText = `${med.consumptionDays} days`;
        const daysHeight = doc.heightOfString(daysText, { width: 60, align: "center" });
        const timesArr = [];
        if (med.times.morning) timesArr.push("Morning");
        if (med.times.afternoon) timesArr.push("Afternoon");
        if (med.times.evening) timesArr.push("Evening");
        if (med.times.night) timesArr.push("Night");
        const timesStr = timesArr.join(", ");
        const timesHeight = doc.heightOfString(timesStr, { width: 80, align: "center" });
        const instructionHeight = doc.heightOfString(med.instruction, { width: 150, align: "left" });
        const calculatedRowHeight = Math.max(medNameHeight, daysHeight, timesHeight, instructionHeight, 25);

        // Apply alternating background for rows
        if (index % 2 === 0) {
          doc.rect(
            leftX - 5,
            rowY - 5,
            doc.page.width - doc.page.margins.left - doc.page.margins.right + 10,
            calculatedRowHeight
          ).fill("#f2f6f9");
        }

        // Output cells
        doc.fillColor(textColor)
          .font("Helvetica-Bold")
          .text(med.name, col1X, rowY, { width: 180, align: "left" });
        doc.font("Helvetica")
          .text(daysText, col2X, rowY, { width: 60, align: "center" })
          .text(timesStr, col3X, rowY, { width: 80, align: "center" })
          .text(med.instruction, col4X, rowY, { width: 150, align: "left" });

        doc.y = rowY + calculatedRowHeight + 5;
      });
    }

    doc.moveDown(1);

    // Overall Instructions Section
    const instructionsY = doc.y;
    doc.fillColor(textColor)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("SPECIAL INSTRUCTIONS", leftX, instructionsY, { align: "left" });
    doc.moveDown(0.2);

    const instructionsBoxY = doc.y;
    doc.rect(
      leftX - 5,
      instructionsBoxY - 5,
      doc.page.width - doc.page.margins.left - doc.page.margins.right + 10,
      80
    ).fill("#f2f6f9");
    doc.fillColor(textColor)
      .font("Helvetica")
      .fontSize(12)
      .text(pdfData.overallInstruction, leftX, instructionsBoxY, {
        align: "left",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });

    doc.moveDown(1);

    // Diagnosis / Symptoms Section
    doc.fillColor(textColor)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Symptoms/Condition: ", { continued: true });
    doc.font("Helvetica")
      .text(pdfData.symptoms, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "left",
      });

    doc.moveDown(1.5);

    // Doctor's Signature Section
    const signatureY = doc.y + 20;
    doc.fontSize(12)
      .font("Helvetica")
      .text("Date & Time:", leftX, signatureY, { continued: true })
      .font("Helvetica-Bold")
      .text(` ${new Date(pdfData.reportGeneratedAt).toLocaleString()}`);

    doc.moveTo(rightX, signatureY + 25)
      .lineTo(rightX + 150, signatureY + 25)
      .lineWidth(1)
      .stroke();

    doc.font("Helvetica-Bold")
      .text(pdfData.patient.doctor, rightX, signatureY + 30, { width: 150, align: "center" });

    // Finalize the PDF document
    doc.end();

  } catch (error) {
    console.error("Error generating prescription:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server is available at http://localhost:${PORT}`);
});
