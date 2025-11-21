const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Transaction = require('../models/Transaction');
require('dotenv').config();

const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || 'mock-key'
});

// V3.2-Exp supports OCR/Multimodal via the chat endpoint
const MODEL_NAME = "deepseek-chat";

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
// @desc    Uses DeepSeek Native OCR to read product label
router.post('/identify-item', async (req, res) => {
    try {
        const { image, storeContext } = req.body; 

        if (!process.env.DEEPSEEK_API_KEY) {
            await new Promise(r => setTimeout(r, 1500)); 
            return res.json({ name: "Mock Item (No Key)", price: 5.99, icon: "fa-box" });
        }

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: `You are an intelligent grocery scanner at ${storeContext || 'a store'}. Your goal is to identifying the product name from the image text (OCR). Return ONLY valid JSON.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Read the product packaging text. Return JSON with keys: 'name' (extracted name), 'price' (estimated USD number), 'icon' (font-awesome class)." },
                        { type: "image_url", image_url: { url: image } }
                    ]
                }
            ],
            max_tokens: 150
        });

        const content = response.choices[0].message.content;
        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        res.json(JSON.parse(cleanJson));

    } catch (err) {
        console.error("DeepSeek Vision Error:", err.message);
        // Fallback to Tesseract if DeepSeek vision fails? 
        // For now, just error out gracefully so we know.
        res.status(500).json({ 
            name: "Manual Check Needed", 
            price: 0.00, 
            icon: "fa-pen-to-square" 
        });
    }
});

// @route   POST api/verify-receipt
// @desc    Uses DeepSeek Native OCR to read receipt
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems, storeContext } = req.body;

        if (!process.env.DEEPSEEK_API_KEY) {
            return res.json({ discrepancies: [], verified: false });
        }

        const prompt = `
        Audit this transaction at ${storeContext || 'a store'}.
        My Digital Cart: ${JSON.stringify(userItems)}.
        
        Task:
        1. EXTRACT (OCR) all text from the receipt image provided.
        2. Compare extracted receipt items against my digital cart.
        3. Identify items on receipt NOT in cart (overcharge).
        4. Identify items counted more times on receipt than in cart.
        
        Return JSON: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        `;

        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [
                {
                    role: "system",
                    content: "You are a receipt auditor with OCR capabilities. Output valid JSON only."
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
