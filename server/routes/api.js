const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Transaction = require('../models/Transaction');
require('dotenv').config();

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || 'mock-key'
});

const MODEL_NAME = "deepseek-chat";

// Helper to clean JSON strings from AI
function extractJson(text) {
    try {
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) return JSON.parse(match[1]);
        
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
            return JSON.parse(text.substring(firstBrace, lastBrace + 1));
        }
        return JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Failed:", text);
        throw new Error("Invalid JSON from AI");
    }
}

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
// @desc    Receives OCR Text -> Returns Item Data
router.post('/identify-item', async (req, res) => {
    try {
        const { scannedText, storeContext } = req.body; 

        if (!process.env.DEEPSEEK_API_KEY) {
            await new Promise(r => setTimeout(r, 1000));
            return res.json({ name: "Mock Item (No Key)", price: 5.99, icon: "fa-box" });
        }

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: `You are a smart grocery assistant. You will receive raw OCR text scanned from a product package at ${storeContext || 'a store'}. Your job is to guess the product name and estimated price. Return valid JSON only.`
                },
                {
                    role: "user",
                    content: `OCR Text: "${scannedText}". \n\nIdentify this item. Return JSON: { "name": "Product Name", "price": 0.00 (estimate), "icon": "fa-apple" (font awesome class) }`
                }
            ],
            max_tokens: 200
        });

        const itemData = extractJson(response.choices[0].message.content);
        res.json(itemData);

    } catch (err) {
        console.error("DeepSeek Identify Error:", err.message);
        res.status(500).json({ name: "Manual Check Required", price: 0.00, icon: "fa-pen" });
    }
});

// @route   POST api/verify-receipt
// @desc    Receives Receipt Text -> Returns Audit
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptText, userItems, storeContext } = req.body;

        if (!process.env.DEEPSEEK_API_KEY) {
            return res.json({ discrepancies: [], verified: false });
        }

        const prompt = `
        Audit this transaction at ${storeContext || 'a store'}.
        
        My Digital Cart: ${JSON.stringify(userItems)}
        
        Receipt OCR Text: 
        ${receiptText}
        
        Task:
        1. Compare the receipt text against my digital cart.
        2. Identify items on receipt NOT in cart (overcharge).
        3. Identify items counted more times on receipt than in cart.
        
        Return JSON ONLY: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        `;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                { role: "system", content: "You are a receipt auditor. Output valid JSON only." },
                { role: "user", content: prompt }
            ],
            max_tokens: 1000
        });

        const result = extractJson(response.choices[0].message.content);

        // Save to DB
        const newTransaction = new Transaction({
            storeContext,
            userItems,
            verificationResult: result
        });
        newTransaction.save().catch(err => console.error("DB Save Error", err));

        res.json(result);

    } catch (err) {
        console.error("DeepSeek Verify Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
