const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize Gemini AI
// Safe to use process.env here because this runs on the server
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'mock-key');

// @route   GET api/test
// @desc    Tests api connection
// @access  Public
router.get('/test', (req, res) => res.send('API is running'));

// @route   POST api/identify-item
// @desc    Analyze an image to identify a product and price
// @access  Public
router.post('/identify-item', async (req, res) => {
    try {
        const { image } = req.body; // Expecting base64 string
        
        if (!process.env.GEMINI_API_KEY) {
             // Fallback Mock response if no key is configured
            return res.json({
                name: "Mock Item (Server)",
                price: 5.99,
                icon: "fa-box"
            });
        }

        // Real Gemini Implementation
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = "Identify this grocery item. Return ONLY a JSON object with fields: 'name' (string), 'price' (estimated number in USD), and 'icon' (a font-awesome class string like 'fa-apple'). Do not include markdown formatting.";
        
        // Remove header from base64 if present (data:image/jpeg;base64,...)
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg",
            },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        
        // Clean up response to ensure valid JSON
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const itemData = JSON.parse(cleanedText);

        res.json(itemData);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   POST api/verify-receipt
// @desc    Compare receipt image against a list of user items
// @access  Public
router.post('/verify-receipt', async (req, res) => {
    try {
        const { receiptImage, userItems } = req.body;

        if (!process.env.GEMINI_API_KEY) {
            // Mock Response
            return res.json({
                discrepancies: [
                    {
                        item: userItems[0] || { name: "Unknown" },
                        message: "Mock Error: Item found twice on receipt."
                    }
                ],
                verified: false
            });
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
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg",
            },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.json(JSON.parse(cleanedText));

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
