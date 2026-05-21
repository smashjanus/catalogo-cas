/* ==========================================================================
   1. CONFIGURACIÓN Y VARIABLES GLOBALES (Compartidas por los html)
   ========================================================================== */
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwec9_6ZQ9AX26x-5JkgOcIjyDpKhQrjBr9778eMgOJAbuY-yCQNTOuoJ83JqV_j98iJw/exec"; // Reemplaza por tu URL real si cambia
const WS_NUMBER = "+50258656376"; // Número de WhatsApp

let allItems = [], filteredItems = [];
let currentPage = 1;
let itemsPerPage = 24; // <-- Queda en 24 por defecto
let currentCategory = "Todas las Prendas"; // <-- Controla la categoría de la barra horizontal
let currentItem = null;
let editDirty = false;

/* ==========================================================================
   2. ENRUTADOR AUTOMÁTICO (Detecta la página actual al cargar)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    setupSideMenu();

    // Si el body tiene la clase de la tienda
    if (document.body.classList.contains('index-page')) {
        setupCategoryButtons(); // <-- Activamos los clics de las categorías horizontales
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
        setupDragAndDrop();
        setupAdminForms();
    } else if (document.body.classList.contains('product-page')) {
        loadProductPage();
    }
});

// Función nueva para controlar los botones de categorías y ocultar/mostrar el cintillo
function setupCategoryButtons() {
  const buttons = document.querySelectorAll('.cat-btn');
  const slider = document.querySelector('.slider-container');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Cambiar clase activa visualmente
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Guardar la categoría seleccionada
      currentCategory = btn.innerText.trim();

      // CONTROL DEL CINTILLO: Si es "Todas las Prendas" se muestra, si es otra se oculta
      if (slider) {
        if (currentCategory === "Todas las Prendas") {
          slider.style.display = "block";
        } else {
          slider.style.display = "none";
        }
      }

      // Aplicar los filtros inmediatamente
      applyFilters();
    });
  });
}

function setupSideMenu() {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSideMenu();
  });
}

function openSideMenu() {
  const menu = document.getElementById('sideMenu');
  const overlay = document.getElementById('sideMenuOverlay');
  const toggle = document.querySelector('.menu-toggle');
  if (!menu || !overlay) return;

  menu.classList.add('open');
  overlay.classList.add('open');
  menu.setAttribute('aria-hidden', 'false');
  toggle?.setAttribute('aria-expanded', 'true');
}

function closeSideMenu() {
  const menu = document.getElementById('sideMenu');
  const overlay = document.getElementById('sideMenuOverlay');
  const toggle = document.querySelector('.menu-toggle');
  if (!menu || !overlay) return;

  menu.classList.remove('open');
  overlay.classList.remove('open');
  menu.setAttribute('aria-hidden', 'true');
  toggle?.setAttribute('aria-expanded', 'false');
}

/* ==========================================================================
   3. LÓGICA PARA LA TIENDA PRINCIPAL (index.html)
   ========================================================================== */
function showInventoryError(message) {
  document.getElementById('resultCount').innerText = 'Hubo un error al cargar el inventario, una disculpa. Intenta nuevamente.';
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
      : 'Una disculpa. Hubo un problema conectando con la base de datos.';
    showInventoryError(message);
  }
}

// Eliminamos la lectura del selector "perPage" para que siempre use 24
function changePage(delta) {
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  currentPage += delta;
  
  if (currentPage < 1) currentPage = 1;
  if (currentPage > totalPages) currentPage = totalPages;
  
  render();
  document.getElementById('resultCount').scrollIntoView({ behavior: 'smooth', block: 'end' });
}

// Helper interno para limpiar acentos y espacios al comparar textos
function cleanText(str) {
  return String(str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function applyFilters(){
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const size = document.getElementById('sizeFilter').value;
  const type = document.getElementById('typeFilter').value;
  const onlyAvail = true; 
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

    // NUEVA LÓGICA: Filtro por la barra horizontal (Columna I - Tipo_Region)
    let matchesCategory = true;
    if (currentCategory !== "Todas las Prendas") {
      // Soportamos cualquier variación del nombre de la propiedad que devuelva el script de Google
      const itemRegion = cleanText(item.tipoRegion || item.tipo_region || item.Tipo_Region || item.TipoRegion);
      const selectedCatClean = cleanText(currentCategory);

      if (selectedCatClean === "selecciones") {
        // Valida tanto si pusiste "seleccion" o "selecciones" en tu Excel
        matchesCategory = (itemRegion === "seleccion" || itemRegion === "selecciones");
      } else {
        // Para "Europa", "Conmebol/Concacaf", "Otros" busca coincidencias directas
        matchesCategory = (itemRegion === selectedCatClean || itemRegion.includes(selectedCatClean));
      }
    }

    return matchesSearch && matchesSize && matchesType && matchesAvail && activeOnly && matchesCategory;
  });

  if (sort === 'p-low') filteredItems.sort((a, b) => Number(a.precio) - Number(b.precio));
  if (sort === 'p-high') filteredItems.sort((a, b) => Number(b.precio) - Number(a.precio));
  if (sort === 'az') filteredItems.sort((a, b) => a.equipo.localeCompare(b.equipo));

  currentPage = 1; 
  render();
}
