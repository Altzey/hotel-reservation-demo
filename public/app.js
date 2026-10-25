'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const roomsGrid    = document.getElementById('rooms-grid');
const roomsStatus  = document.getElementById('rooms-status');
const roomSelect   = document.getElementById('roomId');
const checkInEl    = document.getElementById('checkIn');
const checkOutEl   = document.getElementById('checkOut');
const priceEstEl   = document.getElementById('price-estimate');
const priceValEl   = document.getElementById('price-value');
const form         = document.getElementById('booking-form');
const submitBtn    = document.getElementById('submit-btn');
const formMsg      = document.getElementById('form-msg');

// ── State ─────────────────────────────────────────────────────────────────────
let rooms = [];   // populated from GET /api/rooms

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRupiah(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

function showStatus(msg, isError) {
  roomsStatus.textContent = msg;
  roomsStatus.className   = 'status-msg' + (isError ? ' error' : '');
  roomsStatus.hidden      = false;
}

function showFormMsg(msg, isError) {
  formMsg.textContent = msg;
  formMsg.className   = 'form-msg ' + (isError ? 'error' : 'success');
  formMsg.hidden      = false;
}

function hideFormMsg() {
  formMsg.hidden = true;
}

// ── Load rooms ────────────────────────────────────────────────────────────────
async function loadRooms() {
  showStatus('Memuat daftar kamar…', false);

  try {
    const res  = await fetch('/api/rooms');
    if (!res.ok) throw new Error('Server error ' + res.status);
    rooms = await res.json();
  } catch (err) {
    showStatus('Gagal memuat kamar. Pastikan server berjalan. (' + err.message + ')', true);
    return;
  }

  roomsStatus.hidden = true;
  renderRooms();
  populateSelect();
}

function renderRooms() {
  roomsGrid.innerHTML = '';
  rooms.forEach(room => {
    const card = document.createElement('div');
    card.className   = 'room-card';
    card.dataset.id  = room.id;
    card.innerHTML   = `
      <img src="${room.photoUrl}" alt="${room.name}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22130%22><rect width=%22400%22 height=%22130%22 fill=%22%23e5e7eb%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%2357606a%22 font-size=%2214%22>No Image</text></svg>'" />
      <div class="room-card-body">
        <div class="room-card-name">${room.name}</div>
        <div class="room-card-type">${room.type}</div>
        <div class="room-card-price">${formatRupiah(room.pricePerNight)} / malam</div>
      </div>`;
    card.addEventListener('click', () => selectRoomCard(room.id));
    roomsGrid.appendChild(card);
  });
}

function populateSelect() {
  rooms.forEach(room => {
    const opt   = document.createElement('option');
    opt.value   = room.id;
    opt.textContent = `${room.name} — ${formatRupiah(room.pricePerNight)}/malam`;
    roomSelect.appendChild(opt);
  });
}

// ── Card selection (syncs with select) ───────────────────────────────────────
function selectRoomCard(roomId) {
  document.querySelectorAll('.room-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.id === roomId);
  });
  roomSelect.value = roomId;
  updatePriceEstimate();
}

// ── Price estimate ────────────────────────────────────────────────────────────
function updatePriceEstimate() {
  const roomId   = roomSelect.value;
  const checkIn  = checkInEl.value;
  const checkOut = checkOutEl.value;

  if (!roomId || !checkIn || !checkOut) {
    priceEstEl.hidden = true;
    return;
  }

  const inDate  = new Date(checkIn);
  const outDate = new Date(checkOut);
  if (outDate <= inDate) {
    priceEstEl.hidden = true;
    return;
  }

  const room   = rooms.find(r => r.id === roomId);
  if (!room) { priceEstEl.hidden = true; return; }

  const nights = Math.round((outDate - inDate) / 86400000);
  const total  = nights * room.pricePerNight;
  priceValEl.textContent = `${formatRupiah(total)} (${nights} malam × ${formatRupiah(room.pricePerNight)})`;
  priceEstEl.hidden = false;
}

// ── Sync card highlight when select changes ───────────────────────────────────
roomSelect.addEventListener('change', () => {
  selectRoomCard(roomSelect.value);
});

checkInEl.addEventListener('change', updatePriceEstimate);
checkOutEl.addEventListener('change', updatePriceEstimate);

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFormMsg();

  const guestName = form.guestName.value.trim();
  const roomId    = form.roomId.value;
  const checkIn   = form.checkIn.value;
  const checkOut  = form.checkOut.value;

  // ── Client-side validation ──
  if (!guestName) {
    showFormMsg('Nama tamu tidak boleh kosong.', true);
    return;
  }
  if (!roomId) {
    showFormMsg('Silakan pilih kamar.', true);
    return;
  }
  if (!checkIn || !checkOut) {
    showFormMsg('Tanggal check-in dan check-out wajib diisi.', true);
    return;
  }
  if (new Date(checkOut) <= new Date(checkIn)) {
    showFormMsg('Tanggal check-out harus setelah check-in.', true);
    return;
  }

  submitBtn.disabled   = true;
  submitBtn.textContent = 'Memproses…';

  try {
    const res = await fetch('/api/reservations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ roomId, guestName, checkIn, checkOut }),
    });

    const data = await res.json();

    if (res.status === 201) {
      showFormMsg(
        `Reservasi berhasil! ID: ${data.id} · Total: ${formatRupiah(data.totalPrice)}`,
        false
      );
      form.reset();
      priceEstEl.hidden = true;
      document.querySelectorAll('.room-card').forEach(c => c.classList.remove('selected'));
    } else if (res.status === 409) {
      showFormMsg('Kamar sudah dipesan untuk tanggal tersebut. Pilih tanggal lain.', true);
    } else {
      showFormMsg('Gagal: ' + (data.error || 'Terjadi kesalahan.'), true);
    }
  } catch (err) {
    showFormMsg('Tidak dapat menghubungi server. (' + err.message + ')', true);
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Pesan Sekarang';
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
loadRooms();
