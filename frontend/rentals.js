const rentalsStorageKey = 'rodyxRentals';
const unavailableRetentionMs = 2 * 60 * 60 * 1000;
const rentalForm = document.getElementById('rental-form');
const rentalListings = document.getElementById('rental-listings');
const rentalSearch = document.getElementById('rental-search');
const rentalImageInput = document.getElementById('rental-image');
const rentalImagePreview = document.getElementById('rental-image-preview');
const rentalMessage = document.getElementById('rental-message');

const rentalUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}');
  } catch {
    return {};
  }
})();

document.getElementById('rental-owner').value = rentalUser.fullname || '';
document.getElementById('rental-email').value = rentalUser.email || '';
document.getElementById('rental-phone').value = rentalUser.phone || '';

function readRentals() {
  try {
    const rentals = JSON.parse(localStorage.getItem(rentalsStorageKey) || '[]');
    return Array.isArray(rentals) ? rentals : [];
  } catch {
    return [];
  }
}

async function loadRentals() {
  try {
    const rentals = await window.getMarketplaceContent('rentals');
    try {
      localStorage.setItem(rentalsStorageKey, JSON.stringify(rentals));
    } catch (error) {
      console.warn('Rentals loaded from the API but could not be cached in this browser:', error);
    }
  } catch (error) {
    console.warn('Could not load shared rentals; using this browser cache:', error);
    rentalMessage.textContent = 'Could not load community rentals from the server. Showing saved rentals from this browser.';
  }
  renderRentals();
}

function cleanupUnavailableRentals() {
  const now = Date.now();
  const rentals = readRentals();
  const remaining = rentals.filter(rental => {
    if (rental.available !== false) return true;
    const unavailableAt = Date.parse(rental.unavailableAt || '');
    return Number.isFinite(unavailableAt) && now - unavailableAt < unavailableRetentionMs;
  });
  if (remaining.length !== rentals.length) {
    localStorage.setItem(rentalsStorageKey, JSON.stringify(remaining));
  }
  return remaining;
}

function formatRemovalTime(timestamp) {
  const remainingMs = Math.max(0, timestamp + unavailableRetentionMs - Date.now());
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function createRentalText(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createRentalCard(rental) {
  const card = document.createElement('article');
  card.className = 'service-card';

  if (rental.image) {
    const image = document.createElement('img');
    image.className = 'rental-card-image';
    image.src = rental.image;
    image.alt = rental.title ? `${rental.title} rental` : 'Rental item';
    image.loading = 'lazy';
    card.appendChild(image);
  }

  card.appendChild(createRentalText('p', rental.category, 'service-card-category'));
  card.appendChild(createRentalText('h3', rental.title));
  const available = rental.available !== false;
  const statusText = available
    ? 'Available'
    : `Unavailable · deletes in ${formatRemovalTime(Date.parse(rental.unavailableAt))}`;
  card.appendChild(createRentalText('p', statusText, `listing-status ${available ? 'is-available' : 'is-unavailable'}`));
  card.appendChild(createRentalText('p', `KES ${Number(rental.price).toLocaleString()} per ${rental.pricePeriod}`, 'rental-card-price'));
  card.appendChild(createRentalText('p', `Duration / availability: ${rental.duration}`, 'rental-card-duration'));
  card.appendChild(createRentalText('p', rental.description));
  card.appendChild(createRentalText('p', `Area: ${rental.area}`));
  card.appendChild(createRentalText('p', `Listed by: ${rental.ownerName}`));
  if (rental.email && rental.email.toLowerCase() !== String(rentalUser.email || '').toLowerCase()) {
    const messageButton = document.createElement('button');
    messageButton.className = 'service-submit';
    messageButton.type = 'button';
    messageButton.textContent = 'Message owner';
    messageButton.addEventListener('click', () => window.startUserMessage(rental.ownerEmail || rental.email, rental.ownerName || 'Owner'));
    card.appendChild(messageButton);
  }

  if (rentalUser.email && rentalUser.email.toLowerCase() === String(rental.ownerEmail || rental.email || '').toLowerCase()) {
    const availabilityButton = document.createElement('button');
    availabilityButton.className = 'listing-status-action';
    availabilityButton.type = 'button';
    availabilityButton.textContent = available ? 'Mark unavailable' : 'Mark available';
    availabilityButton.addEventListener('click', () => updateRentalAvailability(rental.id, available));
    card.appendChild(availabilityButton);
  }
  return card;
}

function updateRentalAvailability(rentalId, currentlyAvailable) {
  const rentals = readRentals();
  const rental = rentals.find(item => item.id === rentalId);
  if (!rental || String(rental.ownerEmail || rental.email || '').toLowerCase() !== String(rentalUser.email || '').toLowerCase()) return;
  rental.available = !currentlyAvailable;
  rental.unavailableAt = currentlyAvailable ? new Date().toISOString() : '';
  localStorage.setItem(rentalsStorageKey, JSON.stringify(rentals));
  renderRentals();
}

function renderRentals() {
  const query = rentalSearch.value.trim().toLowerCase();
  const rentals = cleanupUnavailableRentals()
    .filter(rental => [rental.title, rental.category, rental.description, rental.duration, rental.area, rental.ownerName, rental.price, rental.pricePeriod]
      .some(value => String(value || '').toLowerCase().includes(query)))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));

  rentalListings.replaceChildren();
  if (!rentals.length) {
    const empty = createRentalText('p', query ? 'No rentals match your search.' : 'No rentals listed yet. Post an item to get started.');
    empty.className = 'service-empty';
    rentalListings.appendChild(empty);
    return;
  }

  rentals.forEach(rental => rentalListings.appendChild(createRentalCard(rental)));
}

function readRentalImage(file) {
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('The selected photo could not be read.')));
    reader.readAsDataURL(file);
  });
}

rentalImageInput.addEventListener('change', () => {
  const file = rentalImageInput.files[0];
  if (!file) {
    rentalImagePreview.hidden = true;
    rentalImagePreview.removeAttribute('src');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    rentalImageInput.value = '';
    rentalImagePreview.hidden = true;
    rentalImagePreview.removeAttribute('src');
    rentalMessage.textContent = 'Choose an image smaller than 2 MB.';
    return;
  }
  rentalImagePreview.src = URL.createObjectURL(file);
  rentalImagePreview.hidden = false;
  rentalMessage.textContent = '';
});

rentalSearch.addEventListener('input', renderRentals);
rentalForm.addEventListener('submit', async event => {
  event.preventDefault();
  const imageFile = rentalImageInput.files[0];
  if (imageFile && imageFile.size > 2 * 1024 * 1024) {
    rentalMessage.textContent = 'Choose an image smaller than 2 MB.';
    return;
  }

  const submitButton = rentalForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  rentalMessage.textContent = 'Publishing rental...';

  try {
    const formData = new FormData(rentalForm);
    const rental = {
      id: `rental-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      category: String(formData.get('category')).trim(),
      title: String(formData.get('title')).trim(),
      description: String(formData.get('description')).trim(),
      price: Number(formData.get('price')),
      pricePeriod: String(formData.get('pricePeriod')),
      duration: String(formData.get('duration')).trim(),
      area: String(formData.get('area')).trim(),
      ownerName: String(formData.get('ownerName')).trim(),
      ownerEmail: String(formData.get('email')).trim().toLowerCase(),
      email: String(formData.get('email')).trim(),
      phone: String(formData.get('phone')).trim(),
      image: await readRentalImage(imageFile),
      available: true,
      unavailableAt: ''
    };

    const savedRental = await window.postMarketplaceContent('rentals', rental);
    const rentals = readRentals().filter(item => item.id !== savedRental.id);
    rentals.unshift(savedRental);
    try {
      localStorage.setItem(rentalsStorageKey, JSON.stringify(rentals));
    } catch (error) {
      console.warn('Rental was published, but could not be cached in this browser:', error);
    }
    rentalForm.reset();
    document.getElementById('rental-owner').value = rentalUser.fullname || '';
    document.getElementById('rental-email').value = rentalUser.email || '';
    document.getElementById('rental-phone').value = rentalUser.phone || '';
    rentalImagePreview.hidden = true;
    rentalImagePreview.removeAttribute('src');
    rentalMessage.textContent = 'Your rental has been published successfully.';
    renderRentals();
  } catch (error) {
    rentalMessage.textContent = `Your rental was not published. ${error.message || 'Check the API connection and try again.'}`;
  } finally {
    submitButton.disabled = false;
  }
});

loadRentals();
setInterval(() => {
  cleanupUnavailableRentals();
  renderRentals();
}, 60000);