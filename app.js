/* ==========================================================================
   1. CONFIGURACIÓN Y VARIABLES GLOBALES (Compartidas por ambos)
   ========================================================================== */
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbynTchtEIJ-HmdGR7EfxzKIGeq-F5nhepMUJSxTs9Xy8QtbDzEu_PYz7pS-SNgC0JvSeQ/exec"; // Reemplaza por tu URL real si cambia
const WS_NUMBER = "50231566415"; // Número de WhatsApp configurado

let allItems = [], filteredItems = [];
let currentPage = 1;
let itemsPerPage = 25; // Default solicitado
let currentItem = null;
let editDirty = false;

/* ==========================================================================
   2. ENRUTADOR AUTOMÁTICO (Detecta la página actual al cargar)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Si el body tiene la clase de la tienda
    if (document.body.classList.contains('index-page')) {
        loadInventory(); 
        
        // Listener opcional para cerrar modal de producto al hacer clic afuera
        window.addEventListener('click', function(e) {
            const modal = document.getElementById('productModal');
            if (e.target === modal) {
                closeProductModal();
            }
        });
    } 
    // Si el body tiene la clase de administración
    else if (document.body.classList.contains('admin-page')) {
        // Inicializa el comportamiento de arrastrar y soltar imágenes en el panel
        setupDragAndDrop();
        setupAdminForms();
    } else if (document.body.classList.contains('product-page')) {
        loadProductPage();
    }
});

/* ==========================================================================
   3. LÓGICA PARA LA TIENDA PRINCIPAL (index.html)
   ========================================================================== */
function showInventoryError(message) {
  document.getElementById('resultCount').innerText = 'No se pudo cargar el inventario';
  document.getElementById('catalogGrid').innerHTML = `<div class="loading">${message}</div>`;
}

function normalizeInventoryPayload(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.inventory)) return data.inventory;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function getProductUrl(sku) {
  const url = new URL('product.html', window.location.href);
  url.searchParams.set('sku', sku);
  return url.href;
}

function getProductImages(item) {
  const gallery = item.galeria
    ? (typeof item.galeria === 'string' ? item.galeria.split(',') : item.galeria)
    : [item.imagen || 'image_unavailable.png'];

  return gallery.map(src => String(src).trim()).filter(Boolean);
}

function getJsonp(params, timeoutMs = 15000) {
  const cb = 'callback_' + Date.now();
  const script = document.createElement('script');
  const query = new URLSearchParams({ ...params, callback: cb });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timeout'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cb];
      script.remove();
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('network'));
    };
    script.src = `${WEB_APP_URL}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

async function loadInventory(){
  try {
    const data = await getJsonp({ action: 'getInventory' });
    allItems = normalizeInventoryPayload(data);
    applyFilters();
  } catch(error) {
    const message = error.message === 'timeout'
      ? 'El inventario está tardando demasiado en responder. Intenta recargar la página.'
      : 'Hubo un problema conectando con la base de datos.';
    showInventoryError(message);
  }
}

// Controladores de la paginación solicitada
function changePerPage() {
  itemsPerPage = parseInt(document.getElementById('perPage').value);
  currentPage = 1; 
  render();
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  currentPage += delta;
  
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;
  
  render();
  // Sube el scroll de forma suave hacia el contador de resultados
  document.getElementById('resultCount').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function applyFilters(){
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const size = document.getElementById('sizeFilter').value;
  const type = document.getElementById('typeFilter').value;
  const onlyAvail = true; // Forzado a solo disponibles según tu código original
  const sort = document.getElementById('sortOrder').value;

  filteredItems = allItems.filter(item => {
    const matchesSearch = !search || 
                         String(item.sku).toLowerCase().includes(search) || 
                         String(item.equipo).toLowerCase().includes(search);
    
    const matchesSize = !size || String(item.talla) === size;
    const matchesType = !type || String(item.tipo) === type;
    
    const isDisponible = item.disponible === true || String(item.disponible).toUpperCase() === 'SÍ';
    const matchesAvail = !onlyAvail || isDisponible;
    const activeOnly = item.estado !== 'Eliminado';

    return matchesSearch && matchesSize && matchesType && matchesAvail && activeOnly;
  });

  if (sort === 'p-low') filteredItems.sort((a, b) => Number(a.precio) - Number(b.precio));
  if (sort === 'p-high') filteredItems.sort((a, b) => Number(b.precio) - Number(a.precio));
  if (sort === 'az') filteredItems.sort((a, b) => a.equipo.localeCompare(b.equipo));

  currentPage = 1; 
  render();
}

function render(){
  const grid = document.getElementById('catalogGrid');
  const pagControls = document.getElementById('paginationControls');
  const totalItems = filteredItems.length;
  
  document.getElementById('resultCount').innerText = `${totalItems} prendas encontradas`;
  
  if(totalItems === 0) {
    grid.innerHTML = '<div class="loading">No se encontraron resultados.</div>';
    if(pagControls) pagControls.style.display = 'none';
    return;
  }

  // Segmentación matemática para paginación
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedItems = filteredItems.slice(start, end);

  grid.innerHTML = paginatedItems.map(item => {
    const wsMsg = encodeURIComponent(`Hola, me interesa el jersey del ${item.equipo} '${item.year} (SKU: ${item.sku})`);
    
    return `
    <div class="card">
      <div class="card-image-container" onclick="openProductModal('${item.sku}')" style="cursor: pointer;" title="Haz clic para ver detalles">
        <img class="card-image" src="${item.imagen || 'image_unavailable.png'}" loading="lazy">
        <div class="badge badge-type">${String(item.tipo).toUpperCase()}</div>
      </div>
      <div class="card-body">
        <h3 style="font-size:16px; margin-bottom: 5px;">${item.equipo} '${item.year}</h3>
        <div class="price">Q${item.precio}</div>
        <div style="font-size:12px; color:#8293ac; margin-bottom: 15px;">Talla: ${item.talla} | SKU: ${item.sku}</div>
        
        <div class="card-actions" style="justify-content: flex-end;">
            <a href="https://wa.me/${WS_NUMBER}?text=${wsMsg}" class="ws-icon-btn" target="_blank" title="Consultar por WhatsApp">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766 0 1.018.265 2.012.768 2.885l-.817 2.984 3.052-.801a5.727 5.727 0 002.765.713h.001c3.181 0 5.768-2.586 5.768-5.766 0-3.181-2.587-5.767-5.769-5.781zm3.167 8.351c-.173.488-.988.941-1.378 1.002-.389.061-.832.138-2.612-.598-2.115-.875-3.468-3.023-3.573-3.164-.105-.141-.853-1.135-.853-2.164 0-1.029.531-1.536.718-1.731.187-.195.405-.244.538-.244.133 0 .266.002.385.006.126.004.296-.048.455.337.173.418.59 1.439.643 1.545.053.106.088.23.018.371-.07.141-.105.23-.211.353-.105.123-.219.266-.314.354-.105.097-.215.203-.095.412.12.209.535.887 1.148 1.434.79.706 1.464.925 1.674 1.031.21.106.333.088.456-.053.123-.141.531-.618.675-.83.141-.212.282-.176.474-.106.192.071 1.215.572 1.425.678.21.106.35.159.4.247.05.088.05.512-.123 1.002zM12.002 2C6.478 2 2 6.477 2 12c0 1.761.463 3.42 1.306 4.887L2 22l5.233-1.354A9.957 9.957 0 0012.002 22c5.523 0 10-4.477 10-10S17.526 2 12.002 2z"/></svg>
            </a>
        </div>
      </div>
    </div>
    `;
  }).join('');

  // Actualizar UI de paginación
  if (pagControls) {
    if (totalPages > 1) {
      pagControls.style.display = 'flex';
      document.getElementById('pageIndicator').innerText = `Página ${currentPage} de ${totalPages}`;
      document.getElementById('prevPageBtn').disabled = currentPage === 1;
      document.getElementById('nextPageBtn').disabled = currentPage === totalPages;
    } else {
      pagControls.style.display = 'none';
    }
  }
}

function openProductModal(sku) {
  const item = allItems.find(i => String(i.sku) === String(sku));
  if (!item) return;

  document.getElementById('modalTitle').innerText = `${item.equipo} '${item.year}`;
  document.getElementById('modalPrice').innerText = `Q${item.precio}`;
  document.getElementById('modalSize').innerText = item.talla || '-';
  document.getElementById('modalType').innerText = item.tipo || '-';
  document.getElementById('modalNotes').innerText = item.notas || item.detalles || 'Sin detalles adicionales.';
  document.getElementById('modalSku').innerText = item.sku;

  const wsMsg = encodeURIComponent(`Hola, me interesa el jersey del ${item.equipo} '${item.year} (SKU: ${item.sku})`);
  document.getElementById('modalWsBtn').href = `https://wa.me/${WS_NUMBER}?text=${wsMsg}`;
  document.getElementById('modalFullPageBtn').href = getProductUrl(item.sku);

  // Configuración de la Galería interna del Modal
  const mainImg = document.getElementById('modalMainImage');
  const thumbContainer = document.getElementById('modalThumbnails');
  const images = getProductImages(item);

  mainImg.src = images[0];
  thumbContainer.innerHTML = images.map(src => 
    `<img src="${src}" onclick="document.getElementById('modalMainImage').src='${src}'" 
      style="width:70px; height:70px; object-fit:cover; border-radius:8px; cursor:pointer; border:2px solid transparent; transition:0.2s;" 
      onmouseover="this.style.borderColor='#2490ff'" onmouseout="this.style.borderColor='transparent'">`
  ).join('');

  document.getElementById('productModal').style.display = "flex";
}

function closeProductModal() {
  document.getElementById('productModal').style.display = "none";
}

async function loadProductPage() {
  const params = new URLSearchParams(window.location.search);
  const sku = params.get('sku');
  const view = document.getElementById('productPageContent');

  if (!sku) {
    view.innerHTML = '<div class="loading">No se especifico un SKU para mostrar.</div>';
    return;
  }

  try {
    const result = await getJsonp({ action: 'getSku', sku });
    if (!result.success || !result.item) {
      view.innerHTML = '<div class="loading">No encontramos una prenda con ese SKU.</div>';
      return;
    }

    renderProductPage(result.item);
  } catch(error) {
    view.innerHTML = '<div class="loading">Hubo un problema cargando esta prenda.</div>';
  }
}

function renderProductPage(item) {
  const view = document.getElementById('productPageContent');
  const images = getProductImages(item);
  const wsMsg = encodeURIComponent(`Hola, me interesa el jersey del ${item.equipo} '${item.year} (SKU: ${item.sku})`);
  const productUrl = getProductUrl(item.sku);

  document.title = `${item.equipo} ${item.year} | CAS`;

  view.innerHTML = `
    <section class="product-detail-layout">
      <div class="product-gallery">
        <div class="product-main-image-wrap" id="productImageWrap">
          <img id="productMainImage" src="${images[0]}" alt="${item.equipo} ${item.year}" class="product-main-image">
        </div>
        <div class="product-zoom-controls">
          <button type="button" class="secondary-btn" onclick="setProductZoom(-0.25)">Alejar</button>
          <span id="zoomLabel">100%</span>
          <button type="button" class="secondary-btn" onclick="setProductZoom(0.25)">Acercar</button>
        </div>
        <div class="product-thumbnails">
          ${images.map((src, index) => `
            <button type="button" class="product-thumb ${index === 0 ? 'active' : ''}" onclick="selectProductImage('${src.replace(/'/g, "\\'")}', this)">
              <img src="${src}" alt="Vista ${index + 1} de ${item.equipo}">
            </button>
          `).join('')}
        </div>
      </div>

      <aside class="product-info-panel">
        <a href="index.html" class="product-back-link">Regresar al catalogo</a>
        <div class="product-type">${String(item.tipo || '').toUpperCase()}</div>
        <h1>${item.equipo} '${item.year}</h1>
        <div class="product-page-price">Q${item.precio}</div>

        <div class="product-facts">
          <div><span>Talla</span><strong>${item.talla || '-'}</strong></div>
          <div><span>SKU</span><strong>${item.sku || '-'}</strong></div>
          <div><span>Estado</span><strong>${item.disponible ? 'Disponible' : 'No disponible'}</strong></div>
        </div>

        <div class="product-notes">
          <h2>Descripcion / Notas</h2>
          <p>${item.notas || item.detalles || 'Sin notas adicionales.'}</p>
        </div>

        <a href="https://wa.me/${WS_NUMBER}?text=${wsMsg}" class="ws-btn-full" target="_blank">Consultar WhatsApp</a>
        <button type="button" class="secondary-btn share-url-btn" onclick="copyProductUrl('${productUrl}')">Compartir URL</button>
        <input id="productShareInput" class="product-share-input" type="text" value="${productUrl}" readonly>
        <div id="copyStatus" class="copy-status" aria-live="polite"></div>
      </aside>
    </section>
  `;
}

let productZoom = 1;
function selectProductImage(src, button) {
  document.getElementById('productMainImage').src = src;
  productZoom = 1;
  updateProductZoom();
  document.querySelectorAll('.product-thumb').forEach(thumb => thumb.classList.remove('active'));
  button.classList.add('active');
}

function setProductZoom(delta) {
  productZoom = Math.min(2.5, Math.max(1, productZoom + delta));
  updateProductZoom();
}

function updateProductZoom() {
  const image = document.getElementById('productMainImage');
  const label = document.getElementById('zoomLabel');
  const wrap = document.getElementById('productImageWrap');
  if (!image || !label || !wrap) return;

  image.style.transform = `scale(${productZoom})`;
  label.innerText = `${Math.round(productZoom * 100)}%`;
  wrap.classList.toggle('is-zoomed', productZoom > 1);
}

async function copyProductUrl(url) {
  const status = document.getElementById('copyStatus');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      copyTextFallback(url);
    }
    status.innerText = 'URL copiada al portapapeles.';
  } catch(error) {
    if (copyTextFallback(url)) {
      status.innerText = 'URL copiada al portapapeles.';
    } else {
      const shareInput = document.getElementById('productShareInput');
      if (shareInput) {
        shareInput.focus();
        shareInput.select();
      }
      status.innerText = 'No se pudo copiar automaticamente. La URL quedo seleccionada para copiarla manualmente.';
    }
  }
}

function copyTextFallback(text) {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.top = '0';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.focus();
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  return copied;
}


/* ==========================================================================
   4. LÓGICA PARA EL PANEL DE ADMINISTRACIÓN (admin.html)
   ========================================================================== */
function $(id) { return document.getElementById(id); }
function getFormValue(form, name) { return form.elements[name]?.value || ""; }
function setFormValue(form, name, value) {
  if (form.elements[name]) form.elements[name].value = value || "";
}

function showLoader(text) {
  $("loaderText").innerText = text;
  $("loaderOverlay").style.display = "flex";
}
function hideLoader() {
  $("loaderOverlay").style.display = "none";
}

function openAddModal() { $("addModal").style.display = "flex"; }
function closeAddModal() {
  $("addForm").reset();
  $("addPreviewContainer").innerHTML = "";
  $("addPreviewContainer").classList.add("hidden");
  $("addUploadContainer").classList.remove("hidden");
  base64Images = [];
  $("addModal").style.display = "none";
}

function openManageModal() { $("manageModal").style.display = "flex"; resetManage(); }
function closeManageModal() { $("manageModal").style.display = "none"; resetManage(); }

function openConfirmModal(type) {
  if(!currentItem) return;
  const isDelete = type === "delete";
  $("confirmTitle").innerText = isDelete ? "Confirmar eliminación" : "Confirmar prenda vendida";
  $("confirmText").innerText = `${currentItem.sku} - ${currentItem.equipo || "Sin equipo"}`;
  $("confirmActionBtn").onclick = () => submitSkuAction(isDelete ? "markDeleted" : "markSold");
  $("confirmModal").style.display = "flex";
}
function closeConfirmModal() { $("confirmModal").style.display = "none"; }

function showActions() {
  $("updateBtn").classList.remove("hidden");
  $("soldBtn").classList.remove("hidden");
  $("deleteBtn").classList.remove("hidden");
}
function hideActions() {
  $("updateBtn").classList.add("hidden");
  $("soldBtn").classList.add("hidden");
  $("deleteBtn").classList.add("hidden");
  $("confirmUpdateBtn").classList.add("hidden");
  $("confirmUpdateBtn").disabled = true;
}

// Gestión de Drag & Drop para imágenes en Administración
function setupDragAndDrop() {
    const dropZone = $("addUploadContainer");
    const fileInput = $("addFileInput");
    if(!dropZone || !fileInput) return;

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      if(e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener("change", (e) => {
      if(e.target.files.length) handleFiles(e.target.files);
    });
}

let base64Images = [];
let editImages = [];
function handleFiles(files, options = {}) {
  const images = options.images || base64Images;
  const container = $(options.previewId || "addPreviewContainer");
  const uploadContainer = $(options.uploadId || "addUploadContainer");

  if (uploadContainer) uploadContainer.classList.add("hidden");
  container.classList.remove("hidden");
  Array.from(files).forEach(file => {
    if(!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      images.push({ type: file.type, base64: e.target.result });
      const img = document.createElement("img");
      img.src = e.target.result;
      img.className = "preview-img";
      container.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

async function postData(payload) {
  const response = await fetch(WEB_APP_URL, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return await response.json();
}

async function submitAdd(e) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type='submit']");
  btn.disabled = true;
  showLoader("Guardando nueva prenda...");

  const form = e.target;
  const payload = {
    action: "addItem",
    equipo: getFormValue(form, "equipo"),
    year: getFormValue(form, "year"),
    precio: getFormValue(form, "precio"),
    talla: getFormValue(form, "talla"),
    tipo: getFormValue(form, "tipo"),
    disponible: form.elements.venta?.checked || false,
    venta: form.elements.venta?.checked || false,
    notas: getFormValue(form, "notas"),
    detalles: getFormValue(form, "notas"),
    images: base64Images
  };

  try {
    const result = await postData(payload);
    if(result.success) {
      alert("Prenda agregada con éxito. SKU asignado: " + result.sku);
      closeAddModal();
    } else {
      alert("Error del servidor: " + result.error);
    }
  } catch(error) {
    console.error(error);
    alert("Error de red al intentar conectar con la base de datos.");
  }
  hideLoader();
  btn.disabled = false;
  base64Images = [];
}

async function lookupSku() {
  const sku = $("lookupSku").value.trim();
  if(!sku) return;
  showLoader("Buscando SKU...");
  resetManageExceptSku();

  try {
    const result = await getJsonp({ action: 'getSku', sku });
    
    if(result.success && result.item) {
      currentItem = result.item;
      showSkuSummary(result.item);
      populateEditForm(result.item);
      showActions();
    } else {
      $("manageStatus").innerText = "SKU no encontrado o error: " + (result.error || "Desconocido");
    }
  } catch(error) {
    console.error(error);
    $("manageStatus").innerText = "Error de red al buscar el SKU.";
  }
  hideLoader();
}

function showSkuSummary(item) {
  const div = $("skuSummary");
  div.innerHTML = `
    <h4 style="margin-top:0;">Resumen Actual:</h4>
    <img src="${item.imagen || 'image_unavailable.png'}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; margin-bottom:8px;">
    <p><strong>Prenda:</strong> ${item.equipo || '-'} '${item.year || '-'}</p>
    <p><strong>Precio:</strong> Q${item.precio || '-'} | <strong>Talla:</strong> ${item.talla || '-'}</p>
    <p><strong>Estado:</strong> ${item.estado || '-'}</p>
  `;
  div.classList.remove("hidden");
}

function populateEditForm(item) {
  const form = $("editForm");
  setFormValue(form, "equipo", item.equipo);
  setFormValue(form, "year", item.year);
  setFormValue(form, "precio", item.precio);
  setFormValue(form, "talla", item.talla);
  setFormValue(form, "tipo", item.tipo);
  setFormValue(form, "notas", item.notas || item.detalles);
  if (form.elements.venta) {
    form.elements.venta.checked = item.disponible === true || String(item.disponible).toUpperCase() === "SÍ";
  }
  $("editImagePreview").src = item.imagen || "image_unavailable.png";
  
  editDirty = false;
}

function markEditDirty() { editDirty = true; }
function showEditForm() {
  $("editForm").classList.remove("hidden");
  $("updateBtn").classList.add("hidden");
  $("confirmUpdateBtn").classList.remove("hidden");
  $("confirmUpdateBtn").disabled = false;
}

function confirmUpdate() {
  $("editForm").requestSubmit();
}

async function submitEdit(e) {
  e.preventDefault();
  if(!currentItem) return;
  if(!editDirty) { alert("No has realizado cambios para guardar."); return; }

  const btn = e.target.querySelector("button[type='submit']") || $("confirmUpdateBtn");
  btn.disabled = true;
  showLoader("Modificando valores...");

  const payload = {
    action: "updateItem",
    sku: currentItem.sku,
    equipo: getFormValue(e.target, "equipo"),
    year: getFormValue(e.target, "year"),
    precio: getFormValue(e.target, "precio"),
    talla: getFormValue(e.target, "talla"),
    tipo: getFormValue(e.target, "tipo"),
    disponible: e.target.elements.venta?.checked || false,
    venta: e.target.elements.venta?.checked || false,
    notas: getFormValue(e.target, "notas"),
    detalles: getFormValue(e.target, "notas"),
    images: editImages
  };

  try {
    const result = await postData(payload);
    if(result.success) {
      alert("Prenda modificada con éxito.");
      closeManageModal();
    } else {
      alert("Error: " + result.error);
    }
  } catch(error) {
    console.error(error);
    alert("Error de red guardando los cambios.");
  }
  hideLoader();
  btn.disabled = false;
}

async function submitSkuAction(action){
  if(!currentItem) return;
  const btn = $("confirmActionBtn");
  btn.disabled = true;
  showLoader("Procesando...");
  
  try{
    const result = await postData({action, sku:currentItem.sku});
    if(result.success){
      alert("SKU actualizado correctamente.");
      closeConfirmModal();
      closeManageModal();
    }else{
      alert("Error: " + result.error);
    }
  }catch(error){
    console.error(error);
    alert("Error de red actualizando el SKU.");
  }
  
  hideLoader();
  btn.disabled = false;
}

function resetManage(){
  currentItem = null;
  editDirty = false;
  $("lookupSku").value = "";
  $("manageStatus").innerText = "";
  $("skuSummary").innerHTML = "";
  $("skuSummary").classList.add("hidden");
  $("editForm").reset();
  $("editForm").classList.add("hidden");
  $("editPreviewContainer").innerHTML = "";
  $("editPreviewContainer").classList.add("hidden");
  $("editUploadContainer").classList.remove("hidden");
  editImages = [];
  hideActions();
}

function resetManageExceptSku(){
  currentItem = null;
  editDirty = false;
  $("manageStatus").innerText = "";
  $("skuSummary").innerHTML = "";
  $("skuSummary").classList.add("hidden");
  $("editForm").reset();
  $("editForm").classList.add("hidden");
  $("editPreviewContainer").innerHTML = "";
  $("editPreviewContainer").classList.add("hidden");
  $("editUploadContainer").classList.remove("hidden");
  editImages = [];
  hideActions();
}

function setupAdminForms() {
  $("addForm")?.addEventListener("submit", submitAdd);
  $("editForm")?.addEventListener("submit", submitEdit);
  $("editForm")?.addEventListener("input", markEditDirty);
  $("editForm")?.addEventListener("change", markEditDirty);
  $("editFileInput")?.addEventListener("change", (e) => {
    if(e.target.files.length) {
      handleFiles(e.target.files, {
        images: editImages,
        previewId: "editPreviewContainer",
        uploadId: "editUploadContainer"
      });
      markEditDirty();
    }
  });
}
