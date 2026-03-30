import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, collection, getDocs, doc, getDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';

// FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyD-P5-GOlwT-Ax51u3giJm1G-oXmfOf9-g",
    authDomain: "tabymakeup-of.firebaseapp.com",
    projectId: "tabymakeup-of",
    storageBucket: "tabymakeup-of.appspot.com",
    messagingSenderId: "548834143470",
    appId: "1:548834143470:web:54812e64324b3629f617ff"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ESTADO
let todosProductos = [];
let productosFiltradosActuales = []; // lista completa del filtro activo
let productosVisibles = 10;          // cuántos se muestran actualmente
const PRODUCTOS_POR_PAGINA = 10;
let carrito = JSON.parse(localStorage.getItem('carrito')) || [];
let productoEnModal = null;
let tonoSeleccionado = '';
let problemasStockActuales = []; // persiste la última validación de stock

// INICIALIZACIÓN
document.addEventListener('DOMContentLoaded', () => {
    // Mostrar loader de producto si viene con ?p= en la URL
    if (new URLSearchParams(window.location.search).get('p')) {
        document.getElementById('product-link-loader').classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // bloquear scroll mientras carga
    }

    mostrarSkeletons(8);
    cargarProductos();
    // Solo renderizar el conteo visual del carrito; no habilitar botón de envío aquí.
    // El botón se habilita solo después de que validarStockCarrito() confirme que todo está OK.
    renderizarContadorCarrito();
    configurarFiltros();
    setupScrollTop();
    setupNavLinks();
});

// ── SKELETON LOADER ──────────────────────────────────────────────
function mostrarSkeletons(cantidad = 8) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';
    for (let i = 0; i < cantidad; i++) {
        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-100 p-4';
        card.innerHTML = `
            <div class="skeleton aspect-square mb-6 rounded-lg w-full"></div>
            <div class="skeleton h-3 w-3/4 mx-auto mb-3 rounded"></div>
            <div class="skeleton h-5 w-1/2 mx-auto mb-6 rounded"></div>
            <div class="skeleton h-10 w-full rounded"></div>
        `;
        grid.appendChild(card);
    }
}

// ── CUSTOM TOAST ─────────────────────────────────────────────────
let toastTimer = null;

function mostrarToast(nombreProducto) {
    const toast = document.getElementById('custom-toast');
    const nombreEl = document.getElementById('toast-product-name');
    const progress = document.getElementById('toast-progress');

    nombreEl.textContent = nombreProducto;

    // Reset progress bar
    progress.classList.remove('animate');
    void progress.offsetWidth; // reflow para reiniciar animación

    // Mostrar
    toast.classList.add('show');
    progress.classList.add('animate');

    // Ocultar después de 2.5s con animación de bajada suave
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.classList.remove('show', 'hiding');
        }, 450);
    }, 2600);
}

// ── IMAGE LOADER (modal variantes) ───────────────────────────────
function setModalImage(src) {
    const img = document.getElementById('modal-img');
    const loader = document.getElementById('modal-img-loader');

    // Mostrar loader
    loader.classList.remove('hidden-loader');
    img.style.opacity = '0';

    const tmp = new Image();
    tmp.onload = () => {
        img.src = src;
        img.style.opacity = '1';
        loader.classList.add('hidden-loader');
    };
    tmp.onerror = () => {
        img.src = src;
        img.style.opacity = '1';
        loader.classList.add('hidden-loader');
    };
    tmp.src = src;
}

// ── FUNCIONES GLOBALES ────────────────────────────────────────────
window.toggleCart = () => {
    const drawer = document.getElementById('cart-drawer');
    const content = document.getElementById('drawer-content');
    if (drawer.classList.contains('hidden')) {
        drawer.classList.remove('hidden');
        setTimeout(() => content.classList.remove('translate-x-full'), 10);

        // Siempre bloquear el botón mientras se verifica Firebase
        bloquearCheckoutMientrasVerifica();

        validarStockCarrito()
            .then(problemas => {
                problemasStockActuales = problemas;
                actualizarInterfazCarrito(problemasStockActuales);
            })
            .catch(() => {
                // Si falla Firebase, mantener bloqueado y mostrar aviso
                mostrarAvisoErrorConexion();
            });
    } else {
        content.classList.add('translate-x-full');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    }
};

window.openProductModal = (producto, tonoInicial = '') => {
    if (!producto.disponible) return;

    productoEnModal = producto;
    tonoSeleccionado = '';
    document.getElementById('tono-warning').classList.add('hidden');

    // Imagen principal con loader
    setModalImage(producto.imagen || 'placeholder.jpg');

    document.getElementById('modal-title').textContent = producto.nombre;
    document.getElementById('modal-price').textContent = `$${producto.precio}`;
    document.getElementById('modal-cat').textContent = producto.categoria;
    document.getElementById('modal-desc').textContent = producto.descripcion || "Fórmula profesional para un acabado de alta gama.";

    const variantsCont = document.getElementById('modal-variants-container');
    const variantsGrid = document.getElementById('modal-variants-grid');

    if (producto.tonos && producto.tonos.length > 0) {
        variantsCont.classList.remove('hidden');
        variantsGrid.innerHTML = '';

        producto.tonos.forEach(tono => {
            const btn = document.createElement('button');
            btn.className = `border p-2 text-[9px] font-bold uppercase transition ${!tono.disponible ? 'opacity-30 cursor-not-allowed' : 'hover:border-black cursor-pointer'}`;
            btn.textContent = tono.nombre;

            if (tono.disponible) {
                btn.dataset.imagen = tono.imagen || '';
                btn.dataset.nombre = tono.nombre;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();

                    tonoSeleccionado = btn.dataset.nombre;
                    // Ocultar aviso de tono al seleccionar
                    document.getElementById('tono-warning').classList.add('hidden');

                    // Cambiar imagen con loader
                    const imagenTono = btn.dataset.imagen;
                    const src = imagenTono && imagenTono.trim() !== ''
                        ? imagenTono
                        : (productoEnModal.imagen || 'placeholder.jpg');
                    setModalImage(src);

                    // Resaltar seleccionado
                    variantsGrid.querySelectorAll('button').forEach(b => b.classList.remove('bg-black', 'text-white'));
                    btn.classList.add('bg-black', 'text-white');
                });

                // Auto-seleccionar si coincide con tonoInicial
                if (tonoInicial && tono.nombre.toLowerCase() === tonoInicial.toLowerCase()) {
                    setTimeout(() => btn.click(), 50);
                }
            }

            variantsGrid.appendChild(btn);
        });
    } else {
        variantsCont.classList.add('hidden');
    }

    document.getElementById('product-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeModal = () => {
    document.getElementById('product-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
};

window.zoomImage = () => {
    const src = document.getElementById('modal-img').src;
    document.getElementById('zoom-img').src = src;
    document.getElementById('zoom-modal').classList.remove('hidden');
};

window.closeZoom = () => {
    document.getElementById('zoom-modal').classList.add('hidden');
};

let _indexPendienteEliminar = null;

window.eliminarItem = (index, sinStock = false) => {
    // Si es producto sin stock, eliminar directamente sin confirmar
    if (sinStock) {
        _ejecutarEliminar(index);
        return;
    }
    // Mostrar modal de confirmación
    _indexPendienteEliminar = index;
    const item = carrito[index];
    document.getElementById('dcm-nombre').textContent = item.nombre + (item.tono ? ` (${item.tono})` : '');
    const modal = document.getElementById('delete-confirm-modal');
    modal.classList.add('show');
};

window.confirmarEliminar = () => {
    if (_indexPendienteEliminar === null) return;
    _ejecutarEliminar(_indexPendienteEliminar);
    window.cancelarEliminar();
};

window.cancelarEliminar = () => {
    _indexPendienteEliminar = null;
    document.getElementById('delete-confirm-modal').classList.remove('show');
};

function _ejecutarEliminar(index) {
    carrito.splice(index, 1);
    localStorage.setItem('carrito', JSON.stringify(carrito));
    problemasStockActuales = problemasStockActuales
        .filter(p => p.index !== index)
        .map(p => ({ ...p, index: p.index > index ? p.index - 1 : p.index }));
    actualizarInterfazCarrito(problemasStockActuales);
}

// ── VALIDACIÓN DE STOCK DEL CARRITO ──────────────────────────────
// Verifica contra Firebase el estado actual de cada ítem en el carrito.
// Retorna un array con los índices que tienen problemas de stock.
async function validarStockCarrito() {
    const problemas = []; // { index, item, tipo }

    for (let idx = 0; idx < carrito.length; idx++) {
        const item = carrito[idx];
        try {
            const docRef = doc(db, 'productos', item.id);
            const snap = await getDoc(docRef);

            if (!snap.exists()) {
                problemas.push({ index: idx, item, tipo: 'no_existe' });
                continue;
            }

            const prod = snap.data();

            // Producto completo sin stock
            if (!prod.disponible) {
                problemas.push({ index: idx, item, tipo: 'sin_stock' });
                continue;
            }

            // Variante/tono sin stock
            if (item.tono && prod.tonos && prod.tonos.length > 0) {
                const tonoActual = prod.tonos.find(t => t.nombre === item.tono);
                if (!tonoActual) {
                    problemas.push({ index: idx, item, tipo: 'tono_no_existe' });
                } else if (!tonoActual.disponible) {
                    problemas.push({ index: idx, item, tipo: 'tono_sin_stock' });
                }
            }
        } catch (e) {
            // Si falla la consulta puntual, lo marcamos como error para no enviar a ciegas
            problemas.push({ index: idx, item, tipo: 'error_consulta' });
        }
    }

    return problemas;
}

// ── LÓGICA INTERNA ────────────────────────────────────────────────
async function cargarProductos() {
    const grid = document.getElementById('productos-grid');
    try {
        const snapshot = await getDocs(collection(db, "productos"));
        todosProductos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        todosProductos = ordenarProductos(todosProductos);
        renderizarProductos(todosProductos);

        // ── Abrir producto desde URL ?p=ID&t=Tono ──────────────────────────
        const params = new URLSearchParams(window.location.search);
        const paramId   = params.get('p');
        const paramTono = params.get('t') || '';
        if (paramId) {
            const prod = todosProductos.find(p => p.id === paramId);
            if (prod && prod.disponible) {
                document.getElementById('productos-grid').scrollIntoView({ behavior: 'smooth' });
                setTimeout(() => {
                    window.openProductModal(prod, paramTono);
                    // Fade out del loader tras abrir el modal
                    const loader = document.getElementById('product-link-loader');
                    loader.classList.add('fade-out');
                    setTimeout(() => loader.classList.add('hidden'), 500);
                    document.body.style.overflow = '';
                }, 600);
            } else {
                // Producto no encontrado o sin stock: ocultar loader rápido
                const loader = document.getElementById('product-link-loader');
                loader.classList.add('fade-out');
                setTimeout(() => {
                    loader.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 400);
            }
            window.history.replaceState({}, '', window.location.pathname);
        }

    } catch (error) {
        grid.innerHTML = `<p class="col-span-full text-center py-20 text-gray-400">Error al cargar productos.</p>`;
    }
}

// ── ORDENAMIENTO ─────────────────────────────────────────────────
// Más recientes primero (por fechaSubida) → sin stock al final
function ordenarProductos(productos) {
    return [...productos].sort((a, b) => {
        const aStock = a.disponible ? 1 : 0;
        const bStock = b.disponible ? 1 : 0;

        // Sin stock siempre al fondo
        if (aStock !== bStock) return bStock - aStock;

        // Ordenar por fecha de carga descendente (más nuevo primero)
        const aFecha = a.fechaSubida ? new Date(a.fechaSubida).getTime() : 0;
        const bFecha = b.fechaSubida ? new Date(b.fechaSubida).getTime() : 0;
        return bFecha - aFecha;
    });
}

function renderizarProductos(productos) {
    const grid = document.getElementById('productos-grid');
    grid.innerHTML = '';

    if (productos.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center py-20 text-gray-300 text-xs uppercase tracking-widest font-bold">Sin resultados</p>`;
        document.getElementById('ver-mas-container').classList.add('hidden');
        return;
    }

    // Guardar lista filtrada y resetear paginación
    productosFiltradosActuales = productos;
    productosVisibles = PRODUCTOS_POR_PAGINA;

    _renderizarSlice(0, Math.min(PRODUCTOS_POR_PAGINA, productos.length));
    _actualizarBotonVerMas();
}

// Renderiza un subconjunto de productos (sin limpiar el grid)
function _renderizarSlice(desde, hasta) {
    const grid = document.getElementById('productos-grid');
    const slice = productosFiltradosActuales.slice(desde, hasta);

    slice.forEach(prod => {
        const sinStock = !prod.disponible;
        const esOferta = prod.categoria === 'ofertas' && !sinStock;
        const tienePrecioAnterior = prod.precioAnterior && Number(prod.precioAnterior) > Number(prod.precio);
        const prodJson = JSON.stringify(prod).replace(/'/g, "&apos;");
        const clickHandler = !sinStock ? `window.openProductModal(${prodJson})` : '';

        const badgeNuevo = prod.esNuevo && !sinStock
            ? '<span class="absolute top-3 left-3 bg-black text-white text-[7px] font-bold uppercase px-3 py-1 tracking-widest">Nuevo</span>'
            : '';
        const badgeOferta = esOferta
            ? '<span class="absolute top-3 right-3 bg-red-500 text-white text-[7px] font-bold uppercase px-3 py-1 tracking-widest">Oferta</span>'
            : '';
        const sinStockOverlay = sinStock
            ? '<div class="absolute inset-0 bg-white/20 backdrop-blur-[1px] flex items-center justify-center"><span class="bg-white text-black text-[9px] font-black uppercase px-4 py-2 border border-black tracking-[0.2em]">Sin stock</span></div>'
            : '';
        const precioHtml = tienePrecioAnterior
            ? `<div class="mb-3 sm:mb-6"><span class="text-[10px] text-gray-400 line-through tracking-tight">$${prod.precioAnterior}</span><p class="text-lg font-light tracking-tighter italic ${esOferta ? 'text-red-500' : 'text-gray-800'} leading-tight">$${prod.precio}</p></div>`
            : `<p class="text-lg font-light mb-3 sm:mb-6 tracking-tighter italic text-gray-800">$${prod.precio}</p>`;

        const card = document.createElement('div');
        card.className = `group bg-white border border-gray-100 p-3 sm:p-4 transition-all hover:shadow-2xl relative ${sinStock ? 'grayscale opacity-60' : ''}`;
        card.innerHTML = `
            <div class="relative aspect-square mb-3 sm:mb-6 overflow-hidden bg-gray-50 rounded-lg ${!sinStock ? 'cursor-pointer' : 'cursor-not-allowed'}" onclick='${clickHandler}'>
                <img src="${prod.imagen || 'placeholder.jpg'}" alt="${prod.nombre}" class="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition duration-700">
                ${badgeNuevo}
                ${badgeOferta}
                ${sinStockOverlay}
            </div>
            <div class="text-center">
                <h3 class="text-[10px] font-bold uppercase tracking-widest mb-2 product-name-mobile px-1">${prod.nombre}</h3>
                ${precioHtml}
                <button ${sinStock ? 'disabled' : ''} onclick='${clickHandler}'
                        class="w-full border border-black text-[9px] font-black uppercase py-4 tracking-widest hover:bg-black hover:text-white transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-black">
                    ${sinStock ? 'Sin Stock' : 'Ver Detalles'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function _actualizarBotonVerMas() {
    const container = document.getElementById('ver-mas-container');
    const info = document.getElementById('ver-mas-info');
    const total = productosFiltradosActuales.length;

    if (productosVisibles >= total) {
        container.classList.add('hidden');
    } else {
        container.classList.remove('hidden');
        const restantes = total - productosVisibles;
        info.textContent = `Mostrando ${productosVisibles} de ${total} productos`;
    }
}

window.verMasProductos = () => {
    const desde = productosVisibles;
    productosVisibles = Math.min(productosVisibles + PRODUCTOS_POR_PAGINA, productosFiltradosActuales.length);
    _renderizarSlice(desde, productosVisibles);
    _actualizarBotonVerMas();
};

function filtrarProductos() {
    const b = document.getElementById('searchInput').value.toLowerCase();
    const c = document.getElementById('categoriaFiltro').value;
    const s = document.getElementById('disponibilidadFiltro').value;

    const filtrados = todosProductos.filter(p => {
        const matchBusqueda = p.nombre.toLowerCase().includes(b);
        const matchCat  = (c === 'all' || p.categoria === c || (c !== 'ofertas' && p.categoria === 'ofertas'));
        const matchStock = (s === 'all' || (s === 'available' ? p.disponible : !p.disponible));
        return matchBusqueda && matchCat && matchStock;
    });
    renderizarProductos(ordenarProductos(filtrados));
}

function configurarFiltros() {
    document.getElementById('searchInput').oninput = filtrarProductos;
    document.getElementById('categoriaFiltro').onchange = filtrarProductos;
    document.getElementById('disponibilidadFiltro').onchange = filtrarProductos;

    // ── Construir pills de categorías ────────────────────────────
    const pills = document.getElementById('categoria-pills');
    const opciones = [
        { val: 'all',            label: 'Todos' },
        { val: 'ofertas',        label: '🏷️ Ofertas' },
        { val: 'iluminadores',   label: 'Iluminadores y contornos' },
        { val: 'combos',           label: 'Combos' },
        { val: 'base',           label: 'Base' },
        { val: 'brochas',        label: 'Brochas' },
        { val: 'delineadores',   label: 'Delineadores' },
        { val: 'fijador',        label: 'Fijador' },
        { val: 'mascara',        label: 'Máscara de pestañas' },
        { val: 'polvos',         label: 'Polvos' },
        { val: 'rubor',          label: 'Rubor' },
        { val: 'sombras',        label: 'Sombras' },
        { val: 'arqueadores',    label: 'Arqueadores' },
        { val: 'brillos',        label: 'Brillos/Glitter' },
        { val: 'correctores',    label: 'Correctores' },
        { val: 'esponjitas',     label: 'Esponjitas' },
        { val: 'labiales',       label: 'Labiales' },
        { val: 'pestanas-cejas', label: 'Pestañas/Cejas' },
        { val: 'primer',         label: 'Primer' },
        { val: 'skincare',       label: 'Skincare' },
        { val: 'skalas',         label: 'Skalas' },
        { val: 'varios',         label: 'Varios' },
    ];

    opciones.forEach(({ val, label }) => {
        const btn = document.createElement('button');
        btn.className = 'cat-pill' + (val === 'all' ? ' active' : '');
        btn.textContent = label;
        btn.dataset.val = val;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('categoriaFiltro').value = val;
            filtrarProductos();
        });
        pills.appendChild(btn);
    });
}

function setupNavLinks() {
    // Nav del header eliminado — las categorías se manejan desde las pills
}

document.getElementById('modal-add-btn').onclick = () => {
    const warning = document.getElementById('tono-warning');
    if (productoEnModal.tonos && productoEnModal.tonos.length > 0 && !tonoSeleccionado) {
        // Mostrar aviso inline y sacudida sutil
        warning.classList.remove('hidden');
        warning.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(0)' }
        ], { duration: 300, easing: 'ease-out' });
        return;
    }
    warning.classList.add('hidden');

    const item = {
        ...productoEnModal,
        tono: tonoSeleccionado,
        cantidad: 1,
        imagenCarrito: document.getElementById('modal-img').src
    };

    const index = carrito.findIndex(i => i.id === item.id && i.tono === item.tono);
    if (index > -1) carrito[index].cantidad++;
    else carrito.push(item);

    localStorage.setItem('carrito', JSON.stringify(carrito));
    actualizarInterfazCarrito(problemasStockActuales);
    window.closeModal();

    // Toast personalizado (reemplaza SweetAlert2 toast)
    mostrarToast(productoEnModal.nombre);
};

// ── CONTADOR DE CARRITO (solo badge, sin validar stock) ──────────
function renderizarContadorCarrito() {
    let cant = 0;
    carrito.forEach(item => { cant += item.cantidad; });
    document.getElementById('cart-count').textContent = cant;
}

// ── HELPERS DE CHECKOUT ──────────────────────────────────────────
function bloquearCheckoutMientrasVerifica() {
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.classList.add('opacity-40', 'cursor-not-allowed');
    btn.classList.remove('hover:bg-holographic', 'hover:text-black');
    btn.dataset.verificando = '1';

    // Mostrar indicador de verificación en el carrito
    const cont = document.getElementById('cart-items');
    let banner = document.getElementById('cart-stock-warning');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'cart-stock-warning';
        cont.parentElement.insertBefore(banner, cont);
    }
    banner.className = 'mx-6 mt-4 mb-0 flex flex-col items-center justify-center gap-2 bg-gray-50 border border-gray-100 px-4 py-5 rounded text-center';
    banner.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin text-gray-400 text-lg"></i>
        <p class="text-[9px] font-black uppercase tracking-[0.25em] text-gray-400">Verificando stock...</p>`;
}

function mostrarAvisoErrorConexion() {
    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.classList.add('opacity-40', 'cursor-not-allowed');
    const banner = document.getElementById('cart-stock-warning');
    if (banner) {
        banner.className = 'mx-6 mt-4 mb-0 flex items-start gap-3 bg-yellow-50 border border-yellow-300 px-4 py-3 rounded';
        banner.innerHTML = `
            <i class="fa-solid fa-wifi text-yellow-500 mt-0.5 flex-shrink-0"></i>
            <p class="text-[9px] font-bold uppercase tracking-wide text-yellow-700 leading-relaxed">
                No se pudo verificar el stock.<br>Intentá de nuevo o contactanos por WhatsApp.
            </p>`;
    }
}

function actualizarInterfazCarrito(problemasStock = []) {
    const cont  = document.getElementById('cart-items');
    const total = document.getElementById('cart-total');
    const count = document.getElementById('cart-count');
    cont.innerHTML = '';
    let suma = 0, cant = 0;

    // Mapa rápido de índice → problema
    const mapaProblemas = {};
    problemasStock.forEach(p => { mapaProblemas[p.index] = p; });

    carrito.forEach((item, idx) => {
        suma += item.precio * item.cantidad;
        cant += item.cantidad;

        const problema = mapaProblemas[idx];
        const tieneProblema = !!problema;

        let msgProblema = '';
        if (problema) {
            if (problema.tipo === 'sin_stock' || problema.tipo === 'no_existe') {
                msgProblema = 'Sin stock — eliminalo para continuar';
            } else if (problema.tipo === 'tono_sin_stock' || problema.tipo === 'tono_no_existe') {
                msgProblema = `Tono "${item.tono}" sin stock — eliminalo para continuar`;
            } else {
                msgProblema = 'No se pudo verificar — intentá de nuevo';
            }
        }

        const div = document.createElement('div');
        div.className = `flex gap-4 border-b pb-4 ${tieneProblema ? 'border-red-200' : 'border-gray-100'}`;
        div.innerHTML = `
            <div class="relative flex-shrink-0">
                <img src="${item.imagenCarrito || item.imagen}" class="w-16 h-16 object-contain bg-gray-50 rounded ${tieneProblema ? 'grayscale opacity-50' : ''}">
                ${tieneProblema ? `<div class="absolute inset-0 flex items-center justify-center">
                    <i class="fa-solid fa-triangle-exclamation text-red-500 text-lg drop-shadow"></i>
                </div>` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="text-[10px] font-black uppercase tracking-widest truncate">${item.nombre}</h4>
                <p class="text-[9px] text-gray-400 uppercase">${item.tono || 'Único'}</p>
                ${tieneProblema ? `
                <div class="flex items-start gap-1 mt-1 bg-red-50 border border-red-200 px-2 py-1 rounded">
                    <span class="text-[8px] font-bold uppercase text-red-600 leading-tight">${msgProblema}</span>
                </div>` : ''}
                <div class="flex justify-between items-center mt-2">
                    <span class="text-xs ${tieneProblema ? 'line-through text-gray-300' : ''}">$${item.precio} x ${item.cantidad}</span>
                    <button onclick="window.eliminarItem(${idx}, ${tieneProblema})" class="${tieneProblema ? 'text-red-400 hover:text-red-600' : 'text-gray-300 hover:text-red-500'} transition">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>
            </div>`;
        cont.appendChild(div);
    });

    total.textContent = `$${suma.toFixed(2)}`;
    count.textContent = cant;

    // Banner de advertencia
    let banner = document.getElementById('cart-stock-warning');
    if (problemasStock.length > 0) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'cart-stock-warning';
            cont.parentElement.insertBefore(banner, cont);
        }
        banner.className = 'mx-6 mt-4 mb-0 flex items-start gap-3 bg-red-50 border border-red-200 px-4 py-3 rounded';
        banner.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation text-red-500 mt-0.5 flex-shrink-0"></i>
            <p class="text-[9px] font-bold uppercase tracking-wide text-red-700 leading-relaxed">
                ${problemasStock.length === 1
                    ? 'Un producto ya no está disponible.'
                    : `${problemasStock.length} productos ya no están disponibles.`}
                <br>Eliminá los marcados para poder enviar tu pedido.
            </p>`;
    } else if (banner) {
        banner.remove();
    }

    // Botón de checkout: solo habilitar si no hay problemas
    const checkoutBtn = document.getElementById('checkout-btn');
    if (problemasStock.length > 0) {
        checkoutBtn.disabled = true;
        checkoutBtn.classList.add('opacity-40', 'cursor-not-allowed');
        checkoutBtn.classList.remove('hover:bg-holographic', 'hover:text-black');
    } else {
        checkoutBtn.disabled = false;
        checkoutBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        checkoutBtn.classList.add('hover:bg-holographic', 'hover:text-black');
    }
}

function setupScrollTop() {
    const btn = document.getElementById('scrollTopBtn');
    // En mobile lo posicionamos más abajo para no tapar cards
    const isMobile = () => window.innerWidth < 640;
    const updatePos = () => {
        btn.style.bottom = isMobile() ? '16px' : '24px';
        btn.style.right  = isMobile() ? '12px' : '24px';
        btn.style.width  = isMobile() ? '36px' : '44px';
        btn.style.height = isMobile() ? '36px' : '44px';
    };
    updatePos();
    window.addEventListener('resize', updatePos, { passive: true });
    window.onscroll = () => {
        if (window.scrollY > 500) btn.classList.replace('hidden', 'flex');
        else btn.classList.replace('flex', 'hidden');
    };
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ══════════════════════════════════════════════════════════════════
// CHECKOUT — MODAL DE DATOS + GUARDAR EN FIRESTORE
// ══════════════════════════════════════════════════════════════════

let _medioPagoSeleccionado = '';

// ── Abrir checkout modal ──────────────────────────────────────────
document.getElementById('checkout-btn').onclick = async () => {
    if (carrito.length === 0) return;

    const btn        = document.getElementById('checkout-btn');
    const btnText    = document.getElementById('checkout-btn-text');
    const btnSpinner = document.getElementById('checkout-btn-spinner');

    // Verificación de stock antes de abrir el formulario
    btn.disabled = true;
    btnText.textContent = 'Verificando...';
    btnSpinner.classList.remove('hidden');

    try {
        const problemas = await validarStockCarrito();
        problemasStockActuales = problemas;

        btn.disabled = false;
        btnText.textContent = 'Finalizar pedido';
        btnSpinner.classList.add('hidden');

        if (problemas.length > 0) {
            actualizarInterfazCarrito(problemasStockActuales);
            return;
        }

        _abrirCheckoutModal();

    } catch (e) {
        btn.disabled = false;
        btnText.textContent = 'Finalizar pedido';
        btnSpinner.classList.add('hidden');
        mostrarAvisoErrorConexion();
    }
};

function _abrirCheckoutModal() {
    _medioPagoSeleccionado = '';

    // Reset campos
    document.getElementById('co-nombre').value   = '';
    document.getElementById('co-contacto').value = '';
    document.getElementById('co-nota').value     = '';
    ['co-nombre-err', 'co-contacto-err', 'co-pago-err', 'co-general-err'].forEach(id =>
        document.getElementById(id).classList.add('hidden')
    );
    document.querySelectorAll('.pago-btn').forEach(b => b.classList.remove('selected'));

    // Resumen mini del carrito
    const resumenEl = document.getElementById('checkout-resumen');
    resumenEl.innerHTML = '';
    let totalResumen = 0;
    carrito.forEach(item => {
        totalResumen += item.precio * item.cantidad;
        const row = document.createElement('div');
        row.className = 'flex justify-between items-center py-1.5 text-xs';
        row.innerHTML = `
            <span class="text-gray-700 font-semibold truncate mr-3">${item.nombre}${item.tono ? ` <span class="text-gray-400 font-normal">(${item.tono})</span>` : ''} × ${item.cantidad}</span>
            <span class="font-black text-gray-800 flex-shrink-0">$${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>`;
        resumenEl.appendChild(row);
    });
    const totalRow = document.createElement('div');
    totalRow.className = 'flex justify-between items-center pt-2.5 mt-1 border-t border-gray-200';
    totalRow.innerHTML = `
        <span class="text-[9px] font-black uppercase tracking-widest text-gray-400">Total</span>
        <span class="text-sm font-black text-black">$${totalResumen.toLocaleString('es-AR')}</span>`;
    resumenEl.appendChild(totalRow);

    // Mostrar modal
    const modal = document.getElementById('checkout-modal');
    const panel = document.getElementById('checkout-panel');
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.add('visible'));
    });
}

function _cerrarCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    const panel = document.getElementById('checkout-panel');
    panel.classList.remove('visible');
    setTimeout(() => {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }, 350);
}

// ── Selección medio de pago ───────────────────────────────────────
document.querySelectorAll('.pago-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.pago-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        _medioPagoSeleccionado = btn.dataset.pago;
        document.getElementById('co-pago-err').classList.add('hidden');
    });
});

// ── Cerrar modal ──────────────────────────────────────────────────
document.getElementById('checkout-modal-close').addEventListener('click', _cerrarCheckoutModal);
document.getElementById('checkout-backdrop').addEventListener('click', _cerrarCheckoutModal);

// ── Enviar pedido a Firestore ─────────────────────────────────────
document.getElementById('co-submit-btn').addEventListener('click', async () => {
    const nombre   = document.getElementById('co-nombre').value.trim();
    const contacto = document.getElementById('co-contacto').value.trim();
    const nota     = document.getElementById('co-nota').value.trim();

    // Validación
    let valido = true;
    if (!nombre) {
        document.getElementById('co-nombre-err').classList.remove('hidden');
        valido = false;
    } else {
        document.getElementById('co-nombre-err').classList.add('hidden');
    }
    if (!contacto) {
        document.getElementById('co-contacto-err').classList.remove('hidden');
        valido = false;
    } else {
        document.getElementById('co-contacto-err').classList.add('hidden');
    }
    if (!_medioPagoSeleccionado) {
        document.getElementById('co-pago-err').classList.remove('hidden');
        valido = false;
    } else {
        document.getElementById('co-pago-err').classList.add('hidden');
    }
    if (!valido) return;

    // Loading
    const submitBtn  = document.getElementById('co-submit-btn');
    const submitText = document.getElementById('co-submit-text');
    const spinner    = document.getElementById('co-spinner');
    submitBtn.disabled     = true;
    submitText.textContent = 'Enviando…';
    spinner.classList.remove('hidden');

    try {
        const itemsParaGuardar = carrito.map(item => ({
            id:            item.id,
            nombre:        item.nombre,
            precio:        item.precio,
            cantidad:      item.cantidad,
            tono:          item.tono          || null,
            imagen:        item.imagen        || null,
            imagenCarrito: item.imagenCarrito || item.imagen || null,
        }));

        await addDoc(collection(db, 'pedidos'), {
            nombreCliente: nombre,
            contacto:      contacto,
            medioPago:     _medioPagoSeleccionado,
            nota:          nota || null,
            items:         itemsParaGuardar,
            total:         carrito.reduce((s, i) => s + i.precio * i.cantidad, 0),
            estado:        'nuevo',
            fecha:         serverTimestamp(),
        });

        // Limpiar carrito
        carrito = [];
        localStorage.removeItem('carrito');
        problemasStockActuales = [];
        actualizarInterfazCarrito([]);

        // Cerrar drawer
        const drawerContent = document.getElementById('drawer-content');
        drawerContent.classList.add('translate-x-full');
        setTimeout(() => document.getElementById('cart-drawer').classList.add('hidden'), 300);

        // Cerrar checkout y mostrar éxito
        _cerrarCheckoutModal();
        setTimeout(_mostrarExito, 380);

    } catch (err) {
        console.error('Error al guardar pedido:', err);
        submitBtn.disabled     = false;
        submitText.textContent = 'Enviar pedido';
        spinner.classList.add('hidden');
        const errEl = document.getElementById('co-general-err');
        errEl.textContent = 'No se pudo enviar el pedido. Intentá de nuevo.';
        errEl.classList.remove('hidden');
    }
});

// ── Modal éxito ───────────────────────────────────────────────────
function _mostrarExito() {
    document.getElementById('checkout-success-modal').classList.add('open');
}

document.getElementById('checkout-success-close').addEventListener('click', () => {
    document.getElementById('checkout-success-modal').classList.remove('open');
    document.body.style.overflow = '';
});