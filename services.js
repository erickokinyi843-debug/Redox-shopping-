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