/* ==========================================================================
   1. CONFIGURACIÓN Y VARIABLES GLOBALES (Compartidas por los html)
   ========================================================================== */
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyobnIVz9rLnotfsSGJA7TmOFpla9VXqBL5UbAEvKsdzxVCCdFkj1KI-gQayOUlhGEMpA/exec"; 
const WS_NUMBER = "+50258656376"; // Número de WhatsApp de la tienda

let allItems = [], filteredItems = [];
let currentPage = 1;
let itemsPerPage = 24; 
let currentCategory = "Todas las Prendas"; // Estado de la categoría seleccionada
let currentItem = null;
let editDirty = false;
let addImages = [];
let editImages = [];

// Helper para seleccionar elementos como en jQuery
const $ = (id) => document.getElementById(id);

/* ==========================================================================
   2. ENRUTADOR AUTOMÁTICO (Detecta la página actual al cargar)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    setupSideMenu();

    // Si el body tiene la clase de la tienda (index.html)
    if (document.body.classList.contains('index-page')) {
        setupCategoryButtons(); 
        loadInventory(); 
        
        // Listener para cerrar modal de producto al hacer clic afuera
        window.addEventListener('click', function(e) {
            const modal = $('productModal');
            if (e.target === modal) {
                closeProductModal();
            }
        });
    } 
    // Si el body tiene la clase de administración (admin.html)
    else if (document.body.classList.contains('admin-page')) {
        setupDragAndDrop();
        setupAdminForms();
    } 
    // Si el body tiene la clase de producto individual (product.html)
    else if (document.body.classList.contains('product-page')) {
        loadProductPage();
    }
});

function setupSideMenu() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSideMenu();
  });
}

function openSideMenu() {
  const menu = $('sideMenu');
  const overlay = $('sideMenuOverlay');
  const toggle = document.querySelector('.menu-toggle');
  if (!menu || !overlay) return;

  menu.classList.add('open');
  overlay.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
  toggle?.setAttribute('aria-expanded', 'true');
}

function closeSideMenu() {
  const menu = $('sideMenu');
  const overlay = $('sideMenuOverlay');
  const toggle = document.querySelector('.menu-toggle');
  if (!menu || !overlay) return;

  menu.classList.remove('open');
  overlay.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  toggle?.setAttribute('aria-expanded', 'false');
}

// Configura los clics en el acordeón del menú lateral
function setupCategoryButtons() {
  const buttons = document.querySelectorAll('.accordion-content a');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remover emojis (como el 🔥) y limpiar espacios para tener el nombre real
      let text = btn.innerText.replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, "").trim();
      selectCategory(text);
    });
  });
}

/* ==========================================================================
   3. LÓGICA PARA LA TIENDA PRINCIPAL (index.html)
   ========================================================================== */
function showInventoryError(message) {
  $('resultCount').innerText = 'Hubo un error al cargar el inventario.';
  $('catalogGrid').innerHTML = `<div class="loading">${message}</div>`;
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
      : 'Una disculpa. Hubo un problema conectando con la base de datos.';
    showInventoryError(message);
  }
}

function changePage(delta) {
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  currentPage += delta;
  
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;
  
  render();
  $('resultCount').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function cleanText(str) {
  return String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function applyFilters() {
  const search = $('searchInput').value.toLowerCase().trim();
  const size = $('sizeFilter').value;
  const type = $('typeFilter').value;
  const onlyAvail = true;
  const sort = $('sortOrder').value;

  filteredItems = allItems.filter(item => {
    // Filtros básicos
    const matchesSearch = !search || String(item.sku).toLowerCase().includes(search) || String(item.equipo).toLowerCase().includes(search);
    const matchesSize = !size || String(item.talla) === size;
    const matchesType = !type || String(item.tipo) === type;
    const isDisponible = item.disponible === true || String(item.disponible).toUpperCase() === 'SÍ';
    const matchesAvail = !onlyAvail || isDisponible;

    // Lógica de Categorías (Filtrado Inteligente)
    let matchesCategory = true;
    if (currentCategory !== "Todas las Prendas") {
      
      // Limpiamos la categoría seleccionada (quitamos espacios y tildes para comparar)
      const selectedCatClean = cleanText(currentCategory).replace(/\s+/g, '');

      // Caso especial: Ofertas
      if (selectedCatClean === "ofertas") {
        const oferta = item.precioOferta || item.Precio_Oferta;
        matchesCategory = (oferta !== undefined && oferta !== null && oferta !== "" && oferta !== 0);
      } 
      else {
        // Limpiamos el valor del item (quitamos espacios y tildes)
        const itemRegionRaw = item.tipoRegion || item.tipo_region || item.Tipo_Region || item.TipoRegion || "";
        const itemRegionClean = cleanText(itemRegionRaw).replace(/\s+/g, '');

        if (selectedCatClean === "selecciones") {
          matchesCategory = (itemRegionClean === "seleccion" || itemRegionClean === "selecciones");
        } 
        else if (selectedCatClean === "equiposeuropeos" || selectedCatClean === "europa") {
          matchesCategory = (itemRegionClean === "europa" || itemRegionClean === "equiposeuropeos");
        } 
        // Aquí detectará "conmebol/concacaf" aunque el usuario elija "Conmebol / Concacaf"
        else if (selectedCatClean === "conmebol/concacaf") {
          matchesCategory = (itemRegionClean === "conmebol/concacaf");
        } 
        else {
          matchesCategory = (itemRegionClean === selectedCatClean || itemRegionClean.includes(selectedCatClean));
        }
      }
    }

    return matchesSearch && matchesSize && matchesType && matchesAvail && matchesCategory;
  });

  // Ordenamiento
  if (sort === 'p-low') filteredItems.sort((a, b) => Number(a.precio) - Number(b.precio));
  if (sort === 'p-high') filteredItems.sort((a, b) => Number(b.precio) - Number(a.precio));
  if (sort === 'az') filteredItems.sort((a, b) => a.equipo.localeCompare(b.equipo));

  currentPage = 1;
  render();
}

function render() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  if (filteredItems.length === 0) {
    document.getElementById('resultCount').innerText = '0 resultados';
    grid.innerHTML = '<div class="loading">No se encontraron resultados en esta categoría.</div>';
    document.getElementById('paginationControls').style.display = 'none';
    return;
  }

  document.getElementById('resultCount').innerText = `${filteredItems.length} prendas encontradas`;

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const pageItems = filteredItems.slice(start, end);

  grid.innerHTML = pageItems.map(item => {
    const images = getProductImages(item);
    
    // Lógica para mostrar Precio Normal vs Oferta
    const oferta = item.precioOferta || item.Precio_Oferta;
    const hasSale = oferta !== undefined && oferta !== null && String(oferta).trim() !== "" && Number(oferta) !== 0;
    
    const priceHTML = hasSale 
        ? `<span style="text-decoration: line-through; color: #9eb1ca; font-size: 14px; margin-right: 6px;">Q${item.precio}</span>Q${oferta}`
        : `Q${item.precio}`;

    // Lógica para el botón directo de WhatsApp
    const wsMessage = `¡Hola! Me interesa la camisola de ${item.equipo} (Talla: ${item.talla}, SKU: ${item.sku}) que vi en su catálogo web. ¿Está disponible?`;
    const wsUrl = `https://wa.me/${WS_NUMBER.replace('+', '')}?text=${encodeURIComponent(wsMessage)}`;

    return `
      <div class="product-card" onclick="window.location.href='product.html?sku=${item.sku}'" style="cursor:pointer; border: 1px solid #1f3350; border-radius: 12px; overflow: hidden; background: #0a1728; transition: transform 0.2s;">        <div class="product-image-wrapper" style="width: 100%; height: 280px; overflow: hidden; background: #07111f;">
          <img src="${images[0]}" alt="${item.equipo}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
        <div class="product-info" style="padding: 15px;">
          <div class="product-sku" style="color: #9eb1ca; font-size: 12px; margin-bottom: 5px;">${item.sku}</div>
          <h3 class="product-title" style="color: #fff; margin-bottom: 5px; font-size: 16px;">${item.equipo}</h3>
          <div class="product-meta" style="color: #d9e5f5; font-size: 13px; margin-bottom: 10px;">Talla: ${item.talla} | ${item.tipo}</div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
            <div class="product-price" style="color: #2490ff; font-size: 18px; font-weight: bold;">
              ${priceHTML}
            </div>
            <a href="${wsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" aria-label="Consultar por WhatsApp" style="display: flex; align-items: center; justify-content: center; background: #25D366; border-radius: 8px; width: 34px; height: 34px; flex-shrink: 0; transition: opacity 0.2s;">
              <img src="whatsapp_logo.png" alt="WhatsApp" style="width: 20px; height: 20px;">
            </a>
          </div>

        </div>
      </div>
    `;
  }).join('');

  if (totalPages > 1) {
    document.getElementById('paginationControls').style.display = 'flex';
    document.getElementById('pageIndicator').innerText = `Página ${currentPage} de ${totalPages}`;
    document.getElementById('prevPageBtn').disabled = (currentPage === 1);
    document.getElementById('nextPageBtn').disabled = (currentPage === totalPages);
  } else {
    document.getElementById('paginationControls').style.display = 'none';
  }
}

/* ==========================================================================
   NUEVAS FUNCIONES: NAVEGACIÓN DE CUADROS DE CATEGORÍAS (index.html)
   ========================================================================== */
function selectCategory(categoryName) {
  if (categoryName.toLowerCase() === "todas las prendas") {
    currentCategory = "Todas las Prendas";
  } else {
    currentCategory = categoryName;
  }

  const titleEl = $('currentCategoryTitle');
  if (titleEl) titleEl.innerText = currentCategory;

  $('categoryGrid').style.display = 'none';
  $('inventorySection').style.display = 'block';

  // Ocultar o mostrar el cintillo superior de imágenes
  const slider = document.querySelector('.slider-container');
  if (slider) {
    if (currentCategory === "Todas las Prendas") {
      slider.style.display = "block";
    } else {
      slider.style.display = "none";
    }
  }

  applyFilters();
}

function backToCategories() {
  $('categoryGrid').style.display = 'grid';
  $('inventorySection').style.display = 'none';

  const slider = document.querySelector('.slider-container');
  if (slider) slider.style.display = "block";
  
  // Limpiar filtros al regresar por comodidad del usuario
  $('searchInput').value = '';
  $('sizeFilter').value = '';
  $('typeFilter').value = '';
  $('sortOrder').value = 'none';
}

/* ==========================================================================
   4. MODAL DETALLADO DE PRODUCTOS (index.html)
   ========================================================================== */
function openProductModal(item) {
  const modal = $('productModal');
  if (!modal) return;

  const images = getProductImages(item);
  $('modalTitle').innerText = item.equipo;
  $('modalPrice').innerText = `Q${item.precio}`;
  $('modalSize').innerText = item.talla;
  $('modalType').innerText = item.tipo;
  $('modalSku').innerText = item.sku;
  $('modalNotes').innerText = item.notas || 'Sin descripción adicional.';

  const mainImg = $('modalMainImage');
  mainImg.src = images[0];

  const thumbsContainer = $('modalThumbnails');
  thumbsContainer.innerHTML = '';

  if (images.length > 1) {
    images.forEach((src, idx) => {
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.style.cssText = "width:60px; height:60px; object-fit:contain; border:2px solid #1f3350; border-radius:8px; cursor:pointer; background:#0a1728; flex-shrink:0;";
      if (idx === 0) thumb.style.borderColor = "#2490ff";
      
      thumb.onclick = () => {
        mainImg.src = src;
        Array.from(thumbsContainer.children).forEach(t => t.style.borderColor = "#1f3350");
        thumb.style.borderColor = "#2490ff";
      };
      thumbsContainer.appendChild(thumb);
    });
    thumbsContainer.style.display = 'flex';
  } else {
    thumbsContainer.style.display = 'none';
  }

  // Generar enlace estructurado para WhatsApp
  const message = `¡Hola! Me interesa la camisola de ${item.equipo} (Talla: ${item.talla}, SKU: ${item.sku}) que vi en su catálogo web. ¿Está disponible?`;
  $('modalWsBtn').href = `https://wa.me/${WS_NUMBER.replace('+', '')}?text=${encodeURIComponent(message)}`;
  $('modalFullPageBtn').href = getProductUrl(item.sku);

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  const modal = $('productModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

/* ==========================================================================
   5. VISTA DE PRODUCTO INDIVIDUAL (product.html)
   ========================================================================== */
async function loadProductPage() {
  const params = new URLSearchParams(window.location.search);
  const sku = params.get('sku');
  
  if (!sku) {
    showProductPageError("No se especificó ningún SKU en la dirección web. Por favor, selecciona una prenda desde el catálogo.");
    return;
  }

  try {
    const response = await getJsonp({ action: 'getSku', sku: sku });
    
    // Extract the item object securely
    if (!response || response.success === false || !response.item) {
      showProductPageError("La camisola solicitada no existe, fue eliminada o ya fue vendida.");
      return;
    }
    
    const itemData = response.item;
    const images = getProductImages(itemData);
    
    // Using || '' ensures that if a field is blank, it doesn't print "undefined"
    $('productTitle').innerText = itemData.equipo || 'Equipo Desconocido';
    $('productSize').innerText = itemData.talla || 'N/A';
    $('productType').innerText = itemData.tipo || 'N/A';
    $('productSku').innerText = itemData.sku || sku;
    $('productNotes').innerText = itemData.notas || 'Sin descripción adicional.';

    // Logic for regular price vs sale price
    const oferta = itemData.precioOferta || itemData.Precio_Oferta;
    const hasSale = oferta !== undefined && oferta !== null && String(oferta).trim() !== "" && Number(oferta) !== 0;
    
    if (hasSale) {
       $('productPrice').innerHTML = `<span style="text-decoration: line-through; color: #9eb1ca; font-size: 18px; margin-right: 10px;">Q${itemData.precio}</span>Q${oferta}`;
    } else {
       $('productPrice').innerHTML = `Q${itemData.precio || '0.00'}`;
    }

    const mainImg = $('mainProductImage');
    if (mainImg) {
        mainImg.src = images.length > 0 ? images[0] : 'placeholder.png'; // Prevents broken image icon
    }

    const thumbsContainer = $('productThumbnails');
    if (thumbsContainer) {
      thumbsContainer.innerHTML = '';
      if (images.length > 1) {
        images.forEach((src, idx) => {
          const thumb = document.createElement('img');
          thumb.src = src;
          thumb.className = "thumb-img" + (idx === 0 ? " active" : "");
          thumb.style.cssText = "width:70px; height:70px; object-fit:contain; border:2px solid #1f3350; border-radius:8px; cursor:pointer; background:#07111f; flex-shrink:0;";
          if (idx === 0) thumb.style.borderColor = "#2490ff";
          
          thumb.onclick = () => {
            mainImg.src = src;
            Array.from(thumbsContainer.children).forEach(t => t.style.borderColor = "#1f3350");
            thumb.style.borderColor = "#2490ff";
          };
          thumbsContainer.appendChild(thumb);
        });
      }
    }

    const message = `¡Hola! Me interesa la camisola de ${itemData.equipo || ''} (Talla: ${itemData.talla || ''}, SKU: ${itemData.sku || sku}) que vi en su catálogo web. ¿Está disponible?`;
    const wsBtn = $('productWsLink');
    if (wsBtn) wsBtn.href = `https://wa.me/${WS_NUMBER.replace('+', '')}?text=${encodeURIComponent(message)}`;

    $('productPageLoader').style.display = 'none';
    $('productPageContent').style.display = 'grid';

  } catch (err) {
    showProductPageError("Error de conexión al cargar los datos de la prenda.");
  }
}

function showProductPageError(msg) {
  const loader = $('productPageLoader');
  if (loader) loader.innerHTML = `<div style="color:#ff4a4a; font-weight:600;">${msg}<br><br><a href="index.html" class="secondary-btn" style="text-decoration:none; display:inline-block; margin-top:10px;">← Volver al catálogo</a></div>`;
}

/* ==========================================================================
   6. PANEL DE ADMINISTRACIÓN (admin.html) - ENVÍOS POST Y BASE64
   ========================================================================== */
function showLoader(text) {
  $('loaderText').innerText = text || "Procesando...";
  $('loaderOverlay').classList.add('active');
}

function hideLoader() {
  $('loaderOverlay').classList.remove('active');
}

function setupDragAndDrop() {
  const pairs = [
    { zoneId: "addDropZone", fileId: "addFileInput", imagesArray: addImages, previewId: "addPreviewContainer", uploadId: "addUploadContainer" },
    { zoneId: "editDropZone", fileId: "editFileInput", imagesArray: editImages, previewId: "editPreviewContainer", uploadId: "editUploadContainer" }
  ];

  pairs.forEach(p => {
    const zone = $(p.zoneId);
    const input = $(p.fileId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files, p);
      }
    });
  });
}

function handleFiles(files, config) {
  const filesArray = Array.from(files);
  let loadedCount = 0;

  filesArray.forEach(file => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      // Redimensionar y comprimir la imagen en el canvas antes de mandarla
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 1200;

        if (width > height) {
          if (width > max_size) { height *= max_size / width; width = max_size; }
        } else {
          if (height > max_size) { width *= max_size / height; height = max_size; }
        }
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const base64Str = canvas.toDataURL('image/jpeg', 0.75);
        config.imagesArray.push({ base64: base64Str, name: file.name });
        
        loadedCount++;
        if (loadedCount === filesArray.length) {
          renderPreviews(config);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPreviews(config) {
  const container = $(config.previewId);
  const uploadBox = $(config.uploadId);
  if (!container) return;

  container.innerHTML = config.imagesArray.map((img, idx) => `
    <div class="preview-card" style="position:relative; display:inline-block; margin:5px;">
      <img src="${img.base64}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid #1f3350;">
      <span onclick="removeImageAt(${idx}, '${config.previewId}')" style="position:absolute; top:-6px; right:-6px; background:#ff4a4a; color:#fff; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; font-weight:bold;">&times;</span>
    </div>
  `).join('');

  if (config.imagesArray.length > 0) {
    container.classList.remove('hidden');
    uploadBox.classList.add('hidden');
  } else {
    container.classList.add('hidden');
    uploadBox.classList.remove('hidden');
  }
  markEditDirty();
}

function removeImageAt(index, previewContainerId) {
  if (previewContainerId === 'addPreviewContainer') {
    addImages.splice(index, 1);
    renderPreviews({ imagesArray: addImages, previewId: "addPreviewContainer", uploadId: "addUploadContainer" });
  } else {
    editImages.splice(index, 1);
    renderPreviews({ imagesArray: editImages, previewId: "editPreviewContainer", uploadId: "editUploadContainer" });
  }
}

function setupAdminForms() {
  $("addForm")?.addEventListener("submit", submitAdd);
  $("editForm")?.addEventListener("submit", submitEdit);
  $("editForm")?.addEventListener("input", markEditDirty);
  $("editForm")?.addEventListener("change", markEditDirty);
  $("editFileInput")?.addEventListener("change", (e) => {
    if(e.target.files.length) {
      handleFiles(e.target.files, { imagesArray: editImages, previewId: "editPreviewContainer", uploadId: "editUploadContainer" });
    }
  });
}

function markEditDirty() {
  editDirty = true;
  const confirmBtn = $("confirmUpdateBtn");
  if (confirmBtn) confirmBtn.disabled = false;
}

async function sendPostRequest(payload) {
  return fetch(WEB_APP_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function submitAdd(e) {
  e.preventDefault();
  const btn = e.submitter || document.querySelector("#addForm button[type='submit']");
  btn.disabled = true;
  showLoader("Subiendo camisola al inventario de Sheets...");

  const formData = new FormData(e.target);
  
  // Note: We changed action to 'addItem' to match code.gs
  // and added the missing year, precioOferta, and disponible fields.
  const payload = {
    action: "addItem", 
    equipo: formData.get("equipo"),
    year: formData.get("year"),
    precio: formData.get("precio"),
    precioOferta: formData.get("precio_oferta"),
    talla: formData.get("talla"),
    tipo: formData.get("tipo"),
    disponible: formData.get("venta") !== null, // Checkbox returns null if unchecked
    tipoRegion: formData.get("tipo_region"), // Matches the name in HTML
    notas: formData.get("notas"),
    images: addImages
  };

  try {
    await sendPostRequest(payload);
    alert("¡Prenda subida exitosamente con sus imágenes!");
    e.target.reset();
    addImages = [];
    renderPreviews({ imagesArray: addImages, previewId: "addPreviewContainer", uploadId: "addUploadContainer" });
    closeAddModal();
  } catch (err) {
    alert("Error de conexión al enviar.");
  }
  hideLoader();
  btn.disabled = false;
}

async function lookupSku() {
  // Convert search to uppercase to match how SKUs are stored
  const sku = $("lookupSku").value.trim().toUpperCase(); 
  if (!sku) return;

  showLoader("Buscando código SKU...");
  try {
    const response = await getJsonp({ action: 'getSku', sku: sku });
    
    // Check if the item was found correctly
    if (!response || response.success === false || !response.item) {
      $("manageStatus").innerText = "Código SKU no encontrado o hubo un error de conexión.";
      resetManageExceptSku();
    } else {
      const itemData = response.item; 
      currentItem = itemData;
      
      $("manageStatus").innerText = "Prenda cargada con éxito.";
      
      // Get images for the visual summary
      const images = getProductImages(itemData);
      const mainImage = images.length > 0 ? images[0] : 'placeholder.png';
      
      // Create a visual card similar to the product popup
      let summaryHtml = `
        <div style="display:flex; flex-wrap:wrap; gap:20px; background:#0a1728; padding:20px; border-radius:12px; border:1px solid #1f3350; margin-top:15px; margin-bottom:20px;">
          <div style="width: 140px; flex-shrink: 0; background: #07111f; padding: 10px; border-radius: 8px;">
            <img src="${mainImage}" style="width:100%; height:auto; object-fit:contain; border-radius:4px;">
          </div>
          <div style="flex:1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">
            <h3 style="color:#2490ff; margin:0 0 10px 0; font-size: 22px;">${itemData.equipo}</h3>
            <div style="font-size: 20px; font-weight: bold; color: #fff; margin-bottom: 15px;">Q${itemData.precio}</div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size:15px; color:#d9e5f5;">
              <div><strong>SKU:</strong> ${itemData.sku}</div>
              <div><strong>Talla:</strong> ${itemData.talla}</div>
              <div><strong>Tipo:</strong> ${itemData.tipo}</div>
              <div><strong>Disponibilidad:</strong> ${itemData.disponible ? 'SÍ' : 'NO'}</div>
              <div style="grid-column: 1 / -1;">
                <strong>Estado:</strong> 
                <span style="color: ${itemData.estado === 'Activo' ? '#25D366' : '#ff4a4a'}; font-weight: bold;">
                  ${itemData.estado || 'Activo'}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
      
      $("skuSummary").innerHTML = summaryHtml;
      $("skuSummary").classList.remove("hidden");

      // Fill the hidden edit form fields so "Actualizar" has the right data
      const form = $("editForm");
      form.sku.value = itemData.sku;
      form.equipo.value = itemData.equipo;
      form.year.value = itemData.year || ""; 
      form.precio.value = itemData.precio;
      form.precio_oferta.value = itemData.precioOferta || itemData.Precio_Oferta || ""; 
      form.talla.value = itemData.talla;
      form.tipo.value = itemData.tipo;
      form.venta.checked = itemData.disponible === true || String(itemData.disponible).toUpperCase() === 'SÍ'; 
      form.tipo_region.value = itemData.tipoRegion || itemData.tipo_region || itemData.Tipo_Region || itemData.TipoRegion || "";
      form.notas.value = itemData.notas || "";

      // Render image previews in the edit form
      const currentGallery = getProductImages(itemData);
      editImages = currentGallery.map(url => ({ base64: url, name: "url-source" }));
      renderPreviews({ imagesArray: editImages, previewId: "editPreviewContainer", uploadId: "editUploadContainer" });

      // Show the action buttons (Actualizar, Marcar Vendida, Eliminar)
      showActions();
    }
  } catch (err) {
    $("manageStatus").innerText = "Error de red al buscar el SKU.";
  }
  hideLoader();
}

function showActions() {
  $("updateBtn").classList.remove("hidden");
  $("soldBtn").classList.remove("hidden");
  $("deleteBtn").classList.remove("hidden");
  $("confirmUpdateBtn").classList.add("hidden");
  $("editForm").classList.add("hidden");
}

function hideActions() {
  $("updateBtn").classList.add("hidden");
  $("soldBtn").classList.add("hidden");
  $("deleteBtn").classList.add("hidden");
  $("confirmUpdateBtn").classList.add("hidden");
}

function showEditForm() {
  $("editForm").classList.remove("hidden");
  $("updateBtn").classList.add("hidden");
  $("confirmUpdateBtn").classList.remove("hidden");
  editDirty = false;
  $("confirmUpdateBtn").disabled = true;
}

async function confirmUpdate() {
  if (!editDirty) return;
  const btn = $("confirmUpdateBtn");
  btn.disabled = true;
  showLoader("Guardando cambios y procesando imágenes en el Excel...");

  const form = $("editForm");
  
  // Changed action to 'updateItem' to match code.gs
  // and added the missing year, precioOferta, and disponible fields.
  const payload = {
    action: "updateItem",
    sku: currentItem.sku, // The original SKU is sent so code.gs can find the correct row
    equipo: form.equipo.value,
    year: form.year.value,
    precio: form.precio.value,
    precioOferta: form.precio_oferta.value,
    talla: form.talla.value,
    tipo: form.tipo.value,
    disponible: form.venta.checked, // Retrieves true/false from the checkbox
    tipoRegion: form.tipo_region.value,
    notas: form.notas.value,
    images: editImages
  };

  try {
    await sendPostRequest(payload);
    alert("¡Los datos de la prenda se actualizaron correctamente!");
    closeManageModal();
  } catch (err) {
    alert("Error de conexión al procesar cambios.");
  }
  hideLoader();
  btn.disabled = false;
}

async function submitEdit(e) { e.preventDefault(); }

function openConfirmModal(type) {
  const modal = $("confirmModal");
  const title = $("confirmTitle");
  const text = $("confirmText");
  const actionBtn = $("confirmActionBtn");

  if (type === 'sold') {
    title.innerText = "Marcar Como Vendida";
    text.innerText = `¿Seguro que deseas marcar la camisola SKU: ${currentItem.sku} como VENDIDA? Se ocultará automáticamente de la tienda de clientes.`;
    actionBtn.onclick = () => executeStatusChange('markSold');
  } else if (type === 'delete') {
    title.innerText = "Eliminar Prenda";
    text.innerText = `¿Deseas dar de baja por completo la camisola SKU: ${currentItem.sku} de la base de datos de Google Sheets?`;
    actionBtn.onclick = () => executeStatusChange('markDeleted');
  }
  modal.style.display = 'flex';
}

function closeConfirmModal() {
  $("confirmModal").style.display = 'none';
}

async function executeStatusChange(actionType) {
  closeConfirmModal();
  showLoader("Modificando estado de la fila...");
  try {
    await sendPostRequest({ action: actionType, sku: currentItem.sku });
    alert("El estado de la prenda se modificó correctamente en Google Sheets.");
    closeManageModal();
  } catch (err) {
    alert("Error de red.");
  }
  hideLoader();
}

function openAddModal() { $("addModal").style.display = "flex"; }
function closeAddModal() { $("addModal").style.display = "none"; }
function openManageModal() { $("manageModal").style.display = "flex"; resetManage(); }
function closeManageModal() { $("manageModal").style.display = "none"; resetManage(); }

function resetManage() {
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

function resetManageExceptSku() {
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

function showProductPageError(msg) {
  const loader = document.getElementById('productPageLoader');
  if (loader) loader.style.display = 'none';
  
  const content = document.getElementById('productPageContent');
  if (content) {
    content.style.display = 'block';
    content.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #ff4d4d; background: #0a1728; border-radius: 12px; border: 1px solid #1f3350; grid-column: 1 / -1;">
        <h2 style="margin-bottom: 15px;">Error al cargar la prenda</h2>
        <p style="color: #d9e5f5; font-size: 16px; margin-bottom: 20px;">${msg}</p>
        <a href="index.html" class="secondary-btn" style="text-decoration: none; display: inline-block;">Volver al catálogo</a>
      </div>
    `;
  }
}
