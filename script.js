const cartStorageKey = "belleza.cart";
const cart = readCart();

const searchBar = document.getElementById("searchBar");
const searchInput = document.getElementById("searchInput");
const productGrid = document.getElementById("productGrid");
const cartPanel = document.getElementById("cartPanel");
const overlay = document.getElementById("overlay");
let productCards = [];
let products = [];
let wishlist = window.BELLEZAStore.getWishlist();

function readCart() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(cartStorageKey) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((item) =>
      item &&
      typeof item.id === "string" &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 99
    );
  } catch (error) {
    console.error("Could not restore the BELLEZA cart.", error);
    return [];
  }
}

function saveCart() {
  sessionStorage.setItem(cartStorageKey, JSON.stringify(cart));
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value);
  return element.innerHTML;
}

function renderProducts() {
  productGrid.innerHTML = products.map((product) => {
    const category = window.BELLEZAStore.categories.find((item) => item.value === product.category);
    const categoryLabel = category ? category.label : product.category;
    return `
      <article class="product-card" data-category="${escapeHtml(product.category)}" data-name="${escapeHtml(product.name)}">
        <button class="favorite${wishlist.includes(product.id) ? " active" : ""}" data-product-id="${escapeHtml(product.id)}" aria-label="${wishlist.includes(product.id) ? "Remove " + escapeHtml(product.name) + " from wishlist" : "Add " + escapeHtml(product.name) + " to wishlist"}">${wishlist.includes(product.id) ? "♥" : "♡"}</button>
        <div class="product-image">
          ${product.badge ? `<span class="badge">${escapeHtml(product.badge)}</span>` : ""}
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
        </div>
        <div class="product-info">
          <div><p class="product-category">${escapeHtml(categoryLabel)}</p><h3>${escapeHtml(product.name)}</h3></div>
          <p class="price">${window.BELLEZAStore.formatPrice(product.price)}</p>
        </div>
        <button class="add-button" data-product-id="${escapeHtml(product.id)}">Add to cart</button>
      </article>
    `;
  }).join("");
  productCards = [...document.querySelectorAll(".product-card")];
  bindProductActions();
  applyFilters();
  updateWishlistCount();
}

async function loadProducts() {
  try {
    products = await window.BELLEZAStore.getProducts();
    renderProducts();
    renderCart();
  } catch (error) {
    productGrid.innerHTML = '<p class="empty-cart">Products could not be loaded. Please try again later.</p>';
    console.error("Could not load BELLEZA products.", error);
  }
}

function bindProductActions() {
  document.querySelectorAll(".favorite").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      wishlist = wishlist.includes(productId)
        ? wishlist.filter((id) => id !== productId)
        : [...wishlist, productId];
      window.BELLEZAStore.saveWishlist(wishlist);
      renderProducts();
    });
  });
  document.querySelectorAll(".add-button").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.dataset.productId;
      const existing = cart.find((item) => item.id === productId);
      if (existing) {
        existing.quantity = Math.min(existing.quantity + 1, 99);
      } else {
        cart.push({ id: productId, quantity: 1 });
      }
      saveCart();
      renderCart();
      openCart();
    });
  });
}

function renderFilters() {
  const filters = document.querySelector(".filters");
  filters.innerHTML = '<button class="filter active" data-filter="all">All</button>' +
    window.BELLEZAStore.categories.map((category) =>
      `<button class="filter" data-filter="${escapeHtml(category.value)}">${escapeHtml(category.label)}</button>`
    ).join("");
  filters.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      filters.querySelector(".filter.active").classList.remove("active");
      button.classList.add("active");
      applyFilters();
    });
  });
}

function updateWishlistCount() {
  const count = document.getElementById("wishlistCount");
  if (count) count.textContent = wishlist.length;
  const headerCount = document.getElementById("headerWishlistCount");
  if (headerCount) headerCount.textContent = wishlist.length;
}

renderFilters();
loadProducts();
updateWishlistCount();

document.getElementById("searchToggle").addEventListener("click", () => {
  searchBar.classList.toggle("open");
  if (searchBar.classList.contains("open")) searchInput.focus();
});
document.getElementById("searchClose").addEventListener("click", () => {
  searchBar.classList.remove("open");
  searchInput.value = "";
  applyFilters();
});

function applyFilters() {
  const activeCategory = document.querySelector(".filter.active").dataset.filter;
  const query = searchInput.value.trim().toLowerCase();
  productCards.forEach((card) => {
    const categoryMatches = activeCategory === "all" || card.dataset.category === activeCategory;
    const searchMatches = !query || card.dataset.name.toLowerCase().includes(query);
    card.classList.toggle("hidden", !(categoryMatches && searchMatches));
  });
}
searchInput.addEventListener("input", applyFilters);

function openCart() {
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
  overlay.classList.add("open");
}
function closeCart() {
  cartPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
  overlay.classList.remove("open");
}
document.getElementById("cartToggle").addEventListener("click", openCart);
document.getElementById("cartClose").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);

function renderCart() {
  const count = cart.reduce((total, item) => total + item.quantity, 0);
  document.getElementById("cartCount").textContent = count;
  document.getElementById("cartTitleCount").textContent = `(${count})`;
  const cartItems = document.getElementById("cartItems");
  if (!count) {
    cartItems.innerHTML = '<p class="empty-cart">Your cart is currently empty.</p>';
  } else {
    cartItems.innerHTML = cart.map((item, index) => {
      const product = products.find((candidate) => candidate.id === item.id);
      return `
      <div class="cart-row">
        <div><h3>${escapeHtml(product?.name || "Unavailable product")}</h3><p>${product ? window.BELLEZAStore.formatPrice(product.price) : "No longer available"} · Qty ${item.quantity}</p></div>
        <button class="remove-item" data-index="${index}" aria-label="Remove ${escapeHtml(product?.name || "unavailable product")}">×</button>
      </div>
    `;
    }).join("");
  }
  document.getElementById("subtotal").textContent = window.BELLEZAStore.formatPrice(
    cart.reduce((sum, item) => {
      const product = products.find((candidate) => candidate.id === item.id);
      return sum + (product ? Number(product.price) * item.quantity : 0);
    }, 0)
  );
  document.querySelectorAll(".remove-item").forEach((button) => {
    button.addEventListener("click", () => {
      cart.splice(Number(button.dataset.index), 1);
      saveCart();
      renderCart();
    });
  });
}

document.getElementById("checkoutButton").addEventListener("click", () => {
  if (!cart.length) return;
  saveCart();
  window.location.href = "checkout.html";
});

document.getElementById("newsletter").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("email");
  const label = event.currentTarget.querySelector("label");
  label.textContent = "Thank you — you're on the list.";
  input.value = "";
});
