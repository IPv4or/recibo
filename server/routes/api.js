const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Transaction = require('../models/Transaction'); 
require('dotenv').config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-key');

// Use the new 2.5 Flash model
// Note: If this is a preview model, sometimes it requires 'gemini-2.5-flash-preview'
// But based on your screenshot, it is listed exactly as:
const MODEL_NAME = "gemini-2.5-flash"; 

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
router.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body; 
        
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ name: "Mock Item (Server)", price: 5.99, icon: "fa-box" });
        }

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        
        const prompt = "Identify this grocery item. Return ONLY a JSON object with fields: 'name' (string), 'price' (estimated number in USD), and 'icon' (a font-awesome class string like 'fa-apple'). Do not include markdown formatting.";
        
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        
        const result = await model.generateContent([
            prompt, 
            { inlineData: { data: base64Data, mimeType: "image/jpeg" }}
        ]);
        
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(text));

    } catch (err) {
        console.error("AI Error:", err.message);
        // Fallback for rate limits or model errors
        res.status(500).json({ 
            name: "Item (Manual Check)", 
            price: 0.00, 
            icon: "fa-circle-exclamation" 
        });
    }
});

// @route   POST api/verify-receipt
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            return res.json({ discrepancies: [], verified: false });
        }

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const prompt = `
        Analyze this receipt image. I have a digital cart with these items: ${JSON.stringify(userItems)}.
        1. Extract all line items and prices from the receipt.
        2. Compare the receipt items against my digital cart.
        3. Return a JSON object.
        Format: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        If the receipt has an item count or total price that doesn't match the cart, flag it.
        `;

        const base64Data = receiptImage.replace(/^data:image\/\w+;base64,/, "");
        
        const result = await model.generateContent([
            prompt, 
            { inlineData: { data: base64Data, mimeType: "image/jpeg" }}
        ]);
        
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisResult = JSON.parse(text);

        // Save to DB (Fire and forget)
        try {
            const newTransaction = new Transaction({
                userItems: userItems,
                verificationResult: analysisResult
            });
            await newTransaction.save();
        } catch (dbErr) {
            console.error("DB Save Failed:", dbErr.message);
        }

        res.json(analysisResult);

    } catch (err) {
        console.error("AI Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
