const accommodationStorageKey = 'rodyxAccommodation';
const accommodationForm = document.getElementById('accommodation-form');
const accommodationListings = document.getElementById('accommodation-listings');
const accommodationSearch = document.getElementById('accommodation-search');
const accommodationImageInput = document.getElementById('accommodation-images-input');
const accommodationImagePreviews = document.getElementById('accommodation-image-previews');
const accommodationMessage = document.getElementById('accommodation-message');
const maxAccommodationImages = 5;
const maxAccommodationImageBytes = 500 * 1024;
const maxAccommodationTotalBytes = 1536 * 1024;

const accommodationUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}');
  } catch {
    return {};
  }
})();

document.getElementById('accommodation-contact-name').value = accommodationUser.fullname || '';
document.getElementById('accommodation-email').value = accommodationUser.email || '';
document.getElementById('accommodation-phone').value = accommodationUser.phone || '';

function readAccommodationListings() {
  try {
    const listings = JSON.parse(localStorage.getItem(accommodationStorageKey) || '[]');
    return Array.isArray(listings) ? listings : [];
  } catch {
    return [];
  }
}

async function loadAccommodationListings() {
  try {
    const listings = await window.getMarketplaceContent('accommodation');
    try {
      localStorage.setItem(accommodationStorageKey, JSON.stringify(listings));
    } catch (error) {
      console.warn('Accommodation loaded from the API but could not be cached in this browser:', error);
    }
  } catch (error) {
    console.warn('Could not load shared accommodation; using this browser cache:', error);
    accommodationMessage.textContent = 'Could not load community vacancies from the server. Showing saved vacancies from this browser.';
  }
  renderAccommodation();
}

function createAccommodationText(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createAccommodationCard(listing) {
  const card = document.createElement('article');
  card.className = 'service-card';

  if (Array.isArray(listing.images) && listing.images.length) {
    const gallery = document.createElement('div');
    gallery.className = 'accommodation-images';
    listing.images.forEach((source, index) => {
      const image = document.createElement('img');
      image.src = source;
      image.alt = `${listing.title || 'Accommodation'} photo ${index + 1}`;
      image.loading = 'lazy';
      gallery.appendChild(image);
    });
    card.appendChild(gallery);
  }

  card.appendChild(createAccommodationText('p', listing.type, 'service-card-category'));
  card.appendChild(createAccommodationText('h3', listing.title));
  card.appendChild(createAccommodationText('p', `KES ${Number(listing.price).toLocaleString()} per month${listing.deposit ? ` · Deposit KES ${Number(listing.deposit).toLocaleString()}` : ''}`, 'accommodation-price'));
  card.appendChild(createAccommodationText('p', listing.details));
  card.appendChild(createAccommodationText('p', `Location: ${listing.location}${listing.address ? ` · ${listing.address}` : ''}`));

  const availableText = listing.availableFrom && listing.availableFrom > new Date().toISOString().slice(0, 10)
    ? `Available from ${new Date(`${listing.availableFrom}T00:00:00`).toLocaleDateString()}`
    : 'Available now';
  card.appendChild(createAccommodationText('p', availableText, 'accommodation-availability'));
  card.appendChild(createAccommodationText('p', `Contact: ${listing.contactName}`));
  if (listing.email && listing.email.toLowerCase() !== String(accommodationUser.email || '').toLowerCase()) {
    const messageButton = document.createElement('button');
    messageButton.className = 'service-submit';
    messageButton.type = 'button';
    messageButton.textContent = 'Message host';
    messageButton.addEventListener('click', () => window.startUserMessage(listing.email, listing.contactName || 'Host'));
    card.appendChild(messageButton);
  }
  return card;
}

function renderAccommodation() {
  const query = accommodationSearch.value.trim().toLowerCase();
  const listings = readAccommodationListings()
    .filter(listing => [listing.type, listing.title, listing.details, listing.location, listing.address, listing.price, listing.deposit, listing.contactName]
      .some(value => String(value || '').toLowerCase().includes(query)))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));

  accommodationListings.replaceChildren();
  if (!listings.length) {
    const empty = createAccommodationText('p', query ? 'No vacancies match your search.' : 'No vacancies listed yet. Post an accommodation vacancy to get started.');
    empty.className = 'service-empty';
    accommodationListings.appendChild(empty);
    return;
  }

  listings.forEach(listing => accommodationListings.appendChild(createAccommodationCard(listing)));
}

function validateAccommodationImages(files) {
  if (files.length > maxAccommodationImages) return 'Choose no more than 5 images.';
  if (files.some(file => !file.type.startsWith('image/'))) return 'Every uploaded file must be an image.';
  if (files.some(file => file.size > maxAccommodationImageBytes)) return 'Each image must be 500 KB or smaller.';
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > maxAccommodationTotalBytes) return 'The combined image size must be 1.5 MB or smaller.';
  return '';
}

function readAccommodationImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('An accommodation photo could not be read.')));
    reader.readAsDataURL(file);
  });
}

function renderAccommodationImagePreviews(files) {
  accommodationImagePreviews.replaceChildren();
  files.forEach((file, index) => {
    const image = document.createElement('img');
    image.src = URL.createObjectURL(file);
    image.alt = `Selected accommodation photo ${index + 1}`;
    accommodationImagePreviews.appendChild(image);
  });
  accommodationImagePreviews.hidden = files.length === 0;
}

accommodationImageInput.addEventListener('change', () => {
  const files = Array.from(accommodationImageInput.files);
  const validationMessage = validateAccommodationImages(files);
  if (validationMessage) {
    accommodationImageInput.value = '';
    renderAccommodationImagePreviews([]);
    accommodationMessage.textContent = validationMessage;
    return;
  }
  renderAccommodationImagePreviews(files);
  accommodationMessage.textContent = '';
});

accommodationSearch.addEventListener('input', renderAccommodation);
accommodationForm.addEventListener('submit', async event => {
  event.preventDefault();
  const imageFiles = Array.from(accommodationImageInput.files);
  const validationMessage = validateAccommodationImages(imageFiles);
  if (validationMessage) {
    accommodationMessage.textContent = validationMessage;
    return;
  }

  const submitButton = accommodationForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  accommodationMessage.textContent = 'Publishing vacancy...';

  try {
    const formData = new FormData(accommodationForm);
    const listing = {
      id: `accommodation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      type: String(formData.get('type')).trim(),
      title: String(formData.get('title')).trim(),
      details: String(formData.get('details')).trim(),
      price: Number(formData.get('price')),
      deposit: Number(formData.get('deposit') || 0),
      availableFrom: String(formData.get('availableFrom') || ''),
      location: String(formData.get('location')).trim(),
      address: String(formData.get('address') || '').trim(),
      contactName: String(formData.get('contactName')).trim(),
      email: String(formData.get('email')).trim(),
      phone: String(formData.get('phone')).trim(),
      images: await Promise.all(imageFiles.map(readAccommodationImage))
    };

    const savedListing = await window.postMarketplaceContent('accommodation', listing);
    const listings = readAccommodationListings().filter(item => item.id !== savedListing.id);
    listings.unshift(savedListing);
    try {
      localStorage.setItem(accommodationStorageKey, JSON.stringify(listings));
    } catch (error) {
      console.warn('Accommodation vacancy was published, but could not be cached in this browser:', error);
    }
    accommodationForm.reset();
    document.getElementById('accommodation-contact-name').value = accommodationUser.fullname || '';
    document.getElementById('accommodation-email').value = accommodationUser.email || '';
    document.getElementById('accommodation-phone').value = accommodationUser.phone || '';
    renderAccommodationImagePreviews([]);
    accommodationMessage.textContent = 'Your accommodation vacancy has been published successfully.';
    renderAccommodation();
  } catch (error) {
    accommodationMessage.textContent = `Your vacancy was not published. ${error.message || 'Check the API connection and try again.'}`;
  } finally {
    submitButton.disabled = false;
  }
});

loadAccommodationListings();