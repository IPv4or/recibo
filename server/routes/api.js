const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Transaction = require('../models/Transaction'); // Import the model
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-key');

router.get('/test', (req, res) => res.send('API is running'));

router.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body;
        
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ name: "Mock Item (Server)", price: 5.99, icon: "fa-box" });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "Identify this grocery item. Return ONLY a JSON object with fields: 'name' (string), 'price' (estimated number in USD), and 'icon' (a font-awesome class string like 'fa-apple'). Do not include markdown.";
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        
        const result = await model.generateContent([prompt, { inlineData: { data: base64Data, mimeType: "image/jpeg" }}]);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(text));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems } = req.body;

        // 1. AI Analysis
        if (!process.env.GEMINI_API_KEY) {
            return res.json({ discrepancies: [{ item: { name: "Unknown" }, message: "Mock Error" }], verified: false });
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `
        Analyze this receipt image. I have a digital cart with these items: ${JSON.stringify(userItems)}.
        1. Extract all line items and prices from the receipt.
        2. Compare the receipt items against my digital cart.
        3. Return a JSON object.
        Format: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        If the receipt has an item count or total price that doesn't match the cart, flag it.
        `;

        const base64Data = receiptImage.replace(/^data:image\/\w+;base64,/, "");
        const result = await model.generateContent([prompt, { inlineData: { data: base64Data, mimeType: "image/jpeg" }}]);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        const analysisResult = JSON.parse(text);

        // 2. SAVE TO MONGODB
        // Only attempt save if DB connection is active
        try {
            const newTransaction = new Transaction({
                userItems: userItems,
                verificationResult: analysisResult
            });
            await newTransaction.save();
            console.log("Transaction saved to MongoDB");
        } catch (dbErr) {
            console.error("DB Save Failed (continuing anyway):", dbErr.message);
        }

        res.json(analysisResult);

    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
