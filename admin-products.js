const client = window.BELLEZA_SUPABASE;
const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const authMessage = document.getElementById("authMessage");
const adminPanel = document.getElementById("adminPanel");
const productForm = document.getElementById("productForm");
const productMessage = document.getElementById("productMessage");
const productsBody = document.getElementById("productsBody");
const catalogueMessage = document.getElementById("catalogueMessage");
const cataloguesBody = document.getElementById("cataloguesBody");
let products = [];
let editingId = null;

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showAuthMessage(message) {
  loginPanel.hidden = false;
  adminPanel.hidden = true;
  authMessage.textContent = message;
}

async function authorizeAdmin(user) {
  const { data, error } = await client
    .from("product_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      throw new Error(`This account is not authorized to manage products, and sign out failed: ${signOutError.message}`);
    }
    throw new Error("This account is not authorized to manage products.");
  }

  loginPanel.hidden = true;
  adminPanel.hidden = false;
  document.getElementById("adminIdentity").textContent = `Signed in as ${user.email}`;
  await loadProducts();
}

async function loadProducts() {
  productMessage.textContent = "Loading products…";
  const { data, error } = await client
    .from("products")
    .select("id,name,category,price,image,badge,sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  products = data;
  renderProducts();
  productMessage.textContent = "";
}

async function loadCatalogues() {
  catalogueMessage.textContent = "Loading catalogue submissions…";
  try {
    const { data, error } = await client
      .from("catalogues")
      .select("id,title,brand,category,season,product_count,description,email,files,created_at,submitter_id")
      .order("created_at", { ascending: false });
    if (error) {
      catalogueMessage.textContent = `Could not load catalogue submissions: ${error.message}`;
      return;
    }

    const unavailableFiles = [];
    const rows = await Promise.all(data.map(async (catalogue) => {
      const files = Array.isArray(catalogue.files) ? catalogue.files : [];
      const fileLinks = await Promise.all(files.map(async (file) => {
        if (!file || typeof file.path !== "string" || !file.path.startsWith(`${catalogue.submitter_id}/`)) {
          unavailableFiles.push(`${catalogue.title}: invalid file reference`);
          return `<span class="file-link unavailable">${escapeHtml(file?.name || "Invalid file reference")}</span>`;
        }

        try {
          const { data: signedFile, error: signedUrlError } = await client.storage
            .from("catalogues")
            .createSignedUrl(file.path, 3600);
          if (signedUrlError) throw signedUrlError;
          return `<a class="file-link" href="${escapeHtml(signedFile.signedUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.name || "Download file")}</a>`;
        } catch (signingError) {
          unavailableFiles.push(`${catalogue.title}: ${signingError.message}`);
          return `<span class="file-link unavailable">${escapeHtml(file.name || "File unavailable")}</span>`;
        }
      }));

      const submitted = new Date(catalogue.created_at);
      const dateLabel = Number.isNaN(submitted.getTime())
        ? "Unknown date"
        : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(submitted);
      const details = [
        catalogue.brand,
        catalogue.season,
        catalogue.product_count ? `${catalogue.product_count} products` : "",
        catalogue.description
      ].filter(Boolean).map(escapeHtml).join(" · ");

      return `<tr>
        <td><strong>${escapeHtml(catalogue.title)}</strong><span class="catalogue-details">${details}</span></td>
        <td>${escapeHtml(catalogue.email)}</td>
        <td>${escapeHtml(catalogue.category)}</td>
        <td>${dateLabel}</td>
        <td>${fileLinks.length ? fileLinks.join("") : '<span class="file-link unavailable">No files listed</span>'}</td>
        <td><a class="action-button" href="mailto:${encodeURIComponent(catalogue.email)}?subject=${encodeURIComponent(`BELLEZA catalogue: ${catalogue.title}`)}">Contact</a></td>
      </tr>`;
    }));

    document.getElementById("catalogueCount").textContent = `(${data.length})`;
    cataloguesBody.innerHTML = rows.length
      ? rows.join("")
      : '<tr><td class="empty-state" colspan="6">No catalogue submissions yet.</td></tr>';
    catalogueMessage.textContent = unavailableFiles.length
      ? `${unavailableFiles.length} file${unavailableFiles.length === 1 ? "" : "s"} could not be made available. First error: ${unavailableFiles[0]}`
      : "";
  } catch (error) {
    catalogueMessage.textContent = `Could not load catalogue submissions: ${error.message}`;
  }
}

document.querySelectorAll(".admin-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".admin-subpanel").forEach((panel) => {
      panel.hidden = panel.id !== tab.dataset.panel;
    });
    if (tab.dataset.panel === "cataloguesPanel") loadCatalogues();
  });
});

document.getElementById("refreshCataloguesButton").addEventListener("click", loadCatalogues);

function renderProducts() {
  document.getElementById("productCount").textContent = `(${products.length})`;
  productsBody.innerHTML = products.length ? products.map((product) => `
    <tr>
      <td><div class="product-cell"><img class="product-thumb" src="${escapeHtml(product.image)}" alt="" /><span>${escapeHtml(product.name)}</span></div></td>
      <td>${escapeHtml(product.category)}</td>
      <td>${window.BELLEZAStore.formatPrice(product.price)}</td>
      <td><div class="actions">
        <button class="action-button" type="button" data-edit="${escapeHtml(product.id)}">Edit</button>
        <button class="action-button delete" type="button" data-delete="${escapeHtml(product.id)}">Delete</button>
      </div></td>
    </tr>
  `).join("") : '<tr><td class="empty-state" colspan="4">No products yet. Add one to get started.</td></tr>';
}

function resetProductForm() {
  productForm.reset();
  productForm.hidden = true;
  editingId = null;
  document.getElementById("saveProductButton").textContent = "Save product";
}

document.getElementById("addProductButton").addEventListener("click", () => {
  resetProductForm();
  productForm.hidden = false;
  productForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  productForm.elements.name.focus();
});

document.getElementById("cancelProductButton").addEventListener("click", resetProductForm);

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(productForm);
  const image = new URL(values.get("image"));
  if (!["http:", "https:"].includes(image.protocol)) {
    productMessage.textContent = "Enter an image URL that begins with http:// or https://.";
    return;
  }

  const product = {
    id: editingId || `product-${crypto.randomUUID()}`,
    name: values.get("name").trim(),
    category: values.get("category"),
    price: Number(values.get("price")),
    badge: values.get("badge").trim(),
    image: image.href
  };

  productMessage.textContent = "Saving product…";
  const { error } = await client.from("products").upsert(product);
  if (error) {
    productMessage.textContent = `Could not save product: ${error.message}`;
    return;
  }

  productMessage.textContent = "Product saved.";
  resetProductForm();
  try {
    await loadProducts();
  } catch (loadError) {
    productMessage.textContent = `Product saved, but the product list could not be refreshed: ${loadError.message}`;
  }
});

productsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-edit], button[data-delete]");
  if (!button) return;

  const product = products.find((item) => item.id === (button.dataset.edit || button.dataset.delete));
  if (!product) return;

  if (button.dataset.edit) {
    editingId = product.id;
    productForm.elements.name.value = product.name;
    productForm.elements.category.value = product.category;
    productForm.elements.price.value = product.price;
    productForm.elements.badge.value = product.badge || "";
    productForm.elements.image.value = product.image;
    productForm.hidden = false;
    document.getElementById("saveProductButton").textContent = "Update product";
    productForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  if (!window.confirm(`Delete ${product.name}?`)) return;
  productMessage.textContent = "Deleting product…";
  const { error } = await client.from("products").delete().eq("id", product.id);
  if (error) {
    productMessage.textContent = `Could not delete product: ${error.message}`;
    return;
  }
  productMessage.textContent = "Product deleted.";
  try {
    await loadProducts();
  } catch (loadError) {
    productMessage.textContent = `Product deleted, but the product list could not be refreshed: ${loadError.message}`;
  }
});

document.getElementById("signOutButton").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();
  if (error) {
    productMessage.textContent = `Could not sign out: ${error.message}`;
    return;
  }
  productForm.reset();
  showAuthMessage("You have signed out.");
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authMessage.textContent = "Signing in…";
  const values = new FormData(loginForm);
  const { data, error } = await client.auth.signInWithPassword({
    email: values.get("email").trim(),
    password: values.get("password")
  });
  if (error) {
    authMessage.textContent = `Sign-in failed: ${error.message}`;
    return;
  }

  try {
    await authorizeAdmin(data.user);
  } catch (authorizationError) {
    showAuthMessage(authorizationError.message);
  }
});

async function initializeAdminPage() {
  if (window.BELLEZA_SUPABASE_ERROR) {
    loginForm.hidden = true;
    showAuthMessage(window.BELLEZA_SUPABASE_ERROR);
    return;
  }
  if (!client) {
    loginForm.hidden = true;
    showAuthMessage("Supabase is not configured. Add the project URL and public publishable key before using product administration.");
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    showAuthMessage(`Could not check the sign-in session: ${error.message}`);
    return;
  }
  if (!data.session) return;

  try {
    await authorizeAdmin(data.session.user);
  } catch (authorizationError) {
    showAuthMessage(authorizationError.message);
  }
}

initializeAdminPage();
