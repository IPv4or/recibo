const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const Transaction = require('../models/Transaction');
require('dotenv').config();

// Initialize DeepSeek Client
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY || 'mock-key'
});

// --- MODEL CONFIGURATION ---
// Verify these exact slugs in your DeepSeek Platform documentation
const MODEL_VISION = "deepseek-vl"; // For identifying items
const MODEL_OCR    = "deepseek-ocr"; // For reading receipts
const MODEL_LOGIC  = "deepseek-chat"; // For auditing logic (V3)

router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
// @desc    Uses DeepSeek-VL (Vision Language) to see the product
router.post('/identify-item', async (req, res) => {
    try {
        const { image, storeContext } = req.body; 

        if (!process.env.DEEPSEEK_API_KEY) {
            await new Promise(r => setTimeout(r, 1500)); 
            return res.json({ name: "Mock Item (No Key)", price: 5.99, icon: "fa-box" });
        }

        const response = await openai.chat.completions.create({
            model: MODEL_VISION, // Special Vision Model
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Identify this grocery item from ${storeContext || 'a store'}. Return ONLY a JSON object with: 'name' (string), 'price' (estimated number), 'icon' (font-awesome class).` },
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
        console.error("DeepSeek VL Error:", err.message);
        res.status(500).json({ 
            name: "Manual Check Required", 
            price: 0.00, 
            icon: "fa-pen-to-square" 
        });
    }
});

// @route   POST api/verify-receipt
// @desc    Multi-Step: OCR -> Logic
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems, storeContext } = req.body;

        if (!process.env.DEEPSEEK_API_KEY) {
            return res.json({ discrepancies: [], verified: false });
        }

        // STEP 1: Extract Text using DeepSeek-OCR
        // We prompt the specialized model to just transcribe
        let receiptText = "";
        try {
            const ocrResponse = await openai.chat.completions.create({
                model: MODEL_OCR,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Transcribe this receipt into structured text. List every item and price." },
                            { type: "image_url", image_url: { url: receiptImage } }
                        ]
                    }
                ],
                max_tokens: 1000
            });
            receiptText = ocrResponse.choices[0].message.content;
        } catch (ocrErr) {
            console.error("OCR Model failed, falling back to VL:", ocrErr.message);
            // Fallback: Try to use the Vision model if OCR model fails/doesn't exist
            const fallbackResponse = await openai.chat.completions.create({
                model: MODEL_VISION,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Read this receipt. Output all text found." },
                            { type: "image_url", image_url: { url: receiptImage } }
                        ]
                    }
                ]
            });
            receiptText = fallbackResponse.choices[0].message.content;
        }

        // STEP 2: Audit using DeepSeek-Chat (V3)
        // Now we process the text with the high-intelligence model
        const logicPrompt = `
        Audit this transaction at ${storeContext || 'a store'}.
        
        User's App Cart: ${JSON.stringify(userItems)}
        
        Receipt Scan Results:
        ${receiptText}
        
        Task:
        1. Match items fuzzily (e.g. "Bananas" == "Organic Banana").
        2. Identify items on the receipt that are NOT in the App Cart (Overcharge).
        3. Identify double scans (appearing more times on receipt than in cart).
        
        Return JSON ONLY: { "verified": boolean, "discrepancies": [ { "itemName": string, "issue": string } ] }
        `;

        const auditResponse = await openai.chat.completions.create({
            model: MODEL_LOGIC,
            messages: [
                { role: "system", content: "You are a strict auditor API. Output JSON only." },
                { role: "user", content: logicPrompt }
            ],
            response_format: { type: 'json_object' }
        });

        const auditContent = auditResponse.choices[0].message.content;
        const result = JSON.parse(auditContent);

        // Save Transaction
        const newTransaction = new Transaction({
            userItems: userItems,
            verificationResult: result
        });
        newTransaction.save().catch(err => console.error("DB Error", err));

        res.json(result);

    } catch (err) {
        console.error("DeepSeek Pipeline Error:", err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
