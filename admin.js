import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

document.addEventListener('DOMContentLoaded', function() {
  // Limpieza inicial
  sessionStorage.removeItem('firebase:authUser');
  localStorage.removeItem('firebase:authUser');
  
  // Verificar si viene de login exitoso
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('login_success') === '1') {
    // Mostrar mensaje de bienvenida
    console.log('Login exitoso detectado');
  }

  // Configuración de Firebase
  const firebaseConfig = {
    apiKey: "AIzaSyD-P5-GOlwT-Ax51u3giJm1G-oXmfOf9-g",
    authDomain: "tabymakeup-of.firebaseapp.com",
    projectId: "tabymakeup-of",
    storageBucket: "tabymakeup-of.appspot.com",
    messagingSenderId: "548834143470",
    appId: "1:548834143470:web:54812e64324b3629f617ff"
  };

  // Inicializar Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  // Control de inactividad
  let inactivityTimer;
  
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      signOut(auth).then(() => {
        window.location.href = `login.html?timeout=1&t=${Date.now()}`;
      });
    }, 600000); // 10 minutos
  }

  ['mousedown', 'mousemove', 'keypress', 'scroll', 'click', 'touchstart', 'keydown', 'focus', 'blur'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer);
  });

  // Inicializar timer de inactividad al cargar la página
  resetInactivityTimer();

  // Verificación de autenticación
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      localStorage.removeItem('firebase:authUser');
      sessionStorage.removeItem('firebase:authUser');
      // Agregar un pequeño delay para evitar redirecciones inmediatas
      setTimeout(() => {
        window.location.href = `login.html?session_expired=1&t=${Date.now()}`;
      }, 100);
    }
  });

  // Referencias DOM
  const formProducto = document.getElementById('form-producto');
  const cuerpoProductos = document.getElementById('cuerpo-productos');
  const formTitle = document.getElementById('form-title');
  const cancelarEdicion = document.getElementById('cancelar-edicion');
  const tonosContainer = document.getElementById('tonos-container');
  const agregarTonoBtn = document.getElementById('agregar-tono');
  const imagenInput = document.getElementById('imagen');
  const imagenPreview = document.getElementById('imagen-preview');
  const modalProducto = document.getElementById('modal-producto');
  const agregarProductoBtn = document.getElementById('agregar-producto-btn');
  const modalClose = document.querySelector('.modal-close');
  const tableSearch = document.getElementById('table-search');
  const disponibilidadFilter = document.getElementById('disponibilidad-filter');
  const categoriaFilter = document.getElementById('categoria-filter');
  const logoutBtn = document.getElementById('logout-btn');
  const modalImagenAmpliada = document.getElementById('modal-imagen-ampliada');
  const imagenAmpliada = document.getElementById('imagen-ampliada');
  const modalImagenClose = document.querySelector('.modal-imagen-close');
  const scrollTopBtn = document.getElementById('scroll-top-btn');
  const confirmModal = document.getElementById('logoutConfirmModal');
  const confirmBtn = document.getElementById('confirmLogout');
  const cancelBtn = document.getElementById('cancelLogout');
  const uploadImageBtn = document.getElementById('upload-image-btn');
  const imageUploadModal = document.getElementById('image-upload-modal');
  const closeUploadModal = document.getElementById('close-upload-modal');
  const cancelUploadBtn = document.getElementById('cancel-upload-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const fileInput = document.getElementById('imageInput');
  const cameraInput = document.getElementById('cameraInput');
  const dropZone = document.getElementById('drop-zone');
  const clearPreviewBtn = document.getElementById('clear-preview');
  const copyUrlBtn = document.getElementById('copy-url-btn');
  const subirDesdeInput = document.getElementById('subir-desde-input');
  const takePhotoBtn = document.getElementById('take-photo-btn');
  const selectFileBtn = document.getElementById('select-file-btn');

  // Variables de estado
  let editando = false;
  let productoId = null;
  let productos = [];
  let lastScrollY = 0;
  let currentInputTarget = null; // Rastrear el campo objetivo (imagen principal o tono)

  // Inicialización de modales
  modalImagenAmpliada.style.display = 'none';
  if (imageUploadModal) imageUploadModal.style.display = 'none';

  // Verificar que todos los elementos existan
  if (!formProducto || !cuerpoProductos || !formTitle || !cancelarEdicion || !tonosContainer ||
      !agregarTonoBtn || !imagenInput || !imagenPreview || !modalProducto || !agregarProductoBtn ||
      !modalClose || !tableSearch || !disponibilidadFilter || !categoriaFilter || !logoutBtn || !modalImagenAmpliada || 
      !imagenAmpliada || !modalImagenClose || !scrollTopBtn || !confirmModal || !confirmBtn ||
      !cancelBtn || !uploadImageBtn || !imageUploadModal || !closeUploadModal || !cancelUploadBtn ||
      !uploadBtn || !fileInput || !cameraInput || !dropZone || !clearPreviewBtn || !copyUrlBtn || 
      !subirDesdeInput || !takePhotoBtn || !selectFileBtn) {
    console.error('Error: Uno o más elementos del DOM no fueron encontrados');
    return;
  }

  // Función para reiniciar el modal de subida de imágenes
  function resetUploadModal() {
    fileInput.value = '';
    cameraInput.value = '';
    document.getElementById('file-info').textContent = 'Arrastra la imagen aquí o hace clic para seleccionar';
    uploadBtn.disabled = true;
    document.getElementById('upload-status').classList.add('hidden');
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('upload-success').classList.add('hidden');
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('image-link-container').classList.add('hidden');
    document.getElementById('image-url').value = '';
    dropZone.style.display = 'none';
    document.querySelector('.upload-options').style.display = 'flex';
  }

  // Mostrar progreso de subida
  function showUploadProgress() {
    document.getElementById('upload-status').classList.remove('hidden');
    document.getElementById('upload-progress').classList.remove('hidden');
    document.getElementById('upload-success').classList.add('hidden');
    uploadBtn.disabled = true;
  }

  // Mostrar éxito de subida
  function showUploadSuccess() {
    document.getElementById('upload-status').classList.remove('hidden');
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('upload-success').classList.remove('hidden');
    const url = document.getElementById('image-url').value;
    if (url) {
      if (currentInputTarget) {
        // Actualizar el campo correspondiente (imagen principal o tono)
        currentInputTarget.value = url;
        
        // Actualizar la vista previa correspondiente
        let previewElement;
        if (currentInputTarget.id === 'imagen') {
          previewElement = imagenPreview;
        } else if (currentInputTarget.classList.contains('tono-imagen')) {
          previewElement = currentInputTarget.closest('.tono-input').querySelector('.tono-preview');
        }

        if (previewElement) {
          previewElement.src = url;
          previewElement.style.display = 'block';
          previewElement.onerror = () => {
            previewElement.src = '';
            previewElement.style.display = 'none';
          };
        }

        // Disparar evento input para asegurar que se actualice cualquier lógica dependiente
        const inputEvent = new Event('input', { bubbles: true });
        currentInputTarget.dispatchEvent(inputEvent);

        // Cerrar el modal inmediatamente para subidas desde el formulario
        imageUploadModal.style.display = 'none';
        resetUploadModal();
        currentInputTarget = null;
      } else {
        // Para el botón "Generar link" del encabezado, mantener el modal abierto
        document.getElementById('image-link-container').classList.remove('hidden');
      }
    } else {
      console.error('No se recibió una URL válida en showUploadSuccess');
      alert('Error: No se recibió una URL válida al subir la imagen');
      resetUploadModal();
      currentInputTarget = null;
    }
  }

  // Manejar selección de archivos
  function handleFileSelect(file) {
    if (!file) return;
    document.getElementById('file-info').textContent = `Archivo seleccionado: ${file.name}`;
    uploadBtn.disabled = false;
    const reader = new FileReader();
    reader.onload = function(event) {
      document.getElementById('uploaded-image-preview').src = event.target.result;
      document.getElementById('preview-section').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  // Subir imagen a ImgBB
  async function uploadImageToImgBB() {
    const file = fileInput.files[0] || cameraInput.files[0];
    if (!file) {
      alert("Por favor, selecciona una imagen primero.");
      return;
    }

    showUploadProgress();
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function() {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function(blob) {
          const formData = new FormData();
          formData.append("image", blob, file.name);
          fetch("https://api.imgbb.com/1/upload?key=50f0ce5bf1eb4dd0fb58566dfb19c59a", {
            method: "POST",
            body: formData,
          })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) {
                const url = result.data.url;
                document.getElementById('image-url').value = url;
                showUploadSuccess();
              } else {
                throw new Error(result.error?.message || "Error al subir la imagen");
              }
            })
            .catch((err) => {
              console.error("Error en la subida:", err);
              alert(`Error al subir la imagen: ${err.message}`);
              resetUploadModal();
              currentInputTarget = null;
            });
        }, "image/webp", 0.8);
      };
    };
  }

  // Copiar URL al portapapeles
  function copyImageUrl() {
    const imageUrlInput = document.getElementById('image-url');
    imageUrlInput.select();
    document.execCommand('copy');
    const originalText = copyUrlBtn.innerHTML;
    copyUrlBtn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
    setTimeout(() => {
      copyUrlBtn.innerHTML = originalText;
    }, 2000);
  }

  // Event Listeners para el modal de imágenes
  uploadImageBtn.addEventListener('click', () => {
    currentInputTarget = null; // Para el botón "Generar link" del encabezado
    imageUploadModal.style.display = 'block';
    resetUploadModal();
  });

  subirDesdeInput.addEventListener('click', () => {
    currentInputTarget = imagenInput; // Establecer el campo de imagen principal como objetivo
    imageUploadModal.style.display = 'block';
    resetUploadModal();
  });

  // Event listeners para las opciones de subida
  takePhotoBtn.addEventListener('click', () => {
    document.querySelector('.upload-options').style.display = 'none';
    dropZone.style.display = 'block';
    cameraInput.click();
  });

  selectFileBtn.addEventListener('click', () => {
    document.querySelector('.upload-options').style.display = 'none';
    dropZone.style.display = 'block';
    fileInput.click();
  });

  const closeModal = () => {
    imageUploadModal.style.display = 'none';
    resetUploadModal();
    currentInputTarget = null;
  };

  closeUploadModal.addEventListener('click', closeModal);
  cancelUploadBtn.addEventListener('click', closeModal);

  clearPreviewBtn.addEventListener('click', () => {
    document.getElementById('preview-section').classList.add('hidden');
    resetUploadModal();
    currentInputTarget = null;
  });

  uploadBtn.addEventListener('click', uploadImageToImgBB);
  copyUrlBtn.addEventListener('click', copyImageUrl);

  // Drag and Drop
  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('highlight');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('highlight');
    });
  });

  dropZone.addEventListener('drop', function(e) {
    preventDefaults(e);
    const files = e.dataTransfer.files;
    if (files.length) {
      fileInput.files = files;
      handleFileSelect(files[0]);
    }
  });

  fileInput.addEventListener('change', function() {
    if (fileInput.files.length) {
      handleFileSelect(fileInput.files[0]);
    }
  });

  cameraInput.addEventListener('change', function() {
    if (cameraInput.files.length) {
      handleFileSelect(cameraInput.files[0]);
    }
  });

  // Función de confirmación
  function showConfirmModal(title, message, confirmText, onConfirm, showCancel = true) {
    confirmModal.querySelector('h3').textContent = title;
    confirmModal.querySelector('p').textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.style.display = showCancel ? 'inline-block' : 'none';
    confirmBtn.onclick = async () => {
      try {
        if (onConfirm) await onConfirm();
      } finally {
        confirmModal.style.display = 'none';
      }
    };
    if (showCancel) {
      cancelBtn.onclick = () => {
        confirmModal.style.display = 'none';
      };
    }
    confirmModal.style.display = 'flex';
  }

  // Cerrar sesión
  logoutBtn.addEventListener('click', () => {
    showConfirmModal(
      '¿Estás seguro?',
      '¿Realmente deseas cerrar tu sesión?',
      'Sí, cerrar sesión',
      async () => {
        try {
          await signOut(auth);
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = `login.html?logout=1&t=${Date.now()}`;
        } catch (error) {
          console.error("Error al cerrar sesión:", error);
        }
      },
      true
    );
  });


  // Acordeón precio de oferta
  const toggleOferta = document.getElementById('toggle-oferta');
  const acordeonOferta = document.getElementById('accordion-oferta');
  if (toggleOferta && acordeonOferta) {
    toggleOferta.addEventListener('click', () => {
      const isOpen = acordeonOferta.classList.toggle('open');
      const icon = toggleOferta.querySelector('.accordion-icon');
      if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      if (!isOpen) {
        document.getElementById('precioAnterior').value = '';
      }
    });
  }

  // Modal de producto
  agregarProductoBtn.addEventListener('click', () => {
    resetInactivityTimer();
    formProducto.reset();
    tonosContainer.innerHTML = '';
    imagenPreview.src = '';
    imagenPreview.style.display = 'none';
    formTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Agregar producto';
    cancelarEdicion.style.display = 'none';
    editando = false;
    productoId = null;
    // Cerrar acordeón de oferta
    const acOferAb = document.getElementById('accordion-oferta');
    const acOferIcon = document.querySelector('#toggle-oferta .accordion-icon');
    if (acOferAb) acOferAb.classList.remove('open');
    if (acOferIcon) acOferIcon.style.transform = 'rotate(0deg)';
    modalProducto.style.display = 'block';
    document.body.style.overflow = 'hidden';
  });

  // Cerrar modales
  modalClose.addEventListener('click', () => {
    modalProducto.style.display = 'none';
    document.body.style.overflow = '';
  });

  modalImagenClose.addEventListener('click', () => {
    modalImagenAmpliada.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modalProducto || e.target === modalImagenAmpliada || e.target === imageUploadModal) {
      e.target.style.display = 'none';
      if (e.target === modalProducto) {
        document.body.style.overflow = '';
      }
      if (e.target === imageUploadModal) {
        resetUploadModal();
        currentInputTarget = null;
      }
    }
  });

  // Funciones de validación - ELIMINADAS

  // Event listeners para validación en tiempo real - ELIMINADOS

  // Previsualización de imagen principal
  imagenInput.addEventListener('input', () => {
    const url = imagenInput.value;
    if (url) {
      imagenPreview.src = url;
      imagenPreview.style.display = 'block';
      imagenPreview.onerror = () => {
        imagenPreview.src = '';
        imagenPreview.style.display = 'none';
      };
    } else {
      imagenPreview.src = '';
      imagenPreview.style.display = 'none';
    }
    
    // Validación de imagen en tiempo real - ELIMINADA
  });

  // Ampliar imagen
  imagenPreview.addEventListener('click', (e) => {
    e.stopPropagation();
    if (imagenPreview.src && imagenPreview.style.display !== 'none') {
      imagenAmpliada.src = imagenPreview.src;
      modalImagenAmpliada.style.display = 'block';
    }
  });

  // Cargar productos
  async function cargarProductos() {
    try {
      const snapshot = await getDocs(collection(db, "productos"));
      productos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderizarProductos(tableSearch.value, disponibilidadFilter.value, categoriaFilter.value);
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  }

  // Renderizar productos
  function renderizarProductos(searchFilter = '', availabilityFilter = 'all', categoryFilter = 'all') {
    cuerpoProductos.innerHTML = '';
    let productosFiltrados = productos.filter(producto =>
      (producto.nombre.toLowerCase().includes(searchFilter.toLowerCase()) ||
      producto.categoria.toLowerCase().includes(searchFilter.toLowerCase())) &&
      (availabilityFilter === 'all' || 
       (availabilityFilter === 'available' && producto.disponible) ||
       (availabilityFilter === 'unavailable' && !producto.disponible)) &&
      (categoryFilter === 'all' || producto.categoria === categoryFilter)
    );

    if (productosFiltrados.length === 0) {
      cuerpoProductos.innerHTML = '<div style="text-align: center; padding: 20px;">No se encontraron productos</div>';
      return;
    }

    productosFiltrados.forEach(producto => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-card-header">
          <h3>${producto.nombre}</h3>
          <span class="category">${producto.categoria}</span>
        </div>
        <img src="${producto.imagen}" alt="${producto.nombre}" class="imagen-tabla" data-src="${producto.imagen}">
        <div class="product-card-details">
          <p class="price">
            ${producto.precioAnterior && parseFloat(producto.precioAnterior) > parseFloat(producto.precio)
              ? `<span class="price-old">$${parseFloat(producto.precioAnterior).toFixed(2)}</span> <span class="price-new">$${parseFloat(producto.precio).toFixed(2)}</span>`
              : `$${parseFloat(producto.precio).toFixed(2)}`}
          </p>
          <p class="${producto.disponible ? 'available' : 'unavailable'}">
            ${producto.disponible ? 'Disponible' : 'No disponible'}
          </p>
        </div>
        <div class="product-card-tones">
          ${producto.tonos && producto.tonos.length > 0
            ? producto.tonos.map(tono => `
                <img src="${tono.imagen}" alt="${tono.nombre}" class="tono-preview" data-src="${tono.imagen}">
              `).join('')
            : '<p>Sin variantes</p>'}
        </div>
        <div class="product-card-actions">
          <button class="editar" data-id="${producto.id}">Editar</button>
          <button class="eliminar" data-id="${producto.id}">Eliminar</button>
        </div>
      `;
      cuerpoProductos.appendChild(card);
    });

    document.querySelectorAll('.imagen-tabla, .tono-preview').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        imagenAmpliada.src = img.getAttribute('data-src');
        modalImagenAmpliada.style.display = 'block';
      });
    });

    document.querySelectorAll('.editar').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const producto = productos.find(p => p.id === id);
        document.getElementById('producto-id').value = id;
        document.getElementById('nombre').value = producto.nombre;
        document.getElementById('categoria').value = producto.categoria;
        document.getElementById('precio').value = producto.precio;
        const precioAnteriorInput = document.getElementById('precioAnterior');
        if (precioAnteriorInput) {
          precioAnteriorInput.value = producto.precioAnterior || '';
        }
        document.getElementById('imagen').value = producto.imagen;
        document.getElementById('disponible').checked = producto.disponible;
      document.getElementById('esNuevo').checked = producto.esNuevo || false;
      document.getElementById('descripcion').value = producto.descripcion || '';
        imagenPreview.src = producto.imagen;
        imagenPreview.style.display = 'block';
        tonosContainer.innerHTML = '';
        if (producto.tonos && producto.tonos.length > 0) {
          producto.tonos.forEach(tono => {
            agregarTonoInput(tono.nombre, tono.imagen, tono.disponible);
          });
        }
        formTitle.innerHTML = '<i class="fas fa-edit"></i> Editar producto';
        cancelarEdicion.style.display = 'inline-block';
        editando = true;
        productoId = id;
        modalProducto.style.display = 'block';
        document.body.style.overflow = 'hidden';
        // Abrir acordeón si el producto tiene precio anterior
        const acordeonOferta = document.getElementById('accordion-oferta');
        const iconOferta = document.querySelector('#toggle-oferta .accordion-icon');
        if (producto.precioAnterior) {
          acordeonOferta.classList.add('open');
          if (iconOferta) iconOferta.style.transform = 'rotate(180deg)';
        } else {
          acordeonOferta.classList.remove('open');
          if (iconOferta) iconOferta.style.transform = 'rotate(0deg)';
        }
      });
    });

    document.querySelectorAll('.eliminar').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        showConfirmModal(
          '¿Estás seguro?',
          '¿Realmente deseas eliminar este producto?',
          'Sí, eliminar',
          async () => {
            try {
              await deleteDoc(doc(db, "productos", id));
              cargarProductos();
            } catch (error) {
              console.error("Error al eliminar producto:", error);
            }
          },
          true
        );
      });
    });
  }

  // Búsqueda y filtro
  tableSearch.addEventListener('input', () => {
    renderizarProductos(tableSearch.value, disponibilidadFilter.value, categoriaFilter.value);
  });

  disponibilidadFilter.addEventListener('change', () => {
    renderizarProductos(tableSearch.value, disponibilidadFilter.value, categoriaFilter.value);
  });

  categoriaFilter.addEventListener('change', () => {
    renderizarProductos(tableSearch.value, disponibilidadFilter.value, categoriaFilter.value);
  });

  // Gestión de tonos
  function agregarTonoInput(nombre = '', imagen = '', disponible = true) {
    const tonoDiv = document.createElement('div');
    tonoDiv.className = 'tono-input';
    tonoDiv.innerHTML = `
      <input type="text" class="tono-nombre" placeholder="Nombre" value="${nombre}">
      <div style="display: flex; gap: 10px;">
        <input type="text" class="tono-imagen" placeholder="URL de la imagen" value="${imagen}">
        <button type="button" class="subir-tono-imagen btn-secondary">
          <i class="fas fa-upload"></i>
        </button>
      </div>
      <img class="tono-preview" src="${imagen}" alt="Previsualización" style="display: ${imagen ? 'block' : 'none'};">
      <label style="display: flex; align-items: center; margin-top: 10px;">
        <input type="checkbox" class="tono-disponible" ${disponible ? 'checked' : ''}>
        Disponible
      </label>
      <button type="button" class="eliminar-tono">Eliminar</button>
    `;
    tonosContainer.appendChild(tonoDiv);

    const tonoImagenInput = tonoDiv.querySelector('.tono-imagen');
    const tonoPreview = tonoDiv.querySelector('.tono-preview');
    const subirTonoImagenBtn = tonoDiv.querySelector('.subir-tono-imagen');

    tonoImagenInput.addEventListener('input', () => {
      const url = tonoImagenInput.value;
      if (url) {
        tonoPreview.src = url;
        tonoPreview.style.display = 'block';
        tonoPreview.onerror = () => {
          tonoPreview.src = '';
          tonoPreview.style.display = 'none';
        };
      } else {
        tonoPreview.src = '';
        tonoPreview.style.display = 'none';
      }
    });

    tonoPreview.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tonoPreview.src && tonoPreview.style.display !== 'none') {
        imagenAmpliada.src = tonoPreview.src;
        modalImagenAmpliada.style.display = 'block';
      }
    });

    subirTonoImagenBtn.addEventListener('click', () => {
      currentInputTarget = tonoImagenInput; // Establecer el campo de tono como objetivo
      imageUploadModal.style.display = 'block';
      resetUploadModal();
    });

    tonoDiv.querySelector('.eliminar-tono').addEventListener('click', () => {
      tonoDiv.remove();
    });
  }

  agregarTonoBtn.addEventListener('click', () => {
    agregarTonoInput();
  });

  // Formulario
  formProducto.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validar todos los campos antes de enviar
    const nombre = document.getElementById('nombre').value.trim();
    const categoria = document.getElementById('categoria').value;
    const precio = parseFloat(document.getElementById('precio').value);
    const precioAnteriorValor = document.getElementById('precioAnterior')?.value;
    const precioAnterior = precioAnteriorValor !== '' ? parseFloat(precioAnteriorValor) : null;
    const imagen = document.getElementById('imagen').value.trim();
    const disponible = document.getElementById('disponible').checked;
    const esNuevoManual = document.getElementById('esNuevo').checked;
    const descripcion = document.getElementById('descripcion').value.trim();
    
    // Validaciones simples
    if (!nombre || nombre.length < 2) {
      alert('Por favor, ingresa un nombre válido (mínimo 2 caracteres).');
      return;
    }
    
    if (!precio || precio <= 0) {
      alert('Por favor, ingresa un precio válido.');
      return;
    }
    if (precioAnterior !== null && (isNaN(precioAnterior) || precioAnterior <= 0)) {
      alert('Por favor, ingresa un precio anterior válido o deja el campo vacío.');
      return;
    }
    
    if (!imagen) {
      alert('Por favor, ingresa una URL de imagen.');
      return;
    }
    
    if (!categoria) {
      alert('Por favor, selecciona una categoría.');
      return;
    }
    
    // Mostrar estado de carga
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');
    
    const tonosInputs = document.querySelectorAll('.tono-input');
    const tonos = Array.from(tonosInputs).map(input => ({
      nombre: input.querySelector('.tono-nombre').value.trim(),
      imagen: input.querySelector('.tono-imagen').value.trim(),
      disponible: input.querySelector('.tono-disponible').checked
    })).filter(tono => tono.nombre !== '');
    const producto = { nombre, categoria, precio, imagen, disponible, tonos, esNuevo: esNuevoManual, descripcion };
    if (precioAnterior !== null) {
      producto.precioAnterior = precioAnterior;
    } else {
      // si se está editando y el campo quedó vacío, eliminar precioAnterior
      if (editando) {
        producto.precioAnterior = null;
      }
    }

    try {
      if (editando) {
        // Preservar la fecha de subida original al editar
        const productoOriginal = productos.find(p => p.id === productoId);
        if (productoOriginal && productoOriginal.fechaSubida) {
          producto.fechaSubida = productoOriginal.fechaSubida;
        }
        await updateDoc(doc(db, "productos", productoId), producto);
        showConfirmModal(
          '¡Producto actualizado!',
          `El producto "${nombre}" fue actualizado exitosamente.`,
          'Aceptar',
          async () => {},
          false
        );
      } else {
        producto.fechaSubida = new Date().toISOString();
        await addDoc(collection(db, "productos"), producto);
        showConfirmModal(
          '¡Producto agregado!',
          `El producto "${nombre}" fue agregado exitosamente.`,
          'Aceptar',
          async () => {},
          false
        );
      }
      formProducto.reset();
      tonosContainer.innerHTML = '';
      imagenPreview.src = '';
      imagenPreview.style.display = 'none';
      formTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Agregar producto';
      cancelarEdicion.style.display = 'none';
      editando = false;
      productoId = null;
      modalProducto.style.display = 'none';
      document.body.style.overflow = '';
      await cargarProductos();
    } catch (error) {
      console.error("Error al guardar producto:", error);
      showConfirmModal(
        'Error',
        'Hubo un problema al guardar el producto. Por favor, intenta de nuevo.',
        'Aceptar',
        async () => {},
        false
      );
    } finally {
      // Restaurar estado del botón
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });

  // Cancelar edición
  cancelarEdicion.addEventListener('click', () => {
    formProducto.reset();
    tonosContainer.innerHTML = '';
    imagenPreview.src = '';
    imagenPreview.style.display = 'none';
    formTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Agregar producto';
    cancelarEdicion.style.display = 'none';
    editando = false;
    productoId = null;
    modalProducto.style.display = 'none';
    document.body.style.overflow = '';
  });

  // Scroll to top
  scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalImagenAmpliada.style.display === 'block') {
        modalImagenAmpliada.style.display = 'none';
      } else if (imageUploadModal.style.display === 'block') {
        imageUploadModal.style.display = 'none';
        resetUploadModal();
        currentInputTarget = null;
      }
    }
  });

  // Manejador de scroll optimizado
  const adminHeader = document.querySelector('.admin-header');

  function handleScroll() {
    const currentScrollY = window.scrollY;

    // Header scroll logic
    if (currentScrollY > lastScrollY && currentScrollY > 80) {
      adminHeader.style.transform = 'translateY(-100%)';
    } else {
      adminHeader.style.transform = 'translateY(0)';
    }

    // Show/hide scroll-to-top button
    if (currentScrollY > 100) {
      scrollTopBtn.classList.add('visible');
    } else {
      scrollTopBtn.classList.remove('visible');
    }

    lastScrollY = currentScrollY;
  }

  // Optimización con debounce para el evento scroll
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(handleScroll, 100);
  });

  // Carga inicial
  cargarProductos();
});