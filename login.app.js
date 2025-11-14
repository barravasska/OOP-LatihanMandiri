document.addEventListener('DOMContentLoaded', () => {
    
    // Alamat API (HARUS DIISI URL RENDER ANDA NANTI)
    const API_BASE_URL = 'http://localhost:8080/api';
    
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Stop form reload

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: usernameInput.value,
                    password: passwordInput.value
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login gagal');
            }

            // --- SUKSES! ---
            // Simpan "Kunci Rahasia" (Token) di browser
            localStorage.setItem('jwt_token', data.token);

            // Beri notif sukses dan arahkan ke admin.html
            Swal.fire({
                title: 'Login Berhasil!',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                window.location.href = 'admin.html'; // Pindah ke halaman admin
            });

        } catch (error) {
            console.error('Login error:', error);
            Swal.fire('Login Gagal', error.message, 'error');
        }
    });
});