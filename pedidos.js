import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  updateDoc, deleteDoc, onSnapshot, query, orderBy
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

// ── FIREBASE ──────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD-P5-GOlwT-Ax51u3giJm1G-oXmfOf9-g",
  authDomain: "tabymakeup-of.firebaseapp.com",
  projectId: "tabymakeup-of",
  storageBucket: "tabymakeup-of.appspot.com",
  messagingSenderId: "548834143470",
  appId: "1:548834143470:web:54812e64324b3629f617ff"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── ESTADO ────────────────────────────────────────────────────────
let todosLosPedidos  = [];
let pedidoActualId   = null;
let pedidosConocidos = null; // null = primera carga
let _snapshotUnsub   = null;

// ── AUTH ──────────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = `login.html?session_expired=1&t=${Date.now()}`;
    return;
  }
  escucharPedidos();
});

// Inactividad 10 min → logout
let inactivityTimer;
function resetInactivity() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    signOut(auth).then(() => {
      window.location.href = `login.html?timeout=1&t=${Date.now()}`;
    });
  }, 600_000);
}
['mousedown','mousemove','keypress','scroll','click','touchstart'].forEach(e => {
  document.addEventListener(e, resetInactivity, { passive: true });
});
resetInactivity();

// ── DOM REFS ──────────────────────────────────────────────────────
const ordersList   = document.getElementById('orders-list');
const emptyState   = document.getElementById('empty-state');
const searchInput  = document.getElementById('search-input');
const filterPago   = document.getElementById('filter-pago');
const filterOrden  = document.getElementById('filter-orden');
const totalBadge   = document.getElementById('total-badge');
const filterChips  = document.getElementById('filter-chips');

// Estado activo del filtro de chips (reemplaza al <select>)
let filtroEstadoActivo = 'all';

const statTotal   = document.getElementById('stat-total');
const statNuevos  = document.getElementById('stat-nuevos');
const statEnviados= document.getElementById('stat-enviados');
const statDinero  = document.getElementById('stat-total-dinero');

const detailModal  = document.getElementById('detail-modal');
const dmNombre     = document.getElementById('dm-nombre');
const dmFecha      = document.getElementById('dm-fecha');
const dmContacto   = document.getElementById('dm-contacto');
const dmPago       = document.getElementById('dm-pago');
const dmNotaWrap   = document.getElementById('dm-nota-wrap');
const dmNota       = document.getElementById('dm-nota');
const dmItems      = document.getElementById('dm-items');
const dmTotal      = document.getElementById('dm-total');
const dmEstadoBtns = document.getElementById('dm-estado-btns');
const dmWaBtn      = document.getElementById('dm-wa-btn');

// ── DOM REFS ARCHIVO ──────────────────────────────────────────────
const archivoModal      = document.getElementById('archivo-modal');
const archivoLista      = document.getElementById('archivo-lista');
const archivoEmpty      = document.getElementById('archivo-empty');
const archivoStatCount  = document.getElementById('archivo-stat-count');
const archivoStatDinero = document.getElementById('archivo-stat-dinero');
const archivoBadge      = document.getElementById('archivo-badge');
const archivoSearch     = document.getElementById('archivo-search');

// ── ESCUCHAR PEDIDOS EN TIEMPO REAL ───────────────────────────────
function escucharPedidos() {
  if (_snapshotUnsub) { _snapshotUnsub(); _snapshotUnsub = null; }

  const q = query(collection(db, 'pedidos'), orderBy('fecha', 'desc'));
  _snapshotUnsub = onSnapshot(q, snapshot => {
    const nuevos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (pedidosConocidos === null) {
      // Primera carga: registrar IDs sin notificar
      pedidosConocidos = new Set(nuevos.map(p => p.id));
    } else {
      // Cargas siguientes: detectar nuevos
      nuevos.forEach(p => {
        if (!pedidosConocidos.has(p.id)) {
          pedidosConocidos.add(p.id);
          notificarNuevoPedido(p);
        }
      });
    }

    todosLosPedidos = nuevos;
    actualizarStats();
    aplicarFiltrosYRenderizar();
    actualizarBadgeNuevos();
  }, err => {
    console.error('[Pedidos] onSnapshot error:', err);
    _snapshotUnsub = null;
    setTimeout(escucharPedidos, 5000);
  });
}

// Reconectar cuando vuelve la conexión o la pantalla
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') escucharPedidos();
});
window.addEventListener('online', () => escucharPedidos());

// ── NOTIFICACIÓN DE NUEVO PEDIDO ──────────────────────────────────
function notificarNuevoPedido(pedido) {
  mostrarToast(`🛍️ Nuevo pedido de ${pedido.nombreCliente || 'cliente'}`, 'shopping-bag', 'text-pink-400', 7000);
  reproducirSonido();

  if (Notification.permission === 'granted') {
    new Notification('TabyMakeup — Nuevo pedido 🎀', {
      body: `${pedido.nombreCliente || 'Cliente nuevo'} · $${calcularTotal(pedido.items).toLocaleString('es-AR')}`,
      icon: 'https://i.ibb.co/qYWjKTSd/logo.webp'
    });
  }
}

function reproducirSonido() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const notas = [880, 1100, 880, 1320];
    notas.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.12);
    });
  } catch (_) {}
}

// Pedir permiso de notificaciones
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

// ── BADGE NUEVOS (título de la pestaña) ───────────────────────────
function actualizarBadgeNuevos() {
  const cant = todosLosPedidos.filter(p => ['nuevo','pendiente'].includes(p.estado || 'pendiente')).length;
  document.title = cant > 0 ? `(${cant}) TabyMakeup | Pedidos` : 'TabyMakeup | Pedidos';
}

// ── FILTROS (solo pedidos NO completados) ────────────────────────
function aplicarFiltrosYRenderizar() {
  const texto  = searchInput.value.trim().toLowerCase();
  const estado = filtroEstadoActivo;
  const pago   = filterPago.value;
  const orden  = filterOrden.value;

  // Excluir completados de la grilla principal
  let lista = todosLosPedidos.filter(p => (p.estado || 'pendiente') !== 'completado');

  if (texto) {
    lista = lista.filter(p =>
      p.nombreCliente?.toLowerCase().includes(texto) ||
      p.contacto?.toLowerCase().includes(texto)
    );
  }
  if (estado !== 'all') {
    if (estado === 'pendiente') {
      lista = lista.filter(p => ['nuevo','pendiente'].includes(p.estado || 'pendiente'));
    } else {
      lista = lista.filter(p => p.estado === estado);
    }
  }
  if (pago !== 'all')   lista = lista.filter(p => p.medioPago?.toLowerCase().includes(pago));

  lista.sort((a, b) => {
    const fa = a.fecha?.seconds || 0;
    const fb = b.fecha?.seconds || 0;
    return orden === 'desc' ? fb - fa : fa - fb;
  });

  renderizarLista(lista);
  totalBadge.textContent = lista.length;
}

[searchInput, filterPago, filterOrden].forEach(el => {
  el.addEventListener('input', aplicarFiltrosYRenderizar);
  el.addEventListener('change', aplicarFiltrosYRenderizar);
});

// ── STATS (solo pedidos activos, sin completados) ─────────────────
function actualizarStats() {
  const activos  = todosLosPedidos.filter(p => (p.estado || 'pendiente') !== 'completado');
  const total    = activos.length;
  const nuevos   = activos.filter(p => ['nuevo','pendiente'].includes(p.estado || 'pendiente')).length;
  const enviados = activos.filter(p => p.estado === 'contactado').length;
  const dinero   = activos
    .filter(p => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + calcularTotal(p.items), 0);

  statTotal.textContent    = total;
  statNuevos.textContent   = nuevos;
  statEnviados.textContent = enviados;
  statDinero.textContent   = `$${dinero.toLocaleString('es-AR')}`;

  // Actualizar chips de filtro con conteos frescos
  renderizarFilterChips();
}

// ── FILTER CHIPS DE ESTADO ────────────────────────────────────────
const CHIP_DEFS = [
  { value: 'all',        label: 'Todos',      icon: 'fas fa-th-large'      },
  { value: 'pendiente',  label: 'Pendiente',  icon: 'fas fa-clock'         },
  { value: 'contactado', label: 'Contactado', icon: 'fas fa-phone'         },
  { value: 'cancelado',  label: 'Cancelado',  icon: 'fas fa-times-circle'  },
];

function renderizarFilterChips() {
  const activos = todosLosPedidos.filter(p => (p.estado || 'pendiente') !== 'completado');

  const conteos = {
    all:        activos.length,
    pendiente:  activos.filter(p => ['nuevo','pendiente'].includes(p.estado || 'pendiente')).length,
    contactado: activos.filter(p => p.estado === 'contactado').length,
    cancelado:  activos.filter(p => p.estado === 'cancelado').length,
  };

  filterChips.innerHTML = '';
  CHIP_DEFS.forEach(({ value, label, icon }) => {
    const btn = document.createElement('button');
    btn.className = `filter-chip${filtroEstadoActivo === value ? ' active' : ''}`;
    btn.dataset.estado = value;
    btn.innerHTML = `<i class="${icon}"></i> ${label} <span class="chip-count">${conteos[value]}</span>`;
    btn.addEventListener('click', () => {
      filtroEstadoActivo = value;
      renderizarFilterChips();
      aplicarFiltrosYRenderizar();
    });
    filterChips.appendChild(btn);
  });
}

// ── ARCHIVO: actualizar modal y badge ─────────────────────────────
function actualizarArchivo(filtroTexto = '') {
  const completados = todosLosPedidos
    .filter(p => (p.estado || 'nuevo') === 'completado')
    .sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0));

  // (badge eliminado del header)
  const cant = completados.length;

  // Stats del modal
  const totalDinero = completados.reduce((sum, p) => sum + calcularTotal(p.items), 0);
  archivoStatCount.textContent  = cant;
  archivoStatDinero.textContent = `$${totalDinero.toLocaleString('es-AR')}`;

  // Filtrar por búsqueda si hay texto
  const texto = filtroTexto.trim().toLowerCase();
  const lista = texto
    ? completados.filter(p =>
        p.nombreCliente?.toLowerCase().includes(texto) ||
        p.contacto?.toLowerCase().includes(texto)
      )
    : completados;

  // Limpiar lista (conservar el empty state)
  const cards = archivoLista.querySelectorAll('.archivo-card');
  cards.forEach(c => c.remove());

  if (lista.length === 0) {
    archivoEmpty.classList.remove('hidden');
    return;
  }
  archivoEmpty.classList.add('hidden');

  lista.forEach(p => {
    const card = crearCardArchivo(p);
    archivoLista.appendChild(card);
  });
}

// ── CARD ARCHIVO ──────────────────────────────────────────────────
function crearCardArchivo(pedido) {
  const fecha       = toDate(pedido.fecha);
  const fechaStr    = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const horaStr     = fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const totalPedido = calcularTotal(pedido.items);

  const card = document.createElement('div');
  card.className = 'archivo-card bg-white border border-purple-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-purple-200 transition cursor-pointer';
  card.dataset.id = pedido.id;

  card.innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <!-- Avatar con check -->
        <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
             style="background: linear-gradient(135deg, #ede9fe, #ddd6fe);">
          <i class="fas fa-check text-purple-500 text-sm"></i>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-bold text-gray-800 truncate">${escHtml(pedido.nombreCliente || 'Sin nombre')}</p>
          <p class="text-xs text-gray-400 mt-0.5 truncate">
            <i class="fas fa-phone text-[9px] mr-1"></i>${escHtml(pedido.contacto || '—')}
            &nbsp;·&nbsp;
            <i class="fas fa-credit-card text-[9px] mr-1"></i>${escHtml(pedido.medioPago || '—')}
          </p>
          <p class="text-[10px] text-gray-400 mt-1 line-clamp-1">
            ${(pedido.items || []).map(i => `${escHtml(i.nombre)} x${i.cantidad}`).join(' · ')}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex items-center gap-2">
        <div class="text-right">
          <p class="text-base font-black text-purple-600">$${totalPedido.toLocaleString('es-AR')}</p>
          <p class="text-[9px] text-gray-400 mt-0.5">${fechaStr} ${horaStr}</p>
          <span class="inline-flex items-center gap-1 mt-1 text-[9px] font-black uppercase tracking-wider text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
            <i class="fas fa-check-double text-[8px]"></i> Completado
          </span>
        </div>
        <!-- Botón eliminar definitivo -->
        <button class="archivo-delete-btn shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-red-50 hover:bg-red-100 text-red-400 hover:text-red-600 border border-red-200 transition" title="Eliminar definitivamente">
          <i class="fas fa-trash-alt text-xs"></i>
        </button>
      </div>
    </div>`;

  // Botón eliminar: no propaga el click a la card
  card.querySelector('.archivo-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    confirmarEliminarDesdeArchivo(pedido.id);
  });

  // Click en la card: abrir el detalle normal
  card.addEventListener('click', () => {
    cerrarArchivo();
    setTimeout(() => abrirDetalle(pedido.id), 200);
  });

  return card;
}

// ── ABRIR / CERRAR ARCHIVO ────────────────────────────────────────
function abrirArchivo() {
  actualizarArchivo(archivoSearch.value);
  archivoModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function cerrarArchivo() {
  archivoModal.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('btn-archivo').addEventListener('click', abrirArchivo);
document.getElementById('close-archivo').addEventListener('click', cerrarArchivo);
archivoModal.addEventListener('click', e => {
  if (e.target === archivoModal) cerrarArchivo();
});

// Búsqueda dentro del archivo
archivoSearch.addEventListener('input', () => {
  actualizarArchivo(archivoSearch.value);
});

// ── RENDER LISTA PRINCIPAL ────────────────────────────────────────
function renderizarLista(lista) {
  document.querySelector('.skeleton-wrap')?.remove();

  if (lista.length === 0) {
    ordersList.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  ordersList.innerHTML = '';
  lista.forEach(p => ordersList.appendChild(crearCard(p)));
}

// ── CARD PRINCIPAL ────────────────────────────────────────────────
function crearCard(pedido) {
  const estado      = pedido.estado || 'pendiente';
  const fecha       = toDate(pedido.fecha);
  const fechaStr    = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const horaStr     = fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const totalPedido = calcularTotal(pedido.items);
  const esPendiente = ['nuevo','pendiente'].includes(estado);
  const chip        = chipEstado(estado);

  const card = document.createElement('div');
  card.className = `order-card bg-white/90 border ${esPendiente ? 'border-yellow-300 shadow-yellow-100' : 'border-pink-100'} rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition cursor-pointer`;
  card.dataset.id = pedido.id;

  card.innerHTML = `
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-start gap-3 min-w-0">
        <div class="shrink-0 w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
          <i class="fas fa-user text-primary text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm font-bold text-gray-800 truncate">${escHtml(pedido.nombreCliente || 'Sin nombre')}</p>
            ${esPendiente ? '<span class="badge-new bg-yellow-400 text-yellow-900 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">Pendiente</span>' : ''}
          </div>
          <p class="text-xs text-gray-400 mt-0.5">
            <i class="fas fa-phone text-[9px] mr-1"></i>${escHtml(pedido.contacto || '—')}
            &nbsp;·&nbsp;
            <i class="fas fa-credit-card text-[9px] mr-1"></i>${escHtml(pedido.medioPago || '—')}
          </p>
          <p class="text-[10px] text-gray-500 mt-1.5 line-clamp-1">
            ${(pedido.items || []).map(i => `${escHtml(i.nombre)}${i.tono ? ` (${escHtml(i.tono)})` : ''} x${i.cantidad}`).join(' · ')}
          </p>
        </div>
      </div>
      <div class="shrink-0 flex flex-col items-end gap-2 text-right">
        <span class="chip ${chip.bgChip} ${chip.textChip}">
          <i class="${chip.icon}"></i> ${chip.label}
        </span>
        <p class="text-base font-black text-gray-800">$${totalPedido.toLocaleString('es-AR')}</p>
        <p class="text-[9px] text-gray-400">${fechaStr} ${horaStr}</p>
      </div>
    </div>`;

  card.addEventListener('click', () => abrirDetalle(pedido.id));
  return card;
}

// ── DETALLE MODAL ─────────────────────────────────────────────────
function abrirDetalle(id) {
  const pedido = todosLosPedidos.find(p => p.id === id);
  if (!pedido) return;

  pedidoActualId = id;
  const estado      = pedido.estado || 'pendiente';
  const fecha       = toDate(pedido.fecha);
  const totalPedido = calcularTotal(pedido.items);

  dmNombre.textContent   = pedido.nombreCliente || 'Sin nombre';
  dmFecha.textContent    = fecha.toLocaleDateString('es-AR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) + ' · ' + fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  dmContacto.textContent = pedido.contacto || '—';
  dmPago.textContent     = pedido.medioPago || '—';

  if (pedido.nota?.trim()) {
    dmNota.textContent = pedido.nota;
    dmNotaWrap.classList.remove('hidden');
  } else {
    dmNotaWrap.classList.add('hidden');
  }

  // Items
  dmItems.innerHTML = '';
  (pedido.items || []).forEach(item => {
    const lineTotal = item.precio * item.cantidad;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-3 bg-gray-50 rounded-xl p-3';
    div.innerHTML = `
      <img src="${escHtml(item.imagenCarrito || item.imagen || '')}" alt=""
           class="w-12 h-12 object-contain rounded-lg bg-white shrink-0"
           onerror="this.style.display='none'">
      <div class="flex-1 min-w-0">
        <p class="text-xs font-bold text-gray-800 truncate">${escHtml(item.nombre)}</p>
        ${item.tono ? `<p class="text-[9px] text-gray-400 uppercase font-semibold">${escHtml(item.tono)}</p>` : ''}
      </div>
      <div class="shrink-0 text-right">
        <p class="text-xs font-black text-gray-800">$${lineTotal.toLocaleString('es-AR')}</p>
        <p class="text-[9px] text-gray-400">$${item.precio.toLocaleString('es-AR')} × ${item.cantidad}</p>
      </div>`;
    dmItems.appendChild(div);
  });

  dmTotal.textContent = `$${totalPedido.toLocaleString('es-AR')}`;

  // ── Estado actual (chip de lectura) ───────────────────────────
  const dmEstadoActual = document.getElementById('dm-estado-actual');
  if (dmEstadoActual) {
    const chip = chipEstado(estado);
    dmEstadoActual.innerHTML = `
      <span class="chip ${chip.bgChip} ${chip.textChip}">
        <i class="${chip.icon}"></i> ${chip.label}
      </span>`;
  }

  // ── Botones de cambio de estado (solo los 4 activos) ──────────
  const estados = ['pendiente', 'contactado', 'completado', 'cancelado'];
  dmEstadoBtns.innerHTML = '';
  estados.forEach(e => {
    const chip  = chipEstado(e);
    const activo = e === estado;
    const btn  = document.createElement('button');
    btn.className = `chip ${activo ? chip.bgChip + ' ' + chip.textChip + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition cursor-pointer`;
    btn.innerHTML = `<i class="${chip.icon}"></i> ${chip.label}`;
    if (!activo) btn.addEventListener('click', () => cambiarEstado(id, e, btn));
    dmEstadoBtns.appendChild(btn);
  });

  // WhatsApp
  const numero = extraerNumero(pedido.contacto || '');
  const msgWa  = generarMsgWa(pedido);
  dmWaBtn.href = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(msgWa)}`
    : `https://wa.me/?text=${encodeURIComponent(msgWa)}`;

  detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function cerrarDetalle() {
  detailModal.classList.add('hidden');
  document.body.style.overflow = '';
  pedidoActualId = null;
}

document.getElementById('close-detail').addEventListener('click', cerrarDetalle);
detailModal.addEventListener('click', e => { if (e.target === detailModal) cerrarDetalle(); });

// ── CAMBIAR ESTADO ────────────────────────────────────────────────
async function cambiarEstado(id, nuevoEstado, btnEl) {
  // Bloquear TODOS los botones de estado mientras se guarda
  const todosBtns = dmEstadoBtns.querySelectorAll('button');
  todosBtns.forEach(b => b.setAttribute('disabled', ''));

  // Spinner en el botón clickeado
  const iconoOriginal = btnEl.innerHTML;
  btnEl.innerHTML = `<span class="btn-estado-spinner"></span> ${capitalizar(nuevoEstado)}`;

  try {
    await updateDoc(doc(db, 'pedidos', id), { estado: nuevoEstado });

    const msg = nuevoEstado === 'completado'
      ? '✅ Pedido archivado como completado'
      : `Estado: ${capitalizar(nuevoEstado)}`;
    const color = nuevoEstado === 'completado' ? 'text-purple-400' : 'text-green-400';

    mostrarToast(msg, nuevoEstado === 'completado' ? 'archive' : 'check-circle', color);
    cerrarDetalle();
  } catch (e) {
    console.error(e);
    // Restaurar botón si falla
    btnEl.innerHTML = iconoOriginal;
    todosBtns.forEach(b => b.removeAttribute('disabled'));
    mostrarToast('Error al actualizar estado', 'exclamation-circle', 'text-red-400');
  }
}

// ── ELIMINAR PEDIDO ───────────────────────────────────────────────
const deleteModal   = document.getElementById('delete-modal');
const confirmDelete = document.getElementById('confirm-delete');
const cancelDelete  = document.getElementById('cancel-delete');

document.getElementById('dm-delete-btn').addEventListener('click', () => {
  deleteModal.classList.remove('hidden');
});
cancelDelete.addEventListener('click',  () => deleteModal.classList.add('hidden'));
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) deleteModal.classList.add('hidden'); });

confirmDelete.addEventListener('click', async () => {
  if (!pedidoActualId) return;
  const spinner = document.getElementById('confirm-delete-spinner');
  const label   = document.getElementById('confirm-delete-label');
  confirmDelete.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (label)   label.textContent = 'Eliminando…';
  try {
    await deleteDoc(doc(db, 'pedidos', pedidoActualId));
    deleteModal.classList.add('hidden');
    cerrarDetalle();
    mostrarToast('Pedido eliminado', 'trash-alt', 'text-red-400');
  } catch (e) {
    console.error(e);
    mostrarToast('Error al eliminar', 'exclamation-circle', 'text-red-400');
  } finally {
    confirmDelete.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    if (label)   label.textContent = 'Sí, eliminar';
  }
});

// ── COPIAR CONTACTO ───────────────────────────────────────────────
document.getElementById('dm-copy-btn').addEventListener('click', function () {
  const numero = dmContacto.textContent;
  navigator.clipboard.writeText(numero).then(() => {
    mostrarToast('Número copiado', 'copy', 'text-pink-400');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = numero;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    mostrarToast('Número copiado', 'copy', 'text-pink-400');
  });
});

// ── IMPRIMIR TICKET ───────────────────────────────────────────────
document.getElementById('dm-print-btn').addEventListener('click', () => {
  if (!pedidoActualId) return;
  imprimirTicket(pedidoActualId);
});

function imprimirTicket(id) {
  const p = todosLosPedidos.find(x => x.id === id);
  if (!p) return;

  const fecha = toDate(p.fecha).toLocaleDateString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });

  const itemsHTML = (p.items || []).map(i => `
    <tr>
      <td style="font-size:10px;padding:5px 0;">${escHtml(i.nombre)}${i.tono ? ` <span style="color:#c06;">(${escHtml(i.tono)})</span>` : ''}</td>
      <td style="text-align:center;padding:5px 0;">${i.cantidad}</td>
      <td style="text-align:right;padding:5px 0;">$${(i.precio * i.cantidad).toLocaleString('es-AR')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head>
    <title>Ticket - ${escHtml(p.nombreCliente || '')}</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,400&family=Lato:wght@300;400;700&display=swap" rel="stylesheet">
    <style>
      * { box-sizing:border-box; margin:0; padding:0; }
      body { font-family:'Lato',sans-serif; width:80mm; margin:0 auto; padding:14px 12px 18px; color:#222; font-size:11px; background:#fff; }
      .deco-line { height:2px; background:linear-gradient(90deg,transparent,#d4a0b0,#cc0066,#d4a0b0,transparent); border-radius:2px; margin-bottom:10px; }
      .deco-line-thin { height:1px; background:linear-gradient(90deg,transparent,#d4a0b0,transparent); margin:8px 0; }
      .header { text-align:center; padding-bottom:10px; }
      .brand-taby { font-family:'Playfair Display',serif; font-size:22px; font-weight:700; letter-spacing:4px; color:#111; text-transform:uppercase; display:block; line-height:1; }
      .brand-makeup { font-family:'Lato',sans-serif; font-size:8px; font-weight:300; letter-spacing:8px; text-transform:uppercase; color:#cc0066; display:block; margin-top:3px; }
      .deco-ornament { font-size:10px; color:#cc0066; letter-spacing:5px; margin:7px 0 4px; display:block; opacity:.65; }
      .ticket-date { font-size:8px; color:#888; letter-spacing:.5px; margin-top:5px; }
      .disclaimer { font-size:7px; color:#bbb; letter-spacing:.4px; margin-top:3px; }
      .section-label { font-size:7px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#cc0066; margin-bottom:4px; }
      .info-block { margin:10px 0; line-height:1.75; }
      table { width:100%; border-collapse:collapse; margin:6px 0; }
      th { font-size:8px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#999; padding:4px 0; border-bottom:1px solid #e0c0cc; }
      th:nth-child(2) { text-align:center; }
      th:last-child { text-align:right; }
      td { font-size:10px; padding:5px 0; border-bottom:1px dotted #eee; color:#333; vertical-align:top; }
      td:nth-child(2) { text-align:center; }
      td:last-child { text-align:right; white-space:nowrap; }
      .total-row { margin-top:10px; padding-top:8px; border-top:1.5px solid #cc0066; display:flex; justify-content:space-between; align-items:baseline; }
      .total-label { font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#999; }
      .total-amount { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:#cc0066; }
      .footer { text-align:center; margin-top:12px; padding-top:10px; }
      .footer-thanks { font-family:'Playfair Display',serif; font-size:12px; color:#cc0066; margin-bottom:5px; font-style:italic; }
      .footer-web { font-size:8px; letter-spacing:2px; color:#bbb; text-transform:uppercase; }
      @media print { @page { margin:0; size:80mm auto; } body { padding:10px 10px 14px; } }
    </style></head><body>
    <div class="deco-line"></div>
    <div class="header">
      <span class="brand-taby">Taby</span>
      <span class="brand-makeup">Makeup</span>
      <span class="deco-ornament">&mdash;&mdash;&mdash;&mdash;&mdash;</span>
      <div class="ticket-date">${fecha}</div>
      <div class="disclaimer">COMPROBANTE NO VALIDO COMO FACTURA</div>
    </div>
    <div class="deco-line-thin"></div>
    <div class="info-block">
      <div class="section-label">Cliente</div>
      ${escHtml(p.nombreCliente || '—')}<br>
      <strong>Tel:</strong> ${escHtml(p.contacto || '—')}<br>
      <strong>Pago:</strong> ${escHtml(p.medioPago || '—')}
      ${p.nota ? `<br><strong>Nota:</strong> <em>${escHtml(p.nota)}</em>` : ''}
    </div>
    <div class="deco-line-thin"></div>
    <div class="section-label" style="margin-top:8px;">Detalle del pedido</div>
    <table>
      <thead><tr>
        <th style="text-align:left;">Producto</th>
        <th>Cant</th>
        <th>Total</th>
      </tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="total-row">
      <span class="total-label">Total</span>
      <span class="total-amount">$${calcularTotal(p.items).toLocaleString('es-AR')}</span>
    </div>
    <div class="deco-line" style="margin-top:12px;margin-bottom:0;"></div>
    <div class="footer">
      <div class="footer-thanks">Gracias por tu compra</div>
      <div class="footer-web">tabymakeup.com.ar</div>
    </div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),500)}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=450,height=660');
  win.document.write(html);
  win.document.close();
}

// ── TICKET IMAGEN PNG ─────────────────────────────────────────────
let _previewDataURL = null;
let _previewNombre  = null;

document.getElementById('dm-img-btn').addEventListener('click', async () => {
  if (!pedidoActualId) return;
  await previsualizarTicketImagen(pedidoActualId);
});

async function previsualizarTicketImagen(id) {
  const p = todosLosPedidos.find(x => x.id === id);
  if (!p) return;

  if (!window.html2canvas) {
    await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  }

  const modal  = document.getElementById('ticket-preview-modal');
  const loader = document.getElementById('ticket-preview-loader');
  const img    = document.getElementById('ticket-preview-img');

  _previewDataURL = null;
  _previewNombre  = p.nombreCliente || 'pedido';
  loader.style.display = 'flex';
  img.style.display    = 'none';
  img.src              = '';
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const result = await generarCanvasTicket(p);
    _previewDataURL  = result;
    img.src          = result;
    img.style.display = 'block';
    loader.style.display = 'none';
  } catch (e) {
    cerrarPreviewTicket();
    mostrarToast('Error al generar imagen', 'exclamation-circle', 'text-red-400');
  }
}

async function generarCanvasTicket(p) {
  const fecha = toDate(p.fecha).toLocaleDateString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed','left:-9999px','top:0',
    'width:302px','background:#ffffff','color:#222',
    "font-family:'Lato',Helvetica,Arial,sans-serif",
    'font-size:11px','padding:14px 12px 18px',
    'box-sizing:border-box','z-index:-1'
  ].join(';');

  const itemsRows = (p.items || []).map(i => `
    <tr>
      <td style="font-size:10px;padding:5px 0;border-bottom:1px dotted #eee;vertical-align:top;">${escHtml(i.nombre)}${i.tono ? `<br><span style="font-size:9px;color:#cc0066;">${escHtml(i.tono)}</span>` : ''}</td>
      <td style="text-align:center;padding:5px 0;border-bottom:1px dotted #eee;">${i.cantidad}</td>
      <td style="text-align:right;padding:5px 0;border-bottom:1px dotted #eee;white-space:nowrap;">$${(i.precio * i.cantidad).toLocaleString('es-AR')}</td>
    </tr>`).join('');

  wrapper.innerHTML = `
    <div style="height:2px;background:linear-gradient(90deg,transparent,#d4a0b0,#cc0066,#d4a0b0,transparent);border-radius:2px;margin-bottom:10px;"></div>
    <div style="text-align:center;padding-bottom:10px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:5px;color:#111;text-transform:uppercase;line-height:1;font-family:Georgia,serif;">TABY</div>
      <div style="font-size:8px;font-weight:300;letter-spacing:9px;text-transform:uppercase;color:#cc0066;margin-top:2px;">MAKEUP</div>
      <div style="font-size:10px;color:#cc0066;letter-spacing:5px;margin:7px 0 4px;opacity:.65;">&mdash;&mdash;&mdash;&mdash;&mdash;</div>
      <div style="font-size:8px;color:#888;letter-spacing:.5px;margin-top:5px;">${fecha}</div>
      <div style="font-size:7px;color:#bbb;letter-spacing:.4px;margin-top:3px;">COMPROBANTE NO VALIDO COMO FACTURA</div>
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,#d4a0b0,transparent);margin:8px 0;"></div>
    <div style="margin:10px 0;line-height:1.75;">
      <div style="font-size:7px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#cc0066;margin-bottom:4px;">Cliente</div>
      ${escHtml(p.nombreCliente || '—')}<br>
      <strong>Tel:</strong> ${escHtml(p.contacto || '—')}<br>
      <strong>Pago:</strong> ${escHtml(p.medioPago || '—')}
      ${p.nota ? `<br><strong>Nota:</strong> <em>${escHtml(p.nota)}</em>` : ''}
    </div>
    <div style="height:1px;background:linear-gradient(90deg,transparent,#d4a0b0,transparent);margin:8px 0;"></div>
    <div style="font-size:7px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#cc0066;margin:8px 0 4px;">Detalle del pedido</div>
    <table style="width:100%;border-collapse:collapse;margin:4px 0;">
      <thead>
        <tr>
          <th style="text-align:left;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;padding:4px 0;border-bottom:1px solid #e0c0cc;">Producto</th>
          <th style="text-align:center;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;padding:4px 0;border-bottom:1px solid #e0c0cc;">Cant</th>
          <th style="text-align:right;font-size:8px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#999;padding:4px 0;border-bottom:1px solid #e0c0cc;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    <div style="margin-top:10px;padding-top:8px;border-top:1.5px solid #cc0066;display:flex;justify-content:space-between;align-items:baseline;">
      <span style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;">Total</span>
      <span style="font-size:18px;font-weight:900;color:#cc0066;font-family:Georgia,serif;">$${calcularTotal(p.items).toLocaleString('es-AR')}</span>
    </div>
    <div style="height:2px;background:linear-gradient(90deg,transparent,#d4a0b0,#cc0066,#d4a0b0,transparent);border-radius:2px;margin-top:12px;"></div>
    <div style="text-align:center;margin-top:12px;">
      <div style="font-size:12px;color:#cc0066;font-family:Georgia,serif;font-style:italic;margin-bottom:5px;">Gracias por tu compra</div>
      <div style="font-size:8px;letter-spacing:2px;color:#bbb;text-transform:uppercase;">tabymakeup.com.ar</div>
    </div>`;

  document.body.appendChild(wrapper);
  try {
    const canvas = await html2canvas(wrapper, {
      scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false
    });
    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(wrapper);
  }
}

function cerrarPreviewTicket() {
  document.getElementById('ticket-preview-modal').classList.add('hidden');
  document.body.style.overflow = '';
  _previewDataURL = null;
  _previewNombre  = null;
}
document.getElementById('close-ticket-preview').addEventListener('click', cerrarPreviewTicket);
document.getElementById('cancel-ticket-preview').addEventListener('click', cerrarPreviewTicket);
document.getElementById('ticket-preview-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('ticket-preview-modal')) cerrarPreviewTicket();
});

document.getElementById('download-ticket-btn').addEventListener('click', () => {
  if (!_previewDataURL) return;
  const link = document.createElement('a');
  link.download = `ticket-${(_previewNombre || 'pedido').replace(/\s+/g, '-')}.png`;
  link.href     = _previewDataURL;
  link.click();
  cerrarPreviewTicket();
  mostrarToast('Ticket descargado', 'download', 'text-green-400');
});

// ── ELIMINAR DESDE ARCHIVO ───────────────────────────────────────
function confirmarEliminarDesdeArchivo(id) {
  const deleteModal = document.getElementById('delete-modal');

  // Bajar el z-index del archivo-modal a 0 para que no tape al delete-modal.
  // backdrop-filter en cualquier elemento crea un stacking context propio en iOS/Safari
  // que impide que elementos externos (por más z-index que tengan) queden encima visualmente.
  archivoModal.style.zIndex = '0';
  archivoModal.style.pointerEvents = 'none';

  deleteModal.classList.remove('hidden');

  function restaurar() {
    archivoModal.style.zIndex = '';
    archivoModal.style.pointerEvents = '';
  }

  function cerrarConfirm() {
    deleteModal.classList.add('hidden');
    restaurar();
  }

  document.getElementById('cancel-delete').addEventListener('click', cerrarConfirm, { once: true });

  deleteModal.addEventListener('click', function onBd(e) {
    if (e.target === deleteModal) { cerrarConfirm(); deleteModal.removeEventListener('click', onBd); }
  });

  document.getElementById('confirm-delete').addEventListener('click', function onOk() {
    document.getElementById('confirm-delete').removeEventListener('click', onOk);
    restaurar();
    eliminarDesdeArchivo(id);
  }, { once: true });
}

async function eliminarDesdeArchivo(id) {
  const deleteModal   = document.getElementById('delete-modal');
  const confirmBtn    = document.getElementById('confirm-delete');
  const spinner       = document.getElementById('confirm-delete-spinner');
  const label         = document.getElementById('confirm-delete-label');
  if (confirmBtn) confirmBtn.disabled = true;
  if (spinner)    spinner.classList.remove('hidden');
  if (label)      label.textContent = 'Eliminando…';
  try {
    await deleteDoc(doc(db, 'pedidos', id));
    deleteModal.classList.add('hidden');
    actualizarArchivo(archivoSearch.value);
    mostrarToast('Pedido eliminado definitivamente', 'trash-alt', 'text-red-400');
  } catch (e) {
    console.error(e);
    deleteModal.classList.add('hidden');
    mostrarToast('Error al eliminar', 'exclamation-circle', 'text-red-400');
  } finally {
    if (confirmBtn) confirmBtn.disabled = false;
    if (spinner)    spinner.classList.add('hidden');
    if (label)      label.textContent = 'Sí, eliminar';
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────
const logoutModal   = document.getElementById('logout-modal');
const confirmLogout = document.getElementById('confirm-logout');
const cancelLogout  = document.getElementById('cancel-logout');

document.getElementById('logout-btn').addEventListener('click', () => logoutModal.classList.remove('hidden'));
cancelLogout.addEventListener('click', () => logoutModal.classList.add('hidden'));
logoutModal.addEventListener('click', e => { if (e.target === logoutModal) logoutModal.classList.add('hidden'); });
confirmLogout.addEventListener('click', () => {
  signOut(auth).then(() => { window.location.href = 'login.html'; });
});

// ── HELPERS ───────────────────────────────────────────────────────
function calcularTotal(items = []) {
  return items.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
}

function toDate(val) {
  if (!val) return new Date();
  if (val.toDate) return val.toDate();
  if (val.seconds) return new Date(val.seconds * 1000);
  return new Date(val);
}

function chipEstado(estado) {
  const map = {
    nuevo:      { bgChip:'bg-yellow-100', textChip:'text-yellow-700', icon:'fas fa-clock',        label:'Pendiente'  },
    pendiente:  { bgChip:'bg-yellow-100', textChip:'text-yellow-700', icon:'fas fa-clock',        label:'Pendiente'  },
    contactado: { bgChip:'bg-blue-100',   textChip:'text-blue-700',   icon:'fas fa-phone',        label:'Contactado' },
    cancelado:  { bgChip:'bg-red-100',    textChip:'text-red-600',    icon:'fas fa-times-circle', label:'Cancelado'  },
    completado: { bgChip:'bg-purple-100', textChip:'text-purple-700', icon:'fas fa-check-double', label:'Completado' },
    // legacy — por si hay pedidos viejos con estos estados en Firestore
    enviado:    { bgChip:'bg-green-100',  textChip:'text-green-700',  icon:'fas fa-check-circle', label:'Enviado'    },
  };
  return map[estado] || map.pendiente;
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extraerNumero(contacto) {
  const digits = contacto.replace(/\D/g, '');
  if (digits.length >= 8) return digits.startsWith('54') ? digits : `54${digits}`;
  return '';
}

function generarMsgWa(pedido) {
  let msg = `Hola ${pedido.nombreCliente || ''}! 👋\nTe escribo por tu pedido en TabyMakeup:\n\n`;
  (pedido.items || []).forEach((item, i) => {
    msg += `${i+1}. *${item.nombre}*${item.tono ? ` — ${item.tono}` : ''} x${item.cantidad} → $${(item.precio*item.cantidad).toLocaleString('es-AR')}\n`;
  });
  msg += `\n*Total: $${calcularTotal(pedido.items).toLocaleString('es-AR')}*\n`;
  msg += `Pago: ${pedido.medioPago || '—'}\n\n¿Cómo seguimos? 🎀`;
  return msg;
}

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer;
function mostrarToast(msg, icono = 'check-circle', iconColor = 'text-green-400', duracion = 3000) {
  const toast    = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  const toastIco = document.getElementById('toast-icon');

  toastMsg.textContent = msg;
  toastIco.className   = `fas fa-${icono} ${iconColor}`;

  clearTimeout(toastTimer);
  toast.style.opacity   = '0';
  toast.style.transform = 'translateX(-50%) translateY(8px)';

  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  toastTimer = setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(8px)';
  }, duracion);
}
