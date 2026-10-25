'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

// ── Data helpers ──────────────────────────────────────────────────────────────

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Response helpers ──────────────────────────────────────────────────────────

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

// ── Body parser ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── Static file server ────────────────────────────────────────────────────────

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  // Prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendError(res, 404, 'Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ── API handlers ──────────────────────────────────────────────────────────────

function handleGetRooms(req, res) {
  const { rooms } = readData();
  sendJson(res, 200, rooms);
}

function handleGetReservations(req, res) {
  const { reservations } = readData();
  sendJson(res, 200, reservations);
}

async function handlePostReservation(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const { roomId, guestName, checkIn, checkOut } = body;

  // ── Field presence ──
  if (!roomId || !guestName || !checkIn || !checkOut) {
    sendError(res, 400, 'roomId, guestName, checkIn, and checkOut are required');
    return;
  }

  const checkInDate  = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (isNaN(checkInDate) || isNaN(checkOutDate)) {
    sendError(res, 400, 'checkIn and checkOut must be valid dates (YYYY-MM-DD)');
    return;
  }

  // ── check-out must be after check-in ──
  if (checkOutDate <= checkInDate) {
    sendError(res, 400, 'checkOut must be after checkIn');
    return;
  }

  const data = readData();

  // ── Room must exist ──
  const room = data.rooms.find(r => r.id === roomId);
  if (!room) {
    sendError(res, 404, 'Room not found');
    return;
  }

  // ── Overlap check ──
  // Overlap condition: existing.checkIn < newCheckOut AND existing.checkOut > newCheckIn
  // Same-day check-in on previous check-out is allowed (boundary touch is NOT overlap)
  const hasOverlap = data.reservations.some(r => {
    if (r.roomId !== roomId) return false;
    const exIn  = new Date(r.checkIn);
    const exOut = new Date(r.checkOut);
    return exIn < checkOutDate && exOut > checkInDate;
  });

  if (hasOverlap) {
    sendError(res, 409, 'Room is already reserved for the requested dates');
    return;
  }

  // ── Calculate total price ──
  const nights = Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));
  const totalPrice = nights * room.pricePerNight;

  const newReservation = {
    id: `res-${Date.now()}`,
    roomId,
    guestName,
    checkIn,
    checkOut,
    totalPrice,
  };

  data.reservations.push(newReservation);
  writeData(data);

  sendJson(res, 201, newReservation);
}

// ── Router ────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (url === '/api/rooms' && method === 'GET') {
    handleGetRooms(req, res);
  } else if (url === '/api/reservations' && method === 'GET') {
    handleGetReservations(req, res);
  } else if (url === '/api/reservations' && method === 'POST') {
    handlePostReservation(req, res);
  } else if (!url.startsWith('/api/')) {
    serveStatic(req, res);
  } else {
    sendError(res, 404, 'API endpoint not found');
  }
});

server.listen(PORT, () => {
  console.log(`Hotel reservation server running at http://localhost:${PORT}`);
});
