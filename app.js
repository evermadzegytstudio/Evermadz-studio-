// Travel Booking Voice Assistant Demo
// - Voice input (SpeechRecognition)
// - Voice output (SpeechSynthesis)
// - Simple NLU for destination + date extraction
// - Mock flight search and booking

const micStatusEl = document.getElementById('micStatus');
const nluStatusEl = document.getElementById('nluStatus');
const agentStatusEl = document.getElementById('agentStatus');
const userTextEl = document.getElementById('userText');
const agentTextEl = document.getElementById('agentText');
const resultsEl = document.getElementById('results');
const bookingStatusEl = document.getElementById('bookingStatus');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');

// Feature detection
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;
const synth = window.speechSynthesis;

if (!recognition) {
  micStatusEl.textContent = 'SpeechRecognition not supported in this browser';
  startBtn.disabled = true;
  stopBtn.disabled = true;
  agentSpeak('Your browser does not support voice input. Please try Chrome on desktop.');
} else {
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-IN';
}

startBtn.addEventListener('click', () => {
  if (!recognition) return;
  userTextEl.textContent = '';
  micStatusEl.textContent = 'Listening…';
  startBtn.disabled = true;
  stopBtn.disabled = false;
  recognition.start();
});

stopBtn.addEventListener('click', () => {
  if (!recognition) return;
  micStatusEl.textContent = 'Stopped';
  recognition.stop();
  startBtn.disabled = false;
  stopBtn.disabled = true;
});

clearBtn.addEventListener('click', () => {
  userTextEl.textContent = '';
  agentTextEl.textContent = '';
  resultsEl.innerHTML = '';
  bookingStatusEl.textContent = '';
  micStatusEl.textContent = 'Idle';
  nluStatusEl.textContent = 'Waiting';
  agentStatusEl.textContent = 'Ready';
});

// Recognition events
if (recognition) {
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    userTextEl.textContent = transcript;
    micStatusEl.textContent = 'Heard voice';
    processQuery(transcript);
  };
  recognition.onerror = (e) => {
    micStatusEl.textContent = `Error: ${e.error}`;
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
  recognition.onend = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
}

// Agent speak helper
function agentSpeak(text) {
  agentTextEl.textContent = text;
  agentStatusEl.textContent = 'Speaking';
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-IN';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.onend = () => {
    agentStatusEl.textContent = 'Ready';
  };
  synth.cancel(); // stop any ongoing speech
  synth.speak(utter);
}

// Simple NLU pipeline
async function processQuery(transcript) {
  nluStatusEl.textContent = 'Parsing…';

  // Extract destination
  const destination = extractDestination(transcript) || 'Delhi';

  // Extract date (supports “next Friday”, “on 5th December”, ISO date, etc.)
  const travelDateISO = tryParseDate(transcript);
  if (!travelDateISO) {
    nluStatusEl.textContent = 'Needs date confirmation';
    const prompt = `I heard you want to go to ${destination}. What day should I check? You can say “next Friday” or a date.`;
    agentSpeak(prompt);
    return;
  }

  nluStatusEl.textContent = `Parsed: destination=${destination}, date=${travelDateISO}`;

  // Confirm intent
  agentSpeak(`Searching flights from Bengaluru to ${destination} on ${prettyDate(travelDateISO)}.`);

  // Fetch mock flights
  const flights = await fetchFlights(destination, travelDateISO);

  if (!flights.length) {
    resultsEl.innerHTML = '';
    agentSpeak(`I couldn’t find flights to ${destination} on ${prettyDate(travelDateISO)}. Would you like me to check the next day?`);
    return;
  }

  renderFlights(flights);

  // Offer spoken options
  const top = flights.slice(0, 2);
  const spokenOptions = top.map(f =>
    `${f.airline} ${f.flightNumber} at ${f.departTime}, ₹${f.priceINR}`
  ).join('; ');
  agentSpeak(`I found ${flights.length} options. For example: ${spokenOptions}. Say “book the first one” or click a button.`);
}

// Destination extraction (very simple keyword-based)
function extractDestination(text) {
  const cities = ['Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad', 'Jaipur', 'Goa'];
  const lower = text.toLowerCase();
  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  // Try “to X” pattern
  const toMatch = lower.match(/to ([a-zA-Z ]+)/);
  if (toMatch) {
    const guess = capitalizeWords(toMatch[1].trim());
    return guess;
  }
  return null;
}

function capitalizeWords(s) {
  return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Date parsing
function tryParseDate(text) {
  const lower = text.toLowerCase();

  // 1) Relative weekdays: next friday, next monday, etc.
  const weekdayMatch = lower.match(/next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (weekdayMatch) {
    const targetIso = nextWeekdayISO(weekdayMatch[1]);
    return targetIso;
  }

  // 2) Explicit “on 5th December”, “5 December”, “Dec 5”
  const explicitMatch = lower.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)/);
  if (explicitMatch) {
    const day = parseInt(explicitMatch[1], 10);
    const monthStr = explicitMatch[2];
    const month = monthNameToIndex(monthStr);
    const year = guessYear(month, day);
    return toISO(year, month, day);
  }

  // 3) ISO mention e.g., 2025-12-05
  const isoMatch = lower.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[0];

  // 4) “on Friday” (assume upcoming Friday)
  const onWeekdayMatch = lower.match(/on (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (onWeekdayMatch) return nextWeekdayISO(onWeekdayMatch[1]);

  return null;
}

function monthNameToIndex(m) {
  const map = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  return map[m] ?? 0;
}

function guessYear(monthIndex, day) {
  const today = new Date();
  const candidate = new Date(today.getFullYear(), monthIndex, day);
  // If the date has already passed this year, assume next year
  if (candidate < today) return today.getFullYear() + 1;
  return today.getFullYear();
}

function nextWeekdayISO(weekdayName) {
  const map = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
  const target = map[weekdayName.toLowerCase()];
  const today = new Date();
  const delta = (target - today.getDay() + 7) % 7 || 7; // always next (not today)
  const next = new Date(today);
  next.setDate(today.getDate() + delta);
  return toISO(next.getFullYear(), next.getMonth(), next.getDate());
}

function toISO(year, monthIndex, day) {
  const month = (monthIndex + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${month}-${d}`;
}

function prettyDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
}

// Fetch mock flights and filter
async function fetchFlights(destination, isoDate) {
  const res = await fetch('flights.json');
  const data = await res.json();
  const originCity = 'Bengaluru'; // demo assumption

  // If destination not in mock, still return a synthetic option
  let matches = data.filter(f => f.destination.toLowerCase() === destination.toLowerCase()
    && f.date === isoDate
    && f.origin === originCity
  );

  if (matches.length === 0) {
    // Provide one synthetic fallback to keep demo flowing
    matches = [{
      origin: originCity,
      destination,
      date: isoDate,
      airline: 'IndiGo',
      flightNumber: '6E-999',
      departTime: '09:20',
      arriveTime: '12:10',
      duration: '2h 50m',
      priceINR: 6120
    }];
  }

  // Sort by price ascending
  matches.sort((a,b) => a.priceINR - b.priceINR);
  return matches;
}

function renderFlights(flights) {
  resultsEl.innerHTML = '';
  flights.forEach((f, idx) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div>
        <div><strong>${f.airline} ${f.flightNumber}</strong> • ${f.origin} → ${f.destination}</div>
        <div class="meta">${f.departTime} – ${f.arriveTime} • ${f.duration} • ${prettyDate(f.date)}</div>
        <div class="price">₹${f.priceINR}</div>
      </div>
      <div>
        <button data-idx="${idx}" class="bookBtn">Book</button>
      </div>
    `;
    resultsEl.appendChild(card);
  });

  // Wire up buttons
  document.querySelectorAll('.bookBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-idx'), 10);
      bookFlight(flights[idx]);
    });
  });

  // Voice booking: “book the first one”, “book the second one”
  listenForBookingCommands(flights);
}

function bookFlight(flight) {
  const msg = `Booking confirmed: ${flight.airline} ${flight.flightNumber} from ${flight.origin} to ${flight.destination} on ${prettyDate(flight.date)}. Total ₹${flight.priceINR}.`;
  bookingStatusEl.textContent = msg;
  agentSpeak(msg);
}

function listenForBookingCommands(flights) {
  // Simple parser on last user text
  const text = (userTextEl.textContent || '').toLowerCase();
  const orderMatch = text.match(/book (the )?(first|second|third|1st|2nd|3rd) (one|option)?/);
  if (orderMatch) {
    const map = { first:0, '1st':0, second:1, '2nd':1, third:2, '3rd':2 };
    const key = orderMatch[2];
    const idx = map[key];
    if (idx !== undefined && flights[idx]) {
      bookFlight(flights[idx]);
      return;
    }
  }

  // “book” without index will choose cheapest
  if (text.includes('book')) {
    bookFlight(flights[0]);
  }
}
