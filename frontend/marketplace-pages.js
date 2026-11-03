const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
const cartKey = `rodyx:${encodeURIComponent(currentUser.email)}:cart`;
const studentOnly = document.body.dataset.marketplace === 'students';
const productsContainer = document.getElementById('market-products');
const searchInput = document.getElementById('market-search');
const categoryFilter = document.getElementById('market-category');
const emptyState = document.getElementById('market-empty');
const resultCount = document.getElementById('market-result-count');
const statusMessage = document.getElementById('market-status');
const apiBaseUrl = (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl ? window.APP_CONFIG.apiBaseUrl.replace(/\/$/, '') : '');

async function loadListings() {
  if (apiBaseUrl) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/listings`);
      if (response.ok) {
        const listings = await response.json();
        if (Array.isArray(listings)) {
          try {
            localStorage.setItem('rodyxListings', JSON.stringify(listings));
          } catch (error) {
            console.warn('Marketplace listings loaded but could not be cached in this browser:', error);
          }
          return listings;
        }
      }
    } catch {
      // Fall back to local storage if the backend is unavailable.
    }
  }

  try {
    const listings = JSON.parse(localStorage.getItem('rodyxListings') || '[]');
    return Array.isArray(listings) ? listings : [];
  } catch {
    return [];
  }
}

function readListings() {
  try {
    const listings = JSON.parse(localStorage.getItem('rodyxListings') || '[]');
    return Array.isArray(listings) ? listings : [];
  } catch {
    return [];
  }
}

function readCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function updateCartCount() {
  const count = readCart().reduce((total, item) => total + Number(item.quantity || 0), 0);
  document.getElementById('market-cart-count').textContent = count;
}

function addToCart(listing) {
  const cart = readCart();
  const id = listing.id || listing.title.toLowerCase();
  const existing = cart.find(item => item.id === id);
  if (existing) existing.quantity += 1;
  else cart.push({
    id,
    name: listing.title,
    price: Number(listing.price || 0),
    quantity: 1,
    sellerEmail: listing.sellerEmail || '',
    sellerPhone: listing.sellerPhone || ''
  });
  localStorage.setItem(cartKey, JSON.stringify(cart));
  updateCartCount();
  statusMessage.textContent = `${listing.title} added to your cart.`;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

function createProductCard(listing) {
  const card = document.createElement('article');
  card.className = 'market-product';
  const image = document.createElement('div');
  image.className = 'market-product-image';
  if (listing.image) {
    const photo = document.createElement('img');
    photo.src = listing.image;
    photo.alt = listing.title || 'Product image';
    photo.loading = 'lazy';
    image.appendChild(photo);
  } else {
    image.textContent = '🛍️';
  }

  const body = document.createElement('div');
  body.className = 'market-product-body';
  body.append(
    createTextElement('p', 'market-product-category', [listing.category, listing.town].filter(Boolean).join(' · ') || 'Marketplace listing'),
    createTextElement('h2', 'market-product-title', listing.title || 'Community item'),
    createTextElement('p', 'market-product-price', `KES ${Number(listing.price || 0).toLocaleString()}`)
  );
  if (listing.description) body.appendChild(createTextElement('p', 'market-product-description', listing.description));

  const seller = document.createElement('div');
  seller.className = 'market-seller';
  seller.appendChild(createTextElement('strong', '', listing.businessName || listing.sellerName || 'Community seller'));
  const status = document.createElement('div');
  status.className = 'market-product-category';
  status.textContent = listing.sellerVerified || listing.verificationStatus === 'Verified seller' ? '✅ Verified seller' : '⚠ Unverified seller';
  seller.appendChild(status);
  if (listing.sellerEmail) {
    const email = document.createElement('a');
    email.href = `mailto:${listing.sellerEmail}`;
    email.textContent = listing.sellerEmail;
    seller.appendChild(email);
  }
  if (listing.sellerPhone) {
    const phone = document.createElement('a');
    phone.href = `tel:${listing.sellerPhone}`;
    phone.textContent = listing.sellerPhone;
    seller.appendChild(phone);
  }
  body.appendChild(seller);

  const actions = document.createElement('div');
  actions.className = 'market-product-actions';
  const addButton = document.createElement('button');
  addButton.className = 'market-add-button';
  addButton.type = 'button';
  addButton.textContent = 'Add to cart';
  addButton.addEventListener('click', () => addToCart(listing));

  const messageButton = document.createElement('button');
  messageButton.className = 'market-add-button';
  messageButton.type = 'button';
  messageButton.style.background = '#18a999';
  messageButton.textContent = 'Message seller';
  messageButton.addEventListener('click', () => {
    const sellerEmail = listing.sellerEmail || '';
    if (!sellerEmail) {
      statusMessage.textContent = 'No seller contact is available for this listing.';
      return;
    }
    const sellerName = listing.businessName || listing.sellerName || 'Seller';
    window.location.href = `messages.html?contact=${encodeURIComponent(sellerEmail)}&name=${encodeURIComponent(sellerName)}`;
  });

  actions.append(addButton, messageButton);
  body.appendChild(actions);
  card.append(image, body);
  return card;
}

async function renderListings() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;
  const listings = (await loadListings())
    .filter(listing => !studentOnly || listing.studentMarketplace)
    .filter(listing => !selectedCategory || listing.category === selectedCategory)
    .filter(listing => `${listing.title || ''} ${listing.description || ''} ${listing.category || ''} ${listing.town || ''} ${listing.businessName || ''} ${listing.sellerName || ''}`.toLowerCase().includes(query))
    .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));

  productsContainer.replaceChildren();
  listings.forEach(listing => productsContainer.appendChild(createProductCard(listing)));
  resultCount.textContent = `${listings.length} ${listings.length === 1 ? 'product' : 'products'}`;
  emptyState.hidden = listings.length > 0;
  updateCartCount();
}

searchInput.addEventListener('input', () => renderListings());
categoryFilter.addEventListener('change', () => renderListings());
renderListings();