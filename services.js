const servicesStorageKey = 'rodyxServices';
const currentUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}');
  } catch {
    return {};
  }
})();
const serviceForm = document.getElementById('service-form');
const serviceListings = document.getElementById('service-listings');
const serviceSearch = document.getElementById('service-search');
const serviceCategory = document.getElementById('service-category');
const customSkillField = document.getElementById('custom-skill-field');
const customSkillInput = document.getElementById('custom-skill');
const serviceMessage = document.getElementById('service-message');
const reviewsStorageKey = 'rodyxReviews';

document.getElementById('provider-name').value = currentUser.fullname || '';
document.getElementById('provider-email').value = currentUser.email || '';
document.getElementById('provider-phone').value = currentUser.phone || '';

function readServices() {
  try {
    const services = JSON.parse(localStorage.getItem(servicesStorageKey) || '[]');
    return Array.isArray(services) ? services : [];
  } catch {
    return [];
  }
}

function readReviews() {
  try {
    const reviews = JSON.parse(localStorage.getItem(reviewsStorageKey) || '[]');
    return Array.isArray(reviews) ? reviews : [];
  } catch {
    return [];
  }
}

function getRatingSummary(targetId, targetType) {
  const reviews = readReviews().filter(review => review.targetId === targetId && review.targetType === targetType);
  if (!reviews.length) {
    return { average: '0.0', count: 0, stars: '☆☆☆☆☆', remarks: [] };
  }
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  const average = (total / reviews.length).toFixed(1);
  const rounded = Math.round(Number(average));
  const stars = `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
  const remarks = reviews.filter(review => String(review.remark || '').trim()).slice(-3).map(review => ({
    text: review.remark.trim(),
    author: review.author || 'Customer'
  }));
  return { average, count: reviews.length, stars, remarks };
}

function submitReview(targetId, targetType, rating, remark) {
  const safeRating = Number(rating);
  const cleanRemark = String(remark || '').trim();
  if (!targetId || Number.isNaN(safeRating) || safeRating < 1 || safeRating > 5) return false;
  const reviews = readReviews();
  reviews.unshift({
    targetId,
    targetType,
    rating: safeRating,
    remark: cleanRemark || 'No additional remarks',
    author: currentUser.fullname || currentUser.email || 'Customer',
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(reviewsStorageKey, JSON.stringify(reviews));
  return true;
}

function createReviewUI(targetId, targetType, label) {
  const reviewWrap = document.createElement('div');
  reviewWrap.className = 'review-box';

  const summary = getRatingSummary(targetId, targetType);
  const summaryRow = document.createElement('div');
  summaryRow.className = 'review-summary';
  summaryRow.innerHTML = `<strong>${summary.stars}</strong> <span>${summary.average} (${summary.count} review${summary.count === 1 ? '' : 's'})</span>`;
  reviewWrap.appendChild(summaryRow);

  if (summary.remarks.length) {
    const remarks = document.createElement('div');
    remarks.className = 'review-remarks';
    summary.remarks.forEach(item => {
      const remark = document.createElement('div');
      remark.className = 'review-remark';
      remark.innerHTML = `<span class="review-remark-author">${item.author}</span> <span>${item.text}</span>`;
      remarks.appendChild(remark);
    });
    reviewWrap.appendChild(remarks);
  } else {
    const empty = document.createElement('div');
    empty.className = 'review-remarks';
    empty.textContent = 'No remarks yet. Be the first to rate this service.';
    reviewWrap.appendChild(empty);
  }

  const form = document.createElement('form');
  form.className = 'review-form';
  form.innerHTML = `
    <label>${label}
      <select name="rating" aria-label="Rate this ${label.toLowerCase()}">
        <option value="5">5 - Excellent</option>
        <option value="4">4 - Good</option>
        <option value="3">3 - Fair</option>
        <option value="2">2 - Poor</option>
        <option value="1">1 - Very poor</option>
      </select>
    </label>
    <label>Remark
      <textarea name="remark" rows="2" maxlength="220" placeholder="Share your experience or comments"></textarea>
    </label>
    <button type="submit">Submit rating</button>
  `;

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const rating = Number(formData.get('rating'));
    const remark = String(formData.get('remark') || '').trim();
    if (submitReview(targetId, targetType, rating, remark)) {
      form.reset();
      renderServices();
    }
  });

  reviewWrap.appendChild(form);
  return reviewWrap;
}

function makeServiceCard(service) {
  const card = document.createElement('article');
  card.className = 'service-card';
  const skill = document.createElement('p');
  skill.className = 'service-card-category';
  skill.textContent = service.skill;
  const title = document.createElement('h3');
  title.textContent = service.title;
  card.append(skill, title);
  if (service.rate) card.appendChild(makeText('p', service.rate));
  if (service.area) card.appendChild(makeText('p', service.area));
  card.appendChild(makeText('p', service.description));
  card.appendChild(makeText('p', `Provider: ${service.providerName}`));
  if (service.email) {
    const email = document.createElement('a');
    email.href = `mailto:${service.email}`;
    email.textContent = service.email;
    card.appendChild(email);
  }
  if (service.phone) {
    const phone = document.createElement('a');
    phone.href = `tel:${service.phone}`;
    phone.textContent = service.phone;
    card.appendChild(phone);
  }
  card.appendChild(createReviewUI(service.id, 'service', 'Rate this service'));
  return card;
}

function makeText(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function renderServices() {
  const query = serviceSearch.value.trim().toLowerCase();
  const services = readServices()
    .filter(service => `${service.skill} ${service.title} ${service.description} ${service.providerName} ${service.area}`.toLowerCase().includes(query))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  serviceListings.replaceChildren();
  if (!services.length) {
    const empty = makeText('p', query ? 'No services match your search.' : 'No services listed yet. Be the first to advertise a skill.');
    empty.className = 'service-empty';
    serviceListings.appendChild(empty);
    return;
  }
  services.forEach(service => serviceListings.appendChild(makeServiceCard(service)));
}

serviceCategory.addEventListener('change', () => {
  const isCustomSkill = serviceCategory.value === 'custom';
  customSkillField.hidden = !isCustomSkill;
  customSkillInput.required = isCustomSkill;
  if (!isCustomSkill) customSkillInput.value = '';
});

serviceSearch.addEventListener('input', renderServices);
serviceForm.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(serviceForm);
  const category = formData.get('category');
  const skill = category === 'custom' ? formData.get('customSkill').trim() : category;
  const service = {
    id: `service-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    skill,
    title: formData.get('title').trim(),
    description: formData.get('description').trim(),
    rate: formData.get('rate').trim(),
    area: formData.get('area').trim(),
    providerName: formData.get('providerName').trim(),
    email: formData.get('email').trim(),
    phone: formData.get('phone').trim()
  };
  try {
    const services = readServices();
    services.unshift(service);
    localStorage.setItem(servicesStorageKey, JSON.stringify(services));
    serviceForm.reset();
    document.getElementById('provider-name').value = currentUser.fullname || '';
    document.getElementById('provider-email').value = currentUser.email || '';
    document.getElementById('provider-phone').value = currentUser.phone || '';
    customSkillField.hidden = true;
    customSkillInput.required = false;
    serviceMessage.textContent = 'Your service has been published on this browser.';
    renderServices();
  } catch {
    serviceMessage.textContent = 'Could not save your service in this browser. Check available storage and try again.';
  }
});

renderServices();