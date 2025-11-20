const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    createdAt: {
        type: Date,
        default: Date.now
    },
    userItems: [{
        name: String,
        price: Number,
        icon: String
    }],
    verificationResult: {
        verified: Boolean,
        discrepancies: [{
            itemName: String,
            issue: String
        }]
    }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
