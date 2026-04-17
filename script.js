/**
 * ATLAS+ Authentication System
 * Mock Database and Logic
 */

// Mock Database
const MOCK_DB = {
    users: [
        { id: 'engineer', password: 'eng123', role: 'Engineer' },
        { id: 'technician', password: 'tech123', role: 'Technician' }
    ]
};

// UI Elements
const UI = {
    form: document.getElementById('loginForm'),
    btn: document.getElementById('authBtn'),
    btnText: document.querySelector('.btn-text'),
    spinner: document.querySelector('.spinner'),
    error: document.getElementById('errorContainer'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    role: document.getElementById('role'),
    togglePass: document.getElementById('togglePassword'),
    rememberMe: document.getElementById('rememberMe')
};

/**
 * Authentication Service
 */
const AuthService = {
    validate(id, pass, role) {
        if (!id || !pass || !role) {
            return { success: false, message: 'All fields are required.' };
        }

        const user = MOCK_DB.users.find(u => u.id === id);

        if (!user || user.password !== pass) {
            return { success: false, message: 'Invalid Terminal ID or Secure Key.' };
        }

        if (user.role !== role) {
            return { success: false, message: 'Operational Role mismatch for this ID.' };
        }

        return { success: true, role: user.role };
    },

    saveUser(id) {
        localStorage.setItem('atlas_terminal_id', id);
    },

    getSavedUser() {
        return localStorage.getItem('atlas_terminal_id');
    },

    clearSavedUser() {
        localStorage.removeItem('atlas_terminal_id');
    }
};

/**
 * Main Initialization
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check for remembered user
    const savedId = AuthService.getSavedUser();
    if (savedId) {
        UI.username.value = savedId;
        UI.rememberMe.checked = true;
    }

    // Toggle Password Visibility
    UI.togglePass.addEventListener('click', () => {
        const isPass = UI.password.getAttribute('type') === 'password';
        UI.password.setAttribute('type', isPass ? 'text' : 'password');
        
        // Change icon opacity or style to indicate state
        UI.togglePass.style.opacity = isPass ? '1' : '0.5';
    });

    // Form Submission
    UI.form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Reset UI State
        UI.error.style.display = 'none';
        UI.error.textContent = '';
        
        const id = UI.username.value.trim();
        const pass = UI.password.value;
        const role = UI.role.value;

        // Start Loading State
        setLoading(true);

        // Simulate network delay
        setTimeout(() => {
            const result = AuthService.validate(id, pass, role);

            if (result.success) {
                // Handle "Remember Me"
                if (UI.rememberMe.checked) {
                    AuthService.saveUser(id);
                } else {
                    AuthService.clearSavedUser();
                }

                // Success Feedback
                UI.btnText.textContent = 'ACCESS GRANTED';
                UI.btn.style.background = '#10b981'; // Success Green

                // Redirect
                setTimeout(() => {
                    if (result.role === 'Engineer') {
                        window.location.href = 'engineer.html';
                    } else {
                        window.location.href = 'technician.html';
                    }
                }, 800);
            } else {
                // Show Error
                setLoading(false);
                UI.error.textContent = result.message;
                UI.error.style.display = 'block';
                
                // Shake effect for error
                UI.form.classList.add('shake');
                setTimeout(() => UI.form.classList.remove('shake'), 400);
            }
        }, 1500);
    });

    // Input Focus Effects
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        const wrapper = input.closest('.input-wrapper');
        const icon = wrapper ? wrapper.querySelector('.input-icon') : null;

        input.addEventListener('focus', () => {
            if (icon) icon.style.color = 'var(--text-primary)';
            input.style.borderColor = 'var(--text-muted)';
        });

        input.addEventListener('blur', () => {
            if (icon) icon.style.color = 'var(--text-muted)';
            input.style.borderColor = 'var(--border-color)';
        });
    });
});

/**
 * UI State Helper
 */
function setLoading(isLoading) {
    UI.btn.disabled = isLoading;
    UI.spinner.style.display = isLoading ? 'block' : 'none';
    UI.btnText.style.opacity = isLoading ? '0.5' : '1';
    
    if (isLoading) {
        UI.btnText.textContent = 'AUTHENTICATING...';
    } else {
        UI.btnText.textContent = 'INITIATE SYSTEM AUTH';
    }
}
