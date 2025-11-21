const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Transaction = require('../models/Transaction');
require('dotenv').config();

// Initialize OpenAI client pointing to DeepSeek
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || 'mock-key'
});

// "deepseek-chat" currently points to DeepSeek-V3
const MODEL_NAME = "deepseek-chat";

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
router.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body; 

        if (!process.env.DEEPSEEK_API_KEY) {
            await new Promise(r => setTimeout(r, 1500)); 
            return res.json({ name: "Mock Item (No Key)", price: 5.99, icon: "fa-box" });
        }

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a grocery scanner. Return ONLY valid JSON. No markdown."
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Identify this item. JSON keys: 'name', 'price' (number), 'icon' (font-awesome class)." },
                        { type: "image_url", image_url: { url: image } }
                    ]
                }
            ],
            max_tokens: 100
        });

        const content = response.choices[0].message.content;
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanJson));

    } catch (err) {
        console.error("DeepSeek Error:", err.message);
        // Fallback if Vision fails or key is missing
        res.status(500).json({ 
            name: "Manual Check Required", 
            price: 0.00, 
            icon: "fa-pen-to-square" 
        });
    }
});

// @route   POST api/verify-receipt
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems } = req.body;

        if (!process.env.DEEPSEEK_API_KEY) {
            return res.json({ discrepancies: [], verified: false });
        }

        const prompt = `
        Audit this transaction.
        My Digital Cart: ${JSON.stringify(userItems)}.
        
        Task:
        1. Read items from the receipt image.
        2. Compare against my cart.
        3. Identify items on receipt NOT in cart (overcharge).
        4. Identify items counted more times on receipt than in cart.
        
        Return JSON: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        `;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a receipt auditor. Output valid JSON only."
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: receiptImage } }
                    ]
                }
            ],
            max_tokens: 1000
        });

        const content = response.choices[0].message.content;
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson);

        // Async DB Save
        const newTransaction = new Transaction({
            userItems: userItems,
            verificationResult: result
        });
        newTransaction.save().catch(err => console.error("DB Save Error", err));

        res.json(result);

    } catch (err) {
        console.error("DeepSeek Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
