// --- FILE: admin.app.js (VERSI WEBSOCKET) ---

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. VARIABEL GLOBAL ---
    
    // Ganti ini dengan URL Ngrok/Render Anda saat sudah online
    // Contoh: 'https://blabla.ngrok-free.app' (TANPA /api di belakang)
    const BASE_URL = 'http://localhost:8080'; 
    
    const API_BASE_URL = `${BASE_URL}/api`;
    const TOKEN = localStorage.getItem('jwt_token');

    // Variabel elemen HTML
    const productForm = document.getElementById('product-form');
    const formTitle = document.getElementById('form-title');
    const productIdInput = document.getElementById('product-id');
    const productNameInput = document.getElementById('product-name');
    const productCategoryInput = document.getElementById('product-category');
    const productPriceInput = document.getElementById('product-price');
    const productImageInput = document.getElementById('product-image');
    const clearBtn = document.getElementById('clear-btn');
    const productList = document.getElementById('product-list');
    const activeOrdersList = document.getElementById('active-orders-list');
    const orderHistoryList = document.getElementById('order-history-list');
    const refreshOrdersBtn = document.getElementById('refresh-orders-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- 2. VALIDASI TOKEN ---
    if (!TOKEN) {
        Swal.fire({
            title: 'Akses Ditolak!',
            text: 'Anda harus login terlebih dahulu.',
            icon: 'warning',
            confirmButtonText: 'OK'
        }).then(() => {
            window.location.href = 'login.html';
        });
        return;
    }

    // --- 3. WEBSOCKET CONNECTION (BARU) ---
    
    function connectWebSocket() {
        // Ubah http/https menjadi ws/wss
        const WS_URL = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://');
        
        console.log(`Connecting to WebSocket: ${WS_URL}/ws/admin`);
        const adminSocket = new WebSocket(`${WS_URL}/ws/admin`);

        adminSocket.onopen = () => {
            console.log('✅ Admin WebSocket connected');
        };

        adminSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'new_order') {
                // 1. Tampilkan Notifikasi Suara/Toast
                showToast(`🔔 Pesanan Baru!`, `Meja ${data.table} baru saja memesan (Order #${data.orderId})`);
                
                // 2. Otomatis Refresh Daftar Pesanan
                fetchActiveOrders();
            }
        };

        adminSocket.onerror = (error) => {
            console.error('❌ WebSocket error. Pastikan backend mendukung WS.', error);
        };

        adminSocket.onclose = () => {
            console.log('⚠️ WebSocket closed, reconnecting in 3s...');
            // Coba konek lagi jika putus (Auto Reconnect)
            setTimeout(connectWebSocket, 3000);
        };
    }

    // Helper untuk notifikasi Toast
    function showToast(title, text) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: title,
            text: text,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true,
            background: '#e3f2fd' // Warna sedikit biru biar beda
        });
    }

    // --- 4. HELPER FETCH (AUTH) ---
    async function fetchWithAuth(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${TOKEN}`
        };
        const config = {
            ...options,
            headers: { ...headers, ...options.headers },
        };
        const response = await fetch(url, config);

        if (response.status === 401) {
            localStorage.removeItem('jwt_token');
            Swal.fire('Sesi Habis', 'Silakan login kembali.', 'warning').then(() => {
                window.location.href = 'login.html';
            });
            throw new Error('Unauthorized');
        }
        return response;
    }

    // --- 5. FUNGSI CRUD & DATA ---

    async function fetchProducts() {
        if (!productList) return;
        productList.innerHTML = '<tr><td colspan="6">Memuat...</td></tr>';
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/products`);
            if (!res.ok) throw new Error('Gagal memuat produk');
            const products = await res.json();
            productList.innerHTML = '';
            if (products.length === 0) {
                productList.innerHTML = '<tr><td colspan="6">Belum ada produk.</td></tr>';
                return;
            }
            products.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.id}</td>
                    <td>${p.name}</td>
                    <td>${p.categoryId}</td>
                    <td>${p.price}</td>
                    <td>${p.imageUrl}</td>
                    <td>
                        <button class="edit-btn" data-id="${p.id}">Edit</button>
                        <button class="delete-btn" data-id="${p.id}">Hapus</button>
                    </td>
                `;
                productList.appendChild(tr);
            });
        } catch (err) {
            console.error(err);
            Swal.fire('Error', 'Gagal memuat produk.', 'error');
        }
    }

    async function fetchCategories() {
        if (!productCategoryInput) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/categories`);
            if (!res.ok) throw new Error('Gagal memuat kategori');
            const categories = await res.json();
            productCategoryInput.innerHTML = '<option value="">-- Pilih Kategori --</option>';
            categories.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.id} - ${c.name}`;
                productCategoryInput.appendChild(opt);
            });
        } catch (err) { console.error(err); }
    }

    async function fetchActiveOrders() {
        if (!activeOrdersList) return;
        // Kita tidak kosongkan HTML dengan 'Memuat...' agar tidak kedip-kedip saat realtime update
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/orders`);
            if (!res.ok) throw new Error('Gagal mengambil pesanan');
            const orders = await res.json();
            activeOrdersList.innerHTML = '';

            if (orders.length === 0) {
                activeOrdersList.innerHTML = '<p style="color:gray;">Tidak ada pesanan aktif.</p>';
                return;
            }

            orders.forEach(o => {
                const div = document.createElement('div');
                div.className = 'order-card';
                div.innerHTML = `
                    <div class="order-card-header">
                        <h3>Pesanan #${o.id} <span>(Meja ${o.tableNumber || '-'})</span></h3>
                        <span>Status: <strong>${o.status}</strong></span>
                    </div>
                    <div class="order-card-body">
                        <ul>${o.items.map(i => `<li>${i.productName} (x${i.quantity})</li>`).join('')}</ul>
                    </div>
                    <div class="order-card-actions">
                        <button class="update-status-btn" data-id="${o.id}" data-status="processing">Mulai Proses</button>
                        <button class="update-status-btn" data-id="${o.id}" data-status="ready">Siap Diantar</button>
                        <button class="update-status-btn" data-id="${o.id}" data-status="complete">Selesai</button>
                    </div>
                `;
                activeOrdersList.appendChild(div);
            });
        } catch (err) { console.error(err); }
    }

    async function fetchOrderHistory() {
        if (!orderHistoryList) return;
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/orders/history`);
            if (!res.ok) throw new Error('Gagal mengambil riwayat');
            const orders = await res.json();
            orderHistoryList.innerHTML = '';
            if (orders.length === 0) {
                orderHistoryList.innerHTML = '<p style="color:gray;">Belum ada riwayat pesanan.</p>';
                return;
            }
            orders.forEach(o => {
                const div = document.createElement('div');
                div.className = 'order-card';
                div.innerHTML = `
                    <div class="order-card-header">
                        <h3>Pesanan #${o.id} <span>(Meja ${o.tableNumber || '-'})</span></h3>
                        <span>Status: <strong>${o.status}</strong></span>
                    </div>
                    <div class="order-card-body">
                        <ul>${o.items.map(i => `<li>${i.productName} (x${i.quantity})</li>`).join('')}</ul>
                    </div>
                `;
                orderHistoryList.appendChild(div);
            });
        } catch (err) { console.error(err); }
    }

    // Handler Form & Tombol
    async function handleFormSubmit(e) {
        e.preventDefault();
        const id = productIdInput.value.trim();
        const data = {
            name: productNameInput.value.trim(),
            categoryId: parseInt(productCategoryInput.value),
            price: parseInt(productPriceInput.value),
            imageUrl: productImageInput.value.trim()
        };
        if (!data.name || !data.categoryId || !data.price) {
            Swal.fire('Error', 'Semua field wajib diisi.', 'warning'); return;
        }
        try {
            const url = id ? `${API_BASE_URL}/products/${id}` : `${API_BASE_URL}/products`;
            const method = id ? 'PUT' : 'POST';
            const res = await fetchWithAuth(url, { method, body: JSON.stringify(data) });
            if (!res.ok) throw new Error('Gagal menyimpan produk');
            Swal.fire('Berhasil', 'Produk disimpan.', 'success');
            resetForm();
            fetchProducts();
        } catch (err) { Swal.fire('Error', err.message, 'error'); }
    }

    async function handleDeleteClick(e) {
        if (!e.target.classList.contains('delete-btn')) return;
        const id = e.target.dataset.id;
        Swal.fire({
            title: 'Yakin Hapus?', text: `Hapus produk #${id}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Ya, hapus'
        }).then(async (r) => {
            if (r.isConfirmed) {
                try {
                    const res = await fetchWithAuth(`${API_BASE_URL}/products/${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Gagal hapus produk');
                    Swal.fire('Dihapus!', 'Produk berhasil dihapus.', 'success');
                    fetchProducts();
                } catch (err) { Swal.fire('Error', err.message, 'error'); }
            }
        });
    }

    function handleEditClick(e) {
        if (!e.target.classList.contains('edit-btn')) return;
        const tr = e.target.closest('tr');
        const cells = tr.querySelectorAll('td');
        productIdInput.value = cells[0].textContent;
        productNameInput.value = cells[1].textContent;
        productCategoryInput.value = cells[2].textContent;
        productPriceInput.value = cells[3].textContent;
        productImageInput.value = cells[4].textContent;
        formTitle.textContent = `Edit Produk ID #${productIdInput.value}`;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function handleStatusUpdateClick(e) {
        if (!e.target.classList.contains('update-status-btn')) return;
        const id = e.target.dataset.id;
        const newStatus = e.target.dataset.status;
        
        // Langsung update tanpa confirm biar cepat (opsional)
        // Atau pakai Swal confirm seperti sebelumnya
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/order/update-status`, {
                method: 'POST',
                body: JSON.stringify({ orderId: parseInt(id), newStatus })
            });
            if (!res.ok) throw new Error('Gagal update status');
            
            // Refresh pesanan dan riwayat
            fetchActiveOrders();
            if (newStatus === 'complete') fetchOrderHistory();
            
            const Toast = Swal.mixin({
                toast: true, position: 'top-end', showConfirmButton: false, timer: 2000
            });
            Toast.fire({ icon: 'success', title: `Status diubah ke ${newStatus}` });
            
        } catch (err) {
            Swal.fire('Error', err.message, 'error');
        }
    }

    function resetForm() {
        formTitle.textContent = 'Tambah Produk Baru';
        productForm?.reset();
        productIdInput.value = '';
    }

    // --- 6. INIT & LISTENERS ---
    
    // Mulai koneksi WebSocket!
    connectWebSocket();

    // Fetch data awal
    fetchProducts();
    fetchCategories();
    fetchActiveOrders();
    fetchOrderHistory();

    refreshOrdersBtn?.addEventListener('click', () => {
        fetchActiveOrders();
        fetchOrderHistory();
    });

    // HAPUS: setInterval tidak diperlukan lagi karena sudah ada WebSocket!
    // setInterval(...) 

    productForm?.addEventListener('submit', handleFormSubmit);
    clearBtn?.addEventListener('click', resetForm);
    productList?.addEventListener('click', handleDeleteClick);
    productList?.addEventListener('click', handleEditClick);
    activeOrdersList?.addEventListener('click', handleStatusUpdateClick);

    logoutBtn?.addEventListener('click', () => {
        Swal.fire({
            title: 'Logout?', text: 'Anda akan keluar dari panel admin.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Logout'
        }).then((r) => {
            if (r.isConfirmed) {
                localStorage.removeItem('jwt_token');
                window.location.href = 'login.html';
            }
        });
    });
});
