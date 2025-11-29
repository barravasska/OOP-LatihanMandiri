document.addEventListener('DOMContentLoaded', () => {

    // ✅ URL NGROK YANG BENAR
    const API_BASE_URL = 'https://nonsimilar-carolyn-syncytial.ngrok-free.dev';
    
    console.log("fetching:", `${API_BASE_URL}/api/products`);
    fetch(`${API_BASE_URL}/api/products`, {
        headers: {
            'ngrok-skip-browser-warning': 'true'
        }
    })
    .then(async res => {
        const text = await res.text();
        console.log("RAW RESPONSE:", text);
    })
    .catch(err => console.error(err));

    // --- 1. DEFINISI SEMUA VARIABEL GLOBAL ---
    let cart = []; 
    
    // --- Muat Keranjang dari LocalStorage ---
    const savedCart = localStorage.getItem('cafeCart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            console.error("Error parsing cart from localStorage:", e);
            localStorage.removeItem('cafeCart');
        }
    }
    
    let currentTableNumber = null;
    let currentOrderStatus = null;
    let orderWebSocket = null; // ← WebSocket connection

    // Variabel Keranjang
    const cartItemsEl = document.getElementById('cart-items');
    const cartTotalEl = document.getElementById('cart-total');
    const checkoutButton = document.getElementById('checkout-button');

    // Variabel Modal Meja
    const tableModalOverlay = document.getElementById('table-modal-overlay');
    const tableNumberInput = document.getElementById('table-number-input');
    const tableSubmitBtn = document.getElementById('table-submit-btn');

    
    async function loadProducts() {
        try {
            const [productRes, categoryRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/products`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                }),
                fetch(`${API_BASE_URL}/api/categories`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                })
            ]);
            
            if (!productRes.ok || !categoryRes.ok) {
                throw new Error('Gagal mengambil data menu.');
            }
            
            const products = await productRes.json();
            const categories = await categoryRes.json();
            
            const containers = {
                'menu-kopi': document.getElementById('kopi-grid'),
                'menu-makanan': document.getElementById('makanan-grid'),
                'menu-cemilan': document.getElementById('cemilan-grid'),
                'menu-non-kopi': document.getElementById('non-kopi-grid')
            };
            
            const categoryMap = categories.reduce((map, cat) => {
                map[cat.id] = cat.slug; 
                return map;
            }, {});
            
            products.forEach(product => {
                const categorySlug = categoryMap[product.categoryId];
                const container = containers[categorySlug];
                if (container) {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'menu-item';
                    itemDiv.dataset.id = product.id;
                    itemDiv.dataset.price = product.price;
                    const formattedPrice = new Intl.NumberFormat('id-ID', {
                        style: 'currency', currency: 'IDR', minimumFractionDigits: 0
                    }).format(product.price);
                    itemDiv.innerHTML = `
                        <img src="${product.imageUrl}" alt="${product.name}">
                        <div class="item-content">
                            <h3>${product.name}</h3>
                            <p>${formattedPrice}</p>
                            <button class="add-to-cart">Tambah ke Keranjang</button>
                        </div>
                    `;
                    container.appendChild(itemDiv);
                }
            });
            attachAddToCartListeners();
            initScrollAnimation();
        } catch (error) {
            console.error('Error memuat produk:', error);
            Swal.fire('Error', 'Gagal memuat menu: ' + error.message, 'error');
        }
    }

    function attachAddToCartListeners() {
        document.querySelectorAll('.add-to-cart').forEach(button => {
            button.addEventListener('click', (e) => {
                const itemEl = e.target.closest('.menu-item');
                const item = {
                    id: parseInt(itemEl.dataset.id), // ✅ FIX: Convert ke INTEGER
                    name: itemEl.querySelector('h3').textContent,
                    price: parseInt(itemEl.dataset.price),
                    quantity: 1
                };
                
                // Compare dengan INTEGER
                const existingItem = cart.find(cartItem => cartItem.id === item.id);
                
                if (existingItem) {
                    existingItem.quantity++;
                } else {
                    cart.push(item);
                }
                
                updateCartUI();
                
                // ✅ Feedback visual
                e.target.textContent = '✓ Ditambahkan!';
                e.target.style.backgroundColor = '#27ae60';
                setTimeout(() => {
                    e.target.textContent = 'Tambah ke Keranjang';
                    e.target.style.backgroundColor = '';
                }, 1000);
            });
        });
    }

    function handleRemoveItem(productId) {
        // ✅ FIX: Convert ke INTEGER
        const id = parseInt(productId);
        const itemIndex = cart.findIndex(item => item.id === id);
        
        if (itemIndex === -1) return;
        
        const item = cart[itemIndex];
        if (item.quantity > 1) {
            item.quantity--;
        } else {
            cart.splice(itemIndex, 1);
        }
        updateCartUI();
    }

    function updateCartUI() {
        cartItemsEl.innerHTML = '';
        let total = 0;
        cart.forEach(item => {
            const li = document.createElement('li');
            const itemTotal = item.price * item.quantity;
            const formattedItemTotal = new Intl.NumberFormat('id-ID').format(itemTotal);
            li.innerHTML = `
                <span>${item.name} (x${item.quantity}) - Rp ${formattedItemTotal}</span>
                <button class="remove-item-btn" data-id="${item.id}">–</button>
            `;
            cartItemsEl.appendChild(li);
            total += itemTotal;
            li.querySelector('.remove-item-btn').addEventListener('click', (e) => {
                handleRemoveItem(e.target.dataset.id);
            });
        });
        cartTotalEl.textContent = `Total: Rp ${new Intl.NumberFormat('id-ID').format(total)}`;
        localStorage.setItem('cafeCart', JSON.stringify(cart));
    }

    async function executePayment() {
        checkoutButton.disabled = true;
        checkoutButton.textContent = 'Memproses...';
        try {
            const checkoutData = {
                items: cart.map(item => ({
                    id: parseInt(item.id),
                    quantity: item.quantity,
                    name: item.name,
                    price: item.price
                })),
                table: currentTableNumber
            };
            const response = await fetch(`${API_BASE_URL}/api/checkout`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify(checkoutData)
            });
            const data = await response.json();
            if (data.error) { throw new Error(data.error); }

            if (data.snapToken) {
                window.snap.pay(data.snapToken, {
                    onSuccess: function(result) {
                        Swal.fire({
                            icon: 'success', 
                            title: 'Pembayaran Berhasil!',
                            text: `Pesanan Anda #${data.orderId} sedang diproses.`,
                            timer: 3000, 
                            showConfirmButton: false
                        });
                        
                        cart = [];
                        updateCartUI();
                        
                        // ✅ Ganti polling dengan WebSocket
                        currentOrderStatus = "paid";
                        connectToOrderWebSocket(data.orderId);
                    },
                    onPending: function(result) {
                        Swal.fire('Menunggu Pembayaran', 'Silakan selesaikan pembayaran Anda.', 'info');
                    },
                    onError: function(result) {
                        Swal.fire('Pembayaran Gagal', result.status_message || 'Silakan coba lagi.', 'error');
                    },
                    onClose: function() {
                        Swal.fire('Dibatalkan', 'Anda menutup pop-up pembayaran.', 'warning');
                    }
                });
            }
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Terjadi Kesalahan!', text: error.message });
        } finally {
            checkoutButton.disabled = false;
            checkoutButton.textContent = 'Bayar Sekarang';
        }
    }

    checkoutButton.addEventListener('click', () => {
        if (cart.length === 0) {
            Swal.fire({ icon: 'warning', title: 'Oops...', text: 'Keranjang Anda masih kosong!' });
            return;
        }
        let total = 0;
        let orderSummaryHtml = '<ul style="text-align: left; padding-left: 20px;">';
        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;
            orderSummaryHtml += `<li>${item.name} (x${item.quantity}) - Rp ${new Intl.NumberFormat('id-ID').format(itemTotal)}</li>`;
        });
        const formattedTotal = new Intl.NumberFormat('id-ID').format(total);
        orderSummaryHtml += `</ul><hr><h4 style="text-align: right; margin: 10px 0;">Total: Rp ${formattedTotal}</h4>`;
        Swal.fire({
            title: 'Konfirmasi Pesanan Anda',
            html: orderSummaryHtml,
            icon: 'info',
            showCancelButton: true,
            confirmButtonColor: '#27ae60',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Ya, Konfirmasi & Bayar!',
            cancelButtonText: 'Batal'
        }).then((result) => {
            if (result.isConfirmed) {
                executePayment();
            }
        });
    });

    if (tableSubmitBtn) {
        tableSubmitBtn.addEventListener('click', () => {
            const tableNum = tableNumberInput.value;
            if (!tableNum || tableNum.trim() === '') {
                Swal.fire({ icon: 'error', title: 'Oops...', text: 'Harap masukkan nomor meja Anda.' });
                return;
            }
            currentTableNumber = tableNum;
            tableModalOverlay.style.display = 'none';
            loadProducts(); 
            const tableInfoEl = document.createElement('h3');
            tableInfoEl.textContent = `Meja ${currentTableNumber}`;
            tableInfoEl.style.textAlign = 'center';
            tableInfoEl.style.color = '#A35709';
            document.getElementById('cart-container').prepend(tableInfoEl);
        });
    } else {
        console.error("Elemen 'table-submit-btn' tidak ditemukan.");
    }
    
    if (tableModalOverlay) {
        tableModalOverlay.style.display = 'flex';
    } else {
        console.error("Elemen 'table-modal-overlay' tidak ditemukan.");
        loadProducts();
    }

    // ✅ WebSocket Connection untuk Real-Time Updates
    function connectToOrderWebSocket(orderId) {
        // Close existing connection if any
        if (orderWebSocket) {
            orderWebSocket.close();
        }

        const WS_URL = API_BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
        orderWebSocket = new WebSocket(`${WS_URL}/ws/order/${orderId}`);
        
        orderWebSocket.onopen = () => {
            console.log('✅ Connected to order #' + orderId + ' updates');
        };
        
        orderWebSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'status_update') {
                    console.log('📢 Status update:', data.status);
                    currentOrderStatus = data.status;
                    showStatusNotification(data.status);
                    
                    // Close connection jika pesanan selesai
                    if (data.status === 'complete' || data.status === 'cancelled') {
                        orderWebSocket.close();
                    }
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        orderWebSocket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        orderWebSocket.onclose = () => {
            console.log('🔌 WebSocket connection closed');
        };
    }

    function initScrollAnimation() {
        const scrollElements = document.querySelectorAll(".menu-grid .menu-item");

        if (scrollElements.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate__animated', 'animate__fadeInUp');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1
        });

        scrollElements.forEach(el => {
            el.style.opacity = "0";
            observer.observe(el);
        });
    }

    function showStatusNotification(status) {
        let title = '';
        let icon = 'info';

        if (status === 'processing') {
            title = '👨‍🍳 Pesanan Anda sedang disiapkan!';
            icon = 'info';
        } else if (status === 'ready') {
            title = '✅ Pesanan Anda siap diantar!';
            icon = 'success';
        } else if (status === 'complete') {
            title = '🎉 Pesanan Anda telah diantar! Selamat menikmati!';
            icon = 'success';
        } else if (status === 'cancelled') {
            title = '❌ Pesanan dibatalkan';
            icon = 'error';
        } else {
            return; // Jangan tampilkan notif untuk status lain
        }

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: title,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }
});
