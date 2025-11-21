class ReciboApp {
    constructor() {
        this.state = {
            items: [],
            storeName: "",
            editingId: null,
            receiptImage: null,
            verificationResult: null 
        };
        this.stream = null;
        this.init();
    }

    init() {
        const devBtn = document.getElementById('devBtn');
        if(devBtn) devBtn.style.display = 'none'; 
    }

    switchView(viewId) {
        if (this.stream) this.stopCamera();
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');

        if (viewId === 'view-scanner') this.startCamera('camera-feed');
        if (viewId === 'view-receipt-scanner') this.startCamera('receipt-camera-feed');
        if (viewId === 'view-list') this.renderCart();
    }

    async startCamera(videoElementId) {
        try {
            const video = document.getElementById(videoElementId);
            this.stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            video.srcObject = this.stream;
            if(videoElementId === 'camera-feed') this.updateScannerBadge();
        } catch (err) {
            console.warn("Camera access denied or unavailable.");
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }

    startShopping() {
        const storeInput = document.getElementById('store-input');
        this.state.storeName = storeInput.value.trim() || "Generic Store";

        this.state.items = [];
        this.updateScannerBadge();
        this.switchView('view-scanner');
    }

    // --- OCR FUNCTION ---
    async performOCR(imageData) {
        try {
            const result = await Tesseract.recognize(imageData, 'eng');
            return result.data.text;
        } catch (error) {
            console.error("OCR Error:", error);
            return "";
        }
    }

    async captureItem() {
        const video = document.getElementById('camera-feed');
        const imageUrl = this.getFrameFromVideo(video);
        
        this.animateJumpToBag(imageUrl);

        const tempId = Date.now();
        this.state.items.push({
            id: tempId,
            name: "Reading Label...",
            price: 0.00,
            icon: "fa-spinner fa-spin",
            isProcessing: true
        });
        this.updateScannerBadge();

        // 1. OCR (Frontend)
        const scannedText = await this.performOCR(imageUrl);
        
        if (!scannedText || scannedText.trim().length < 3) {
             this.updateItemState(tempId, {
                 name: "Couldn't Read Text",
                 icon: "fa-pen",
                 isProcessing: false
             });
             return;
        }

        // 2. DeepSeek (Backend)
        try {
            const response = await fetch('/api/identify-item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    scannedText: scannedText,
                    storeContext: this.state.storeName 
                })
            });
            const data = await response.json();
            
            this.updateItemState(tempId, {
                name: data.name || "Unknown Item",
                price: data.price || 0.00,
                icon: data.icon || "fa-box",
                isProcessing: false
            });
            
        } catch (error) {
            this.updateItemState(tempId, {
                name: "Manual Check Required",
                isProcessing: false
            });
        }
    }

    updateItemState(id, newState) {
        const index = this.state.items.findIndex(i => i.id === id);
        if (index !== -1) {
            this.state.items[index] = { ...this.state.items[index], ...newState };
        }
        this.updateScannerBadge();
    }

    startReceiptScan() {
        this.switchView('view-receipt-scanner');
    }

    async captureReceipt() {
        const video = document.getElementById('receipt-camera-feed');
        const imageUrl = this.getFrameFromVideo(video);
        this.state.receiptImage = imageUrl;
        this.handleReceiptVerification(imageUrl);
    }

    async handleReceiptVerification(imageUrl) {
        document.getElementById('processing-title').innerText = "Scanning Receipt...";
        document.getElementById('processing-subtitle').innerText = "Reading text...";
        this.switchView('view-processing');

        // 1. OCR (Frontend)
        const receiptText = await this.performOCR(imageUrl);

        document.getElementById('processing-title').innerText = "Auditing...";
        document.getElementById('processing-subtitle').innerText = "DeepSeek analyzing...";

        // 2. DeepSeek (Backend)
        try {
            const response = await fetch('/api/verify-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    receiptText: receiptText,
                    userItems: this.state.items,
                    storeContext: this.state.storeName
                })
            });

            const result = await response.json();
            this.state.verificationResult = result;
            this.showResults();

        } catch (error) {
            console.error("Verification error:", error);
            alert("Verification failed.");
            this.switchView('view-list');
        }
    }

    getFrameFromVideo(video) {
        const canvas = document.getElementById('capture-canvas');
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth || 300;
        canvas.height = video.videoHeight || 300;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
        } else {
            context.fillStyle = '#333';
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        return canvas.toDataURL('image/jpeg', 0.9); 
    }

    // ... (Animation and Manual Edit functions) ...
    async animateJumpToBag(imageUrl) {
        const flyImg = document.createElement('img');
        flyImg.src = imageUrl;
        flyImg.className = 'flying-item';
        const startX = window.innerWidth / 2;
        const startY = window.innerHeight / 2;
        flyImg.style.width = `250px`;
        flyImg.style.height = `250px`;
        flyImg.style.opacity = '1';
        flyImg.style.left = `${startX}px`;
        flyImg.style.top = `${startY}px`;
        document.body.appendChild(flyImg);
        const bagBtn = document.getElementById('scanner-bag-btn');
        const rect = bagBtn.getBoundingClientRect();
        const targetX = rect.left + (rect.width / 2);
        const targetY = rect.top + (rect.height / 2);
        const duration = 800; 
        const startTime = performance.now();
        return new Promise(resolve => {
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress < .5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
                const currentX = startX + (targetX - startX) * ease;
                const currentY = startY + (targetY - startY) * ease - (Math.sin(progress * Math.PI) * 150);
                const currentSize = 250 - ((250 - 20) * ease);
                flyImg.style.left = `${currentX}px`;
                flyImg.style.top = `${currentY}px`;
                flyImg.style.width = `${currentSize}px`;
                flyImg.style.height = `${currentSize}px`;
                if (progress < 1) { requestAnimationFrame(animate); } else { flyImg.remove(); resolve(); }
            };
            requestAnimationFrame(animate);
        });
    }

    openManualAdd(id = null) {
        const modal = document.getElementById('manual-modal');
        const nameInput = document.getElementById('manual-name');
        const priceInput = document.getElementById('manual-price');
        const title = document.getElementById('modal-title');
        modal.classList.remove('hidden');
        if (id) {
            const item = this.state.items.find(i => i.id === id);
            if (item) {
                this.state.editingId = id;
                nameInput.value = item.name;
                priceInput.value = item.price;
                title.innerText = "Edit Item";
            }
        } else {
            this.state.editingId = null;
            nameInput.value = '';
            priceInput.value = '';
            title.innerText = "Add Manual Item";
        }
        nameInput.focus();
    }

    closeManualAdd() {
        document.getElementById('manual-modal').classList.add('hidden');
        this.state.editingId = null;
    }

    saveManualItem() {
        const nameInput = document.getElementById('manual-name');
        const priceInput = document.getElementById('manual-price');
        const name = nameInput.value || "Item";
        const price = parseFloat(priceInput.value) || 0;
        if (this.state.editingId) {
            const index = this.state.items.findIndex(i => i.id === this.state.editingId);
            if (index !== -1) {
                this.state.items[index] = { ...this.state.items[index], name: name, price: price };
            }
        } else {
            this.state.items.push({ name: name, price: price, icon: "fa-pen", id: Date.now(), isProcessing: false });
        }
        this.closeManualAdd();
        this.renderCart();
        this.updateScannerBadge();
    }

    deleteItem(id) {
        this.state.items = this.state.items.filter(item => item.id !== id);
        this.renderCart();
        this.updateScannerBadge();
    }

    updateScannerBadge() {
        const badge = document.getElementById('scanner-badge');
        if (!badge) return;
        const count = this.state.items.length;
        const isProcessing = this.state.items.some(i => i.isProcessing);
        if (isProcessing) {
            badge.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-[10px]"></i>';
            badge.classList.add('bg-brand-400', 'text-black');
        } else {
            badge.innerText = count;
            badge.classList.remove('bg-brand-400', 'text-black');
        }
        if (count > 0) {
            badge.classList.remove('scale-0');
            badge.classList.add('scale-100');
        } else {
            badge.classList.add('scale-0');
        }
    }

    renderCart() {
        const container = document.getElementById('cart-items');
        const countEl = document.getElementById('item-count');
        const totalEl = document.getElementById('cart-total');
        container.innerHTML = '';
        if (this.state.items.length === 0) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center h-64 text-gray-700 mt-12"><i class="fa-solid fa-basket-shopping text-5xl mb-4 opacity-20"></i><p>Your cart is empty.</p></div>`;
            countEl.innerText = '0'; totalEl.innerText = '$0.00'; return;
        }
        let total = 0;
        [...this.state.items].reverse().forEach((item) => {
            if (!item.isProcessing) total += item.price;
            const el = document.createElement('div');
            const processingClass = item.isProcessing ? 'opacity-70 animate-pulse border-brand-500/50' : 'border-gray-800';
            el.className = `bg-gray-900 p-4 rounded-2xl border ${processingClass} flex justify-between items-center animate-[fadeIn_0.3s_ease-out] group`;
            el.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center text-gray-400"><i class="fa-solid ${item.icon}"></i></div>
                    <div><h4 class="font-bold text-white leading-tight">${item.name}</h4>${item.isProcessing ? '<p class="text-xs text-brand-400 mt-1">Analyzing...</p>' : ''}</div>
                </div>
                <div class="flex items-center gap-2">
                    <div class="font-medium text-white mr-2">$${item.price.toFixed(2)}</div>
                    <button onclick="app.openManualAdd(${item.id})" class="w-8 h-8 rounded-full bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 hover:text-white transition-colors"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="app.deleteItem(${item.id})" class="w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>`;
            container.appendChild(el);
        });
        countEl.innerText = this.state.items.length;
        totalEl.innerText = '$' + total.toFixed(2);
    }

    showResults() {
        this.switchView('view-results');
        const result = this.state.verificationResult;
        const hasIssues = result && result.discrepancies && result.discrepancies.length > 0;
        const container = document.getElementById('status-card');
        const list = document.getElementById('discrepancies-list');
        const verifiedList = document.getElementById('verified-list-preview');
        list.innerHTML = ''; verifiedList.innerHTML = '';
        document.getElementById('timestamp-display').innerText = new Date().toLocaleDateString('en-US', { hour: 'numeric', minute: 'numeric' });

        if (hasIssues) {
            container.className = "bg-red-500/10 rounded-2xl p-6 mb-6 border border-red-500/20 flex flex-col gap-4";
            container.innerHTML = `<div class="flex items-center gap-3"><div class="bg-red-500 text-white w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-lg shadow-red-500/20"><i class="fa-solid fa-exclamation"></i></div><div><h3 class="font-bold text-white text-lg">Discrepancies Found</h3><p class="text-red-200 text-sm">${result.discrepancies.length} potential error(s).</p></div></div>`;
            result.discrepancies.forEach(issue => {
                const el = document.createElement('div');
                el.className = "bg-gray-900 rounded-xl p-4 border-l-4 border-red-500";
                el.innerHTML = `<div class="flex justify-between items-start mb-2"><h4 class="font-bold text-white text-lg">${issue.itemName || "Unknown Item"}</h4><span class="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded">Error</span></div><p class="text-gray-400 text-sm leading-relaxed mb-4">${issue.issue || issue.message}</p><div class="flex gap-3"><button onclick="app.showDispute()" class="flex-1 bg-white text-black py-2 rounded-lg font-bold text-sm hover:bg-gray-200">Dispute Charge</button><button class="px-4 py-2 border border-gray-700 rounded-lg text-gray-400 text-sm font-medium hover:text-white">Dismiss</button></div>`;
                list.appendChild(el);
            });
        } else {
            container.className = "bg-brand-900/20 rounded-2xl p-6 mb-6 border border-brand-500/20 flex items-center gap-4";
            container.innerHTML = `<div class="bg-brand-500 text-black w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg shadow-brand-500/20"><i class="fa-solid fa-check"></i></div><div><h3 class="font-bold text-white text-lg">All Clear</h3><p class="text-brand-400 text-sm">Receipt matches your cart perfectly.</p></div>`;
            list.innerHTML = `<p class="text-gray-600 text-center text-sm italic">No errors detected.</p>`;
        }
        this.state.items.forEach(item => {
            const el = document.createElement('div');
            el.className = "flex justify-between text-sm py-2 border-b border-gray-800 text-gray-500";
            el.innerHTML = `<span>${item.name}</span><span>Matched</span>`;
            verifiedList.appendChild(el);
        });
    }

    showDispute() {
        this.switchView('view-dispute');
        const img = document.getElementById('dispute-image');
        img.src = this.state.receiptImage || ''; 
        const highlight = document.getElementById('dispute-highlight');
        highlight.style.top = '40%'; highlight.style.left = '10%'; highlight.style.width = '80%'; highlight.style.height = '60px';
    }

    wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    reset() { this.switchView('view-landing'); }
}

window.app = new ReciboApp();
