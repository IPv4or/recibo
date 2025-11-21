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

const MODEL_NAME = "deepseek-chat";

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
router.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body; // Base64 string

        if (!process.env.DEEPSEEK_API_KEY) {
            // Mock Fallback
            await new Promise(r => setTimeout(r, 2000)); // Fake delay
            return res.json({ name: "Mock Item (Server)", price: 5.99, icon: "fa-box" });
        }

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a cashier scanner API. You output ONLY valid JSON. No markdown, no backticks."
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Identify this grocery item. Return JSON with: 'name' (string), 'price' (estimated USD number), 'icon' (font-awesome class like 'fa-apple')." },
                        { type: "image_url", image_url: { url: image } }
                    ]
                }
            ],
            max_tokens: 100
        });

        const content = response.choices[0].message.content;
        // Clean up potential markdown code blocks from DeepSeek response
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(cleanJson));

    } catch (err) {
        console.error("DeepSeek Error:", err.message);
        // Graceful degradation
        res.status(500).json({ name: "Manual Check Needed", price: 0.00, icon: "fa-circle-question" });
    }
});

// @route   POST api/verify-receipt
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems } = req.body;

        if (!process.env.DEEPSEEK_API_KEY) {
            await new Promise(r => setTimeout(r, 2000));
            return res.json({ discrepancies: [], verified: false });
        }

        const prompt = `
        Compare this receipt image against this digital cart: ${JSON.stringify(userItems)}.
        Rules:
        1. Extract items/prices from receipt image.
        2. Compare with cart.
        3. Return JSON: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
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
        newTransaction.save().catch(err => console.error("DB Error", err));

        res.json(result);

    } catch (err) {
        console.error("DeepSeek Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
