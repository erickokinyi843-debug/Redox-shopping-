const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const formTitle = document.getElementById('form-title');
const authContainer = document.querySelector('.auth-container');

// Get form elements
const signupFullname = document.getElementById('signup-fullname');
const signupPhone = document.getElementById('signup-phone');
const signupEmail = document.getElementById('signup-email');
const signupPassword = document.getElementById('signup-password');
const signupConfirmPassword = document.getElementById('signup-confirm-password');
const termsCheck = document.getElementById('terms-check');
const signupButton = signupForm.querySelector('button[type="submit"]');

const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');

document.querySelectorAll('[data-password-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const passwordInput = document.getElementById(button.dataset.passwordToggle);
    const showPassword = passwordInput.type === 'password';
    passwordInput.type = showPassword ? 'text' : 'password';
    button.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(showPassword));
    button.title = showPassword ? 'Hide password' : 'Show password';
    button.innerHTML = `<i class="fas fa-${showPassword ? 'eye-slash' : 'eye'}" aria-hidden="true"></i>`;
  });
});

// Helper function to extract username from email
function getUsername(email) {
  return email.split('@')[0];
}

const LOCAL_ACCOUNTS_KEY = 'rodyxAccounts';
const apiBaseUrl = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    key,
    256
  );
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getLocalAccounts() {
  return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || '{}');
}

function saveCurrentUser(user) {
  const currentUser = {
    fullname: user.fullname || [user.first_name, user.last_name].filter(Boolean).join(' ') || getUsername(user.email),
    email: user.email,
    phone: user.phone || '',
    createdAt: user.createdAt || new Date().toISOString(),
    token: user.token || ''
  };
  localStorage.setItem('currentUser', JSON.stringify(currentUser));
  localStorage.setItem('user_email', currentUser.email);
}

async function requestAccount(path, payload) {
  if (!apiBaseUrl) throw new Error('The shared account service is not configured.');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `The account service returned HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return result;
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate phone number
function isValidPhone(phone) {
  const phoneRegex = /^[\d\s\-\+()]*$/;
  return phone.length >= 9 && phoneRegex.test(phone);
}

// Show message to user
function showMessage(message, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = message;
  messageDiv.style.cssText = `
    padding: 12px;
    margin-bottom: 15px;
    border-radius: 5px;
    text-align: center;
    font-weight: 500;
    animation: slideIn 0.3s ease-in-out;
  `;
  
  if (type === 'success') {
    messageDiv.style.backgroundColor = '#d4edda';
    messageDiv.style.color = '#155724';
    messageDiv.style.border = '1px solid #c3e6cb';
  } else {
    messageDiv.style.backgroundColor = '#f8d7da';
    messageDiv.style.color = '#721c24';
    messageDiv.style.border = '1px solid #f5c6cb';
  }
  
  authContainer.insertBefore(messageDiv, authContainer.firstChild);
  
  setTimeout(() => {
    messageDiv.remove();
  }, 4000);
}

// Toggle between Sign Up and Sign In
authContainer.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'toggle-btn') {
    e.preventDefault();
    const isShowingSignup = !signupForm.classList.contains('hidden');

    if (isShowingSignup) {
      // Switch to Sign In
      signupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      formTitle.textContent = 'Sign In';
      document.getElementById('toggle-text').innerHTML = 
        'Don\'t have an account? <a href="#" id="toggle-btn">Sign Up</a>';
    } else {
      // Switch to Sign Up
      loginForm.classList.add('hidden');
      signupForm.classList.remove('hidden');
      formTitle.textContent = 'Create Account';
      document.getElementById('toggle-text').innerHTML = 
        'Already have an account? <a href="#" id="toggle-btn">Sign In</a>';
    }
    
    // Clear form messages
    document.querySelectorAll('.message').forEach(msg => msg.remove());
  }
});

// Handle Sign Up
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  signupButton.disabled = true;
  signupButton.textContent = 'Creating account...';
  
  const fullname = signupFullname.value.trim();
  const phone = signupPhone.value.trim();
  const email = signupEmail.value.trim().toLowerCase();
  const password = signupPassword.value;
  const confirmPassword = signupConfirmPassword.value;
  const termsAccepted = termsCheck.checked;
  
  // Validation
  if (!fullname) {
    showMessage('Please enter your full name', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  if (!isValidPhone(phone)) {
    showMessage('Please enter a valid phone number', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  if (!isValidEmail(email)) {
    showMessage('Please enter a valid email address', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  if (password.length < 6) {
    showMessage('Password must be at least 6 characters', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  if (password !== confirmPassword) {
    showMessage('Passwords do not match', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  if (!termsAccepted) {
    showMessage('Please accept the Terms & Conditions', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
    return;
  }
  
  try {
    const result = await requestAccount('/api/auth/register', { fullname, email, phone, password });
    saveCurrentUser({ ...result.account, token: result.token });
    showMessage('Account created. Redirecting to the homepage...', 'success');
    signupForm.reset();
    setTimeout(() => {
      window.location.href = 'homepage.html';
    }, 1000);
  } catch (error) {
    console.error('Could not create the shared account:', error);
    showMessage(error.message || 'Could not create the account. Check your connection and try again.', 'error');
    signupButton.disabled = false;
    signupButton.textContent = 'Sign Up';
  }
});

// Handle Sign In
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = loginEmail.value.trim().toLowerCase();
  const password = loginPassword.value;
  
  if (!email || !password) {
    showMessage('Please enter both email and password', 'error');
    return;
  }
  
  try {
    let result;
    try {
      result = await requestAccount('/api/auth/login', { email, password });
    } catch (error) {
      if (error.status !== 404) throw error;
      const legacyAccount = getLocalAccounts()[email];
      if (!legacyAccount) throw error;
      const salt = Uint8Array.from(legacyAccount.salt.match(/.{2}/g), byte => parseInt(byte, 16));
      const passwordHash = await hashPassword(password, salt);
      if (passwordHash !== legacyAccount.passwordHash) {
        showMessage('Invalid email or password. Please try again.', 'error');
        return;
      }
      result = await requestAccount('/api/auth/import', { ...legacyAccount, password });
    }
    saveCurrentUser({ ...result.account, token: result.token });
    showMessage('Signed in. Redirecting...', 'success');
    loginForm.reset();
    setTimeout(() => {
      window.location.href = 'homepage.html';
    }, 1000);
  } catch (error) {
    console.error('Could not authenticate the account:', error);
    showMessage(error.message || 'Could not verify this account. Check your connection and try again.', 'error');
  }
});
