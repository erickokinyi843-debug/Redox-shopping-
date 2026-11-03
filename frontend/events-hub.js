const eventsStorageKey = 'rodyxEvents';
const expiredRetentionMs = 2 * 60 * 60 * 1000;
const eventForm = document.getElementById('event-form');
const eventListings = document.getElementById('event-listings');
const eventSearch = document.getElementById('event-search');
const eventDateInput = document.getElementById('event-date');
const eventPosterInput = document.getElementById('event-poster');
const eventPosterPreview = document.getElementById('event-poster-preview');
const eventMessage = document.getElementById('event-message');

const eventUser = (() => {
  try {
    return JSON.parse(localStorage.getItem('currentUser') || '{}');
  } catch {
    return {};
  }
})();

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

eventDateInput.min = localDateValue();
document.getElementById('event-organizer').value = eventUser.fullname || '';
document.getElementById('event-email').value = eventUser.email || '';
document.getElementById('event-phone').value = eventUser.phone || '';

function readEvents() {
  try {
    const events = JSON.parse(localStorage.getItem(eventsStorageKey) || '[]');
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

function getEventStart(event) {
  return new Date(`${event.date}T${event.startTime || '00:00'}`);
}

function getEventEnd(event) {
  if (event.endTime) return new Date(`${event.date}T${event.endTime}`);
  return new Date(getEventStart(event).getTime() + 2 * 60 * 60 * 1000);
}

function cleanupExpiredEvents() {
  const now = Date.now();
  const events = readEvents();
  const remaining = events.filter(event => {
    const endTime = getEventEnd(event).getTime();
    return Number.isFinite(endTime) && now - endTime < expiredRetentionMs;
  });
  if (remaining.length !== events.length) {
    localStorage.setItem(eventsStorageKey, JSON.stringify(remaining));
  }
  return remaining;
}

function getEventStatus(event) {
  const now = Date.now();
  const start = getEventStart(event).getTime();
  const end = getEventEnd(event).getTime();
  if (now < start) return { text: 'Upcoming', className: 'is-upcoming' };
  if (now <= end) return { text: 'On now', className: 'is-live' };
  const minutesLeft = Math.ceil(Math.max(0, end + expiredRetentionMs - now) / 60000);
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  const retention = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { text: `Expired · deletes in ${retention}`, className: 'is-expired' };
}

function createEventText(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function createEventCard(event) {
  const card = document.createElement('article');
  card.className = 'service-card';

  if (event.poster) {
    const poster = document.createElement('img');
    poster.className = 'event-poster';
    poster.src = event.poster;
    poster.alt = event.title ? `Poster for ${event.title}` : 'Event poster';
    poster.loading = 'lazy';
    card.appendChild(poster);
  }

  card.appendChild(createEventText('p', event.category, 'service-card-category'));
  card.appendChild(createEventText('h3', event.title));
  const status = getEventStatus(event);
  card.appendChild(createEventText('p', status.text, `listing-status ${status.className}`));

  const dateTime = getEventStart(event);
  const dateLabel = dateTime.toLocaleDateString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });
  const timeLabel = dateTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  card.appendChild(createEventText('p', `${dateLabel} at ${timeLabel}${event.endTime ? ` - ${event.endTime}` : ''}`, 'event-card-datetime'));
  card.appendChild(createEventText('p', event.description));
  card.appendChild(createEventText('p', `Venue: ${event.venue}`));
  card.appendChild(createEventText('p', `Area: ${event.area}`));
  if (event.admission) card.appendChild(createEventText('p', `Admission: ${event.admission}`));
  card.appendChild(createEventText('p', `Organizer: ${event.organizer}`));
  if (event.email && event.email.toLowerCase() !== String(eventUser.email || '').toLowerCase()) {
    const messageButton = document.createElement('button');
    messageButton.className = 'service-submit';
    messageButton.type = 'button';
    messageButton.textContent = 'Message organizer';
    messageButton.addEventListener('click', () => window.startUserMessage(event.email, event.organizer || 'Organizer'));
    card.appendChild(messageButton);
  }
  return card;
}

function renderEvents() {
  const query = eventSearch.value.trim().toLowerCase();
  const events = cleanupExpiredEvents()
    .filter(event => [event.title, event.category, event.description, event.venue, event.area, event.admission, event.organizer, event.date]
      .some(value => String(value || '').toLowerCase().includes(query)))
    .sort((first, second) => {
      const statusOrder = { 'On now': 0, Upcoming: 1, Expired: 2 };
      const firstStatus = getEventStatus(first).text.startsWith('Expired') ? 'Expired' : getEventStatus(first).text;
      const secondStatus = getEventStatus(second).text.startsWith('Expired') ? 'Expired' : getEventStatus(second).text;
      const statusDifference = statusOrder[firstStatus] - statusOrder[secondStatus];
      if (statusDifference) return statusDifference;
      if (firstStatus === 'Expired') return getEventEnd(second) - getEventEnd(first);
      return getEventStart(first) - getEventStart(second);
    });

  eventListings.replaceChildren();
  if (!events.length) {
    const empty = createEventText('p', query ? 'No upcoming events match your search.' : 'No upcoming events listed yet. Post an event to get started.');
    empty.className = 'service-empty';
    eventListings.appendChild(empty);
    return;
  }

  events.forEach(event => eventListings.appendChild(createEventCard(event)));
}

function readEventPoster(file) {
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('The selected poster could not be read.')));
    reader.readAsDataURL(file);
  });
}

eventPosterInput.addEventListener('change', () => {
  const file = eventPosterInput.files[0];
  if (!file) {
    eventPosterPreview.hidden = true;
    eventPosterPreview.removeAttribute('src');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    eventPosterInput.value = '';
    eventPosterPreview.hidden = true;
    eventPosterPreview.removeAttribute('src');
    eventMessage.textContent = 'Choose an image smaller than 2 MB.';
    return;
  }
  eventPosterPreview.src = URL.createObjectURL(file);
  eventPosterPreview.hidden = false;
  eventMessage.textContent = '';
});

eventSearch.addEventListener('input', renderEvents);
eventForm.addEventListener('submit', async event => {
  event.preventDefault();
  const posterFile = eventPosterInput.files[0];
  if (posterFile && posterFile.size > 2 * 1024 * 1024) {
    eventMessage.textContent = 'Choose an image smaller than 2 MB.';
    return;
  }

  const formData = new FormData(eventForm);
  const start = new Date(`${formData.get('date')}T${formData.get('startTime')}`);
  if (Number.isNaN(start.getTime()) || start < new Date()) {
    eventMessage.textContent = 'Choose a future date and time for your event.';
    return;
  }
  const endTime = String(formData.get('endTime') || '');
  if (endTime && endTime <= String(formData.get('startTime'))) {
    eventMessage.textContent = 'The end time must be later than the start time.';
    return;
  }

  const submitButton = eventForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  eventMessage.textContent = 'Publishing event...';

  try {
    const newEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      category: String(formData.get('category')).trim(),
      title: String(formData.get('title')).trim(),
      description: String(formData.get('description')).trim(),
      date: String(formData.get('date')),
      startTime: String(formData.get('startTime')),
      endTime,
      venue: String(formData.get('venue')).trim(),
      area: String(formData.get('area')).trim(),
      admission: String(formData.get('admission') || '').trim(),
      organizer: String(formData.get('organizer')).trim(),
      email: String(formData.get('email')).trim(),
      phone: String(formData.get('phone')).trim(),
      poster: await readEventPoster(posterFile)
    };

    const events = readEvents();
    events.unshift(newEvent);
    localStorage.setItem(eventsStorageKey, JSON.stringify(events));
    eventForm.reset();
    eventDateInput.min = localDateValue();
    document.getElementById('event-organizer').value = eventUser.fullname || '';
    document.getElementById('event-email').value = eventUser.email || '';
    document.getElementById('event-phone').value = eventUser.phone || '';
    eventPosterPreview.hidden = true;
    eventPosterPreview.removeAttribute('src');
    eventMessage.textContent = 'Your event has been published on this browser.';
    renderEvents();
  } catch {
    eventMessage.textContent = 'Could not save this event in your browser. Try a smaller image or clear some storage.';
  } finally {
    submitButton.disabled = false;
  }
});

renderEvents();
setInterval(() => {
  cleanupExpiredEvents();
  renderEvents();
}, 60000);