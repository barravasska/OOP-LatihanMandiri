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
    
    // --- KODE BARU: Muat Keranjang dari LocalStorage ---
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
    let pollingInterval = null;

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
                fetch(`https://nonsimilar-carolyn-syncytial.ngrok-free.dev/api/products`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                }),
                fetch(`https://nonsimilar-carolyn-syncytial.ngrok-free.dev/api/categories`, {
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
                        id: itemEl.dataset.id,
                        name: itemEl.querySelector('h3').textContent,
                        price: parseInt(itemEl.dataset.price),
                        quantity: 1
                    };
                    const existingItem = cart.find(cartItem => cartItem.id === item.id);
                    if (existingItem) {
                        existingItem.quantity++;
                    } else {
                        cart.push(item);
                    }
                    updateCartUI();
                    
                    // Tambahkan efek feedback kecil (opsional)
                    Swal.fire({
                        toast: true, position: 'top-end', icon: 'success', 
                        title: 'Masuk Keranjang', showConfirmButton: false, timer: 1000
                    });
                });
            });
        }

    // --- BARU: FUNGSI LOAD RIWAYAT PESANAN ---
    async function loadOrderHistory() {
        if (!orderHistoryContainer) return; // Cek jika elemen ada di HTML

        orderHistoryContainer.innerHTML = '<p style="text-align:center;">Memuat riwayat...</p>';

        try {
            const response = await fetch(`${API_BASE_URL}/api/orders/history`, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            
            if (!response.ok) throw new Error("Gagal mengambil data riwayat");

            const orders = await response.json();
            orderHistoryContainer.innerHTML = ''; // Bersihkan loading

            if (orders.length === 0) {
                orderHistoryContainer.innerHTML = '<p style="text-align:center; color:gray;">Belum ada riwayat pesanan selesai.</p>';
                return;
            }

            // Render Data ke HTML
            orders.forEach(order => {
                // Generate list items HTML
                const itemsHtml = order.items.map(item => 
                    `<li>${item.productName} (${item.quantity}x)</li>`
                ).join('');

                const orderCard = document.createElement('div');
                orderCard.className = 'order-history-item'; // Pastikan ada CSS untuk class ini
                // Styling inline sederhana untuk layout
                orderCard.style.cssText = "border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 8px; background: #fff;";

                orderCard.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 5px;">
                        <strong>Order #${order.id} (Meja ${order.tableNumber || '-'})</strong>
                        <span class="status-badge status-${order.status}">${order.status}</span>
                    </div>
                    <ul style="margin: 5px 0; padding-left: 20px; color: #555; font-size: 0.9em;">
                        ${itemsHtml}
                    </ul>
                    <div style="text-align:right; font-weight:bold; font-size: 0.9em; margin-top:5px;">
                        Total: Rp ${new Intl.NumberFormat('id-ID').format(order.totalAmount)}
                    </div>
                `;
                
                orderHistoryContainer.appendChild(orderCard);
            });

        } catch (error) {
            console.error(error);
            orderHistoryContainer.innerHTML = '<p style="color:red; text-align:center;">Gagal memuat riwayat.</p>';
        }
    }

    function handleRemoveItem(productId) {
        const itemIndex = cart.findIndex(item => item.id === productId);
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
                        
                        currentOrderStatus = "paid";
                        startOrderStatusPolling(data.orderId);
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

    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', loadOrderHistory);
    }

    function startOrderStatusPolling(orderId) {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        pollingInterval = setInterval(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/order/status/${orderId}`, {
                    headers: { 'ngrok-skip-browser-warning': 'true' }
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error);
                
                const newStatus = data.status;
                if (newStatus !== currentOrderStatus) {
                    currentOrderStatus = newStatus;
                    showStatusNotification(newStatus);
                }
                if (newStatus === 'complete' || newStatus === 'cancelled') {
                    clearInterval(pollingInterval);
                }
            } catch (error) {
                console.error('Polling error:', error);
                clearInterval(pollingInterval);
            }
        }, 8000);
    }

    function initScrollAnimation() {
        
        // 1. Pilih SEMUA elemen yang ingin kita animasikan
        //    (Kita targetkan semua kartu menu)
        const scrollElements = document.querySelectorAll(".menu-grid .menu-item");

        if (scrollElements.length === 0) return; // Tidak ada elemen untuk dianimasikan

        // 2. Buat 'Observer' baru
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                
                // 3. Cek apakah elemennya 'intersecting' (masuk ke layar)
                if (entry.isIntersecting) {
                    
                    // 4. Tambahkan kelas animasi dari animate.css
                    //    'animate__fadeInUp' adalah efek 'muncul dari bawah' yang bagus
                    entry.target.classList.add('animate__animated', 'animate__fadeInUp');
                    
                    // 5. (PENTING) Berhenti mengamati elemen ini
                    //    agar animasinya tidak berulang setiap kali di-scroll
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1 // Picu animasi saat 10% elemen terlihat
        });

        // 6. Amati setiap elemen
        scrollElements.forEach(el => {
            // Set elemen jadi transparan dulu agar tidak 'flash' (terlihat-hilang)
            el.style.opacity = "0";
            observer.observe(el);
        });
    }

    function showStatusNotification(status) {
        let title = '';
        let icon = 'info';

        if (status === 'processing') {
            title = 'Pesanan Anda sedang disiapkan!';
            icon = 'info';
        } else if (status === 'ready') {
            title = 'Pesanan Anda siap diantar!';
            icon = 'success';
        } else if (status === 'complete') {
            title = 'Pesanan Anda telah diantar!';
            icon = 'success';
        } else {
            return;
        }

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: icon,
            title: title,
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true
        });
    }

    loadOrderHistory();
});