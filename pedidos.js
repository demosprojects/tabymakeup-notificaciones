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
const filterEstado = document.getElementById('filter-estado');
const filterPago   = document.getElementById('filter-pago');
const filterOrden  = document.getElementById('filter-orden');
const totalBadge   = document.getElementById('total-badge');

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
    // Reconectar en 5s
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

  // Notificación nativa del navegador
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
  const cant = todosLosPedidos.filter(p => (p.estado || 'nuevo') === 'nuevo').length;
  document.title = cant > 0 ? `(${cant}) TabyMakeup | Pedidos` : 'TabyMakeup | Pedidos';
}

// ── FILTROS ───────────────────────────────────────────────────────
function aplicarFiltrosYRenderizar() {
  const texto  = searchInput.value.trim().toLowerCase();
  const estado = filterEstado.value;
  const pago   = filterPago.value;
  const orden  = filterOrden.value;

  let lista = [...todosLosPedidos];

  if (texto) {
    lista = lista.filter(p =>
      p.nombreCliente?.toLowerCase().includes(texto) ||
      p.contacto?.toLowerCase().includes(texto)
    );
  }
  if (estado !== 'all') lista = lista.filter(p => (p.estado || 'nuevo') === estado);
  if (pago !== 'all')   lista = lista.filter(p => p.medioPago?.toLowerCase().includes(pago));

  lista.sort((a, b) => {
    const fa = a.fecha?.seconds || 0;
    const fb = b.fecha?.seconds || 0;
    return orden === 'desc' ? fb - fa : fa - fb;
  });

  renderizarLista(lista);
  totalBadge.textContent = lista.length;
}

[searchInput, filterEstado, filterPago, filterOrden].forEach(el => {
  el.addEventListener('input', aplicarFiltrosYRenderizar);
  el.addEventListener('change', aplicarFiltrosYRenderizar);
});

// ── STATS ─────────────────────────────────────────────────────────
function actualizarStats() {
  const total    = todosLosPedidos.length;
  const nuevos   = todosLosPedidos.filter(p => (p.estado || 'nuevo') === 'nuevo').length;
  const enviados = todosLosPedidos.filter(p => p.estado === 'enviado').length;
  const dinero   = todosLosPedidos
    .filter(p => p.estado !== 'cancelado')
    .reduce((sum, p) => sum + calcularTotal(p.items), 0);

  statTotal.textContent    = total;
  statNuevos.textContent   = nuevos;
  statEnviados.textContent = enviados;
  statDinero.textContent   = `$${dinero.toLocaleString('es-AR')}`;
}

// ── RENDER LISTA ──────────────────────────────────────────────────
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

// ── CARD ──────────────────────────────────────────────────────────
function crearCard(pedido) {
  const estado      = pedido.estado || 'nuevo';
  const fecha       = toDate(pedido.fecha);
  const fechaStr    = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
  const horaStr     = fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const totalPedido = calcularTotal(pedido.items);
  const esNuevo     = estado === 'nuevo';
  const chip        = chipEstado(estado);

  const card = document.createElement('div');
  card.className = `order-card bg-white/90 border ${esNuevo ? 'border-yellow-300 shadow-yellow-100' : 'border-pink-100'} rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition cursor-pointer`;
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
            ${esNuevo ? '<span class="badge-new bg-yellow-400 text-yellow-900 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">Nuevo</span>' : ''}
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
          <i class="${chip.icon}"></i> ${capitalizar(estado)}
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
  const estado      = pedido.estado || 'nuevo';
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

  // Botones de estado
  const estados = ['nuevo', 'contactado', 'enviado', 'cancelado'];
  dmEstadoBtns.innerHTML = '';
  estados.forEach(e => {
    const chip  = chipEstado(e);
    const activo = e === estado;
    const btn  = document.createElement('button');
    btn.className = `chip ${activo ? chip.bgChip + ' ' + chip.textChip + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} transition cursor-pointer`;
    btn.innerHTML = `<i class="${chip.icon}"></i> ${capitalizar(e)}`;
    if (!activo) btn.addEventListener('click', () => cambiarEstado(id, e));
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
async function cambiarEstado(id, nuevoEstado) {
  try {
    await updateDoc(doc(db, 'pedidos', id), { estado: nuevoEstado });
    mostrarToast(`Estado: ${capitalizar(nuevoEstado)}`, 'check-circle', 'text-green-400');
    cerrarDetalle();
    setTimeout(() => abrirDetalle(id), 200);
  } catch (e) {
    console.error(e);
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
  try {
    await deleteDoc(doc(db, 'pedidos', pedidoActualId));
    deleteModal.classList.add('hidden');
    cerrarDetalle();
    mostrarToast('Pedido eliminado', 'trash-alt', 'text-red-400');
  } catch (e) {
    console.error(e);
    mostrarToast('Error al eliminar', 'exclamation-circle', 'text-red-400');
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
      <td style="font-size:10px;padding:4px 0;">${escHtml(i.nombre)}${i.tono ? ` (${escHtml(i.tono)})` : ''}</td>
      <td style="text-align:right;padding:4px 0;">${i.cantidad}</td>
      <td style="text-align:right;padding:4px 0;">$${(i.precio * i.cantidad).toLocaleString('es-AR')}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head>
    <title>Ticket - ${escHtml(p.nombreCliente || '')}</title>
    <style>
      body { font-family:'Courier New',monospace; width:80mm; margin:0 auto; padding:10px; color:#000; font-size:12px; }
      .header { text-align:center; border-bottom:1px dashed #000; padding-bottom:10px; margin-bottom:10px; }
      .logo { font-size:18px; font-weight:bold; text-transform:uppercase; letter-spacing:2px; }
      .info { margin-bottom:10px; line-height:1.6; }
      table { width:100%; border-collapse:collapse; margin-bottom:10px; }
      th { text-align:left; border-bottom:1px solid #000; font-size:10px; padding-bottom:3px; }
      .total-row { border-top:1px dashed #000; padding-top:5px; text-align:right; font-size:14px; font-weight:bold; margin-top:4px; }
      .footer { text-align:center; margin-top:16px; font-size:10px; border-top:1px solid #000; padding-top:10px; }
      @media print { @page { margin:0; } }
    </style></head><body>
    <div class="header">
      <div class="logo">TabyMakeup</div>
      <div style="font-size:9px;margin-top:4px;">${fecha}</div>
      <div style="font-size:8px;margin-top:3px;letter-spacing:.5px;">COMPROBANTE NO VÁLIDO COMO FACTURA</div>
    </div>
    <div class="info">
      <strong>CLIENTE:</strong> ${escHtml(p.nombreCliente || '')}<br>
      <strong>CONTACTO:</strong> ${escHtml(p.contacto || '')}<br>
      <strong>PAGO:</strong> ${escHtml(p.medioPago || '')}
      ${p.nota ? `<br><strong>NOTA:</strong> ${escHtml(p.nota)}` : ''}
    </div>
    <table>
      <thead><tr>
        <th>DESCRIPCIÓN</th>
        <th style="text-align:right">CANT</th>
        <th style="text-align:right">TOTAL</th>
      </tr></thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    <div class="total-row">TOTAL: $${calcularTotal(p.items).toLocaleString('es-AR')}</div>
    <div class="footer">¡Gracias por tu compra! 🎀<br>tabymakeup.com.ar</div>
    <script>window.onload=function(){window.print();setTimeout(()=>window.close(),500)}<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=450,height=600');
  win.document.write(html);
  win.document.close();
}

// ── TICKET IMAGEN PNG ─────────────────────────────────────────────
// Variables para el preview
let _previewDataURL = null;
let _previewNombre  = null;

document.getElementById('dm-img-btn').addEventListener('click', async () => {
  if (!pedidoActualId) return;
  await previsualizarTicketImagen(pedidoActualId);
});

async function previsualizarTicketImagen(id) {
  const p = todosLosPedidos.find(x => x.id === id);
  if (!p) return;

  // Cargar html2canvas si no está
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
    'width:302px','background:#ffffff','color:#000',
    "font-family:'Courier New',Courier,monospace",
    'font-size:12px','padding:16px 12px',
    'box-sizing:border-box','z-index:-1'
  ].join(';');

  wrapper.innerHTML = `
    <div style="text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px;">
      <div style="font-size:20px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">TabyMakeup</div>
      <div style="font-size:9px;margin-top:4px;">${fecha}</div>
      <div style="font-size:8px;margin-top:3px;letter-spacing:.5px;">COMPROBANTE NO VÁLIDO COMO FACTURA</div>
    </div>
    <div style="margin-bottom:10px;line-height:1.6;">
      <strong>CLIENTE:</strong> ${escHtml(p.nombreCliente || '')}<br>
      <strong>CONTACTO:</strong> ${escHtml(p.contacto || '')}<br>
      <strong>PAGO:</strong> ${escHtml(p.medioPago || '')}
      ${p.nota ? `<br><strong>NOTA:</strong> ${escHtml(p.nota)}` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr>
          <th style="text-align:left;border-bottom:1px solid #000;font-size:10px;padding-bottom:3px;">DESCRIPCIÓN</th>
          <th style="text-align:right;border-bottom:1px solid #000;font-size:10px;padding-bottom:3px;">CANT</th>
          <th style="text-align:right;border-bottom:1px solid #000;font-size:10px;padding-bottom:3px;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${(p.items || []).map(i => `
          <tr>
            <td style="font-size:10px;padding:4px 0;">${escHtml(i.nombre)}${i.tono ? ` (${escHtml(i.tono)})` : ''}</td>
            <td style="text-align:right;padding:4px 0;">${i.cantidad}</td>
            <td style="text-align:right;padding:4px 0;">$${(i.precio * i.cantidad).toLocaleString('es-AR')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;text-align:right;font-size:14px;font-weight:bold;">
      TOTAL: $${calcularTotal(p.items).toLocaleString('es-AR')}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:10px;border-top:1px solid #000;padding-top:10px;">
      ¡Gracias por tu compra! 🎀<br>tabymakeup.com.ar
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

// Cerrar preview
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

// Descargar PNG
document.getElementById('download-ticket-btn').addEventListener('click', () => {
  if (!_previewDataURL) return;
  const link = document.createElement('a');
  link.download = `ticket-${(_previewNombre || 'pedido').replace(/\s+/g, '-')}.png`;
  link.href     = _previewDataURL;
  link.click();
  cerrarPreviewTicket();
  mostrarToast('Ticket descargado', 'download', 'text-green-400');
});

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
    nuevo:      { bgChip:'bg-yellow-100', textChip:'text-yellow-700', icon:'fas fa-star'         },
    contactado: { bgChip:'bg-blue-100',   textChip:'text-blue-700',   icon:'fas fa-phone'        },
    enviado:    { bgChip:'bg-green-100',  textChip:'text-green-700',  icon:'fas fa-check-circle' },
    cancelado:  { bgChip:'bg-red-100',    textChip:'text-red-600',    icon:'fas fa-times-circle' },
  };
  return map[estado] || map.nuevo;
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