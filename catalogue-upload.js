const client = window.BELLEZA_SUPABASE;
const vendorAuth = document.getElementById("vendorAuth");
const vendorAuthForm = document.getElementById("vendorAuthForm");
const vendorAuthMessage = document.getElementById("vendorAuthMessage");
const catalogueForm = document.getElementById("catalogueForm");
const uploadStatus = document.getElementById("uploadStatus");
const fileInput = document.getElementById("catalogueFiles");
const dropZone = document.getElementById("dropZone");
const fileList = document.getElementById("fileList");
const productEntries = document.getElementById("productEntries");
const productEntryTemplate = document.getElementById("productEntryTemplate");
const maxFileSize = 20 * 1024 * 1024;
const allowedTypes = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  zip: "application/zip"
};
let selectedFiles = [];
let authMode = "signin";

function showAuthMessage(message) {
  vendorAuthMessage.textContent = message;
  vendorAuth.hidden = false;
  catalogueForm.hidden = true;
  document.getElementById("vendorSession").hidden = true;
}

function showUploadForm(user) {
  vendorAuth.hidden = true;
  document.getElementById("vendorSession").hidden = false;
  document.getElementById("vendorIdentity").textContent = `Signed in as ${user.email}`;
  catalogueForm.hidden = false;
  const email = catalogueForm.elements.email;
  if (!email.value) email.value = user.email || "";
  if (!productEntries.children.length) addProductEntry();
}

function updateAuthMode() {
  const signingUp = authMode === "signup";
  document.getElementById("vendorAuthSubmit").textContent = signingUp ? "Create account" : "Sign in";
  document.getElementById("toggleAuthMode").textContent = signingUp ? "Already have an account? Sign in" : "Create vendor account";
  document.getElementById("vendorPassword").autocomplete = signingUp ? "new-password" : "current-password";
  vendorAuthMessage.textContent = "";
}

document.getElementById("toggleAuthMode").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  updateAuthMode();
});

vendorAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  vendorAuthMessage.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";
  const values = new FormData(vendorAuthForm);
  const credentials = {
    email: values.get("email").trim(),
    password: values.get("password")
  };
  const result = authMode === "signup"
    ? await client.auth.signUp({
      ...credentials,
      options: { emailRedirectTo: window.location.href }
    })
    : await client.auth.signInWithPassword(credentials);

  if (result.error) {
    vendorAuthMessage.textContent = `Authentication failed: ${result.error.message}`;
    return;
  }
  if (authMode === "signup" && !result.data.session) {
    vendorAuthMessage.textContent = "Check your email to confirm your vendor account, then sign in.";
    return;
  }
  if (result.data.session) showUploadForm(result.data.user);
});

document.getElementById("vendorSignOutButton").addEventListener("click", async () => {
  const { error } = await client.auth.signOut();
  if (error) {
    uploadStatus.textContent = `Could not sign out: ${error.message}`;
    return;
  }
  catalogueForm.reset();
  selectedFiles = [];
  renderFiles();
  resetProductEntries();
  showAuthMessage("You have signed out.");
});

function populateCategoryOptions(select, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  window.BELLEZAStore.categories.forEach((category) => {
    select.add(new Option(category.label, category.value));
  });
}

function updateProductEntryNumbers() {
  [...productEntries.querySelectorAll("[data-product-entry]")].forEach((entry, index) => {
    entry.querySelector("[data-product-number]").textContent = String(index + 1);
    const removeButton = entry.querySelector("[data-remove-product]");
    removeButton.disabled = productEntries.children.length === 1;
    removeButton.setAttribute("aria-label", `Remove product ${index + 1}`);
  });
}

function addProductEntry() {
  if (productEntries.children.length >= 50) {
    uploadStatus.textContent = "A catalogue can include up to 50 products.";
    return;
  }
  const entry = productEntryTemplate.content.firstElementChild.cloneNode(true);
  populateCategoryOptions(entry.querySelector("[data-product-category]"), "Select a store category");
  entry.querySelector("[data-product-images]").addEventListener("change", (event) => {
    const files = [...event.currentTarget.files];
    const status = entry.querySelector("[data-image-selection]");
    if (!files.length) {
      status.textContent = "";
      return;
    }
    try {
      window.BELLEZAProductImages.validate(files);
      status.textContent = `${files.length} photo${files.length === 1 ? "" : "s"} selected.`;
    } catch (error) {
      event.currentTarget.value = "";
      status.textContent = error.message;
    }
  });
  entry.querySelector("[data-remove-product]").addEventListener("click", () => {
    entry.remove();
    updateProductEntryNumbers();
  });
  productEntries.append(entry);
  updateProductEntryNumbers();
}

function resetProductEntries() {
  productEntries.replaceChildren();
  addProductEntry();
}

document.getElementById("addProductEntryButton").addEventListener("click", addProductEntry);

document.getElementById("browseButton").addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => addFiles(fileInput.files));

["dragenter", "dragover"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((type) => {
  dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
});
dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

function addFiles(files) {
  const allowedExtension = /\.(pdf|jpe?g|png|zip)$/i;
  let rejected = 0;
  [...files].forEach((file) => {
    if (file.size <= maxFileSize && allowedExtension.test(file.name)) selectedFiles.push(file);
    else rejected++;
  });
  renderFiles(rejected);
  fileInput.value = "";
}

function formatSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderFiles(rejected = 0) {
  fileList.innerHTML = selectedFiles.map((file, index) => `
    <div class="file-row">
      <div class="file-details">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${formatSize(file.size)} · Ready to upload</span>
      </div>
      <button class="remove-file" type="button" data-index="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>
    </div>
  `).join("");
  const selection = `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`;
  uploadStatus.textContent = rejected
    ? `${selection}. ${rejected} file${rejected === 1 ? "" : "s"} skipped (unsupported type or over 20 MB).`
    : selectedFiles.length ? selection : "";
  fileList.querySelectorAll(".remove-file").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFiles.splice(Number(button.dataset.index), 1);
      renderFiles();
    });
  });
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "catalogue";
}

function getContentType(file) {
  if (file.type && Object.values(allowedTypes).includes(file.type)) return file.type;
  const extension = file.name.split(".").pop().toLowerCase();
  return allowedTypes[extension];
}

async function uploadSelectedFiles(user, submissionId, uploaded) {
  for (let index = 0; index < selectedFiles.length; index++) {
    const file = selectedFiles[index];
    const path = `${user.id}/${submissionId}/${index}-${safeFileName(file.name)}`;
    const { error } = await client.storage
      .from("catalogues")
      .upload(path, file, { upsert: false, contentType: getContentType(file) });
    if (error) throw error;
    uploaded.push({ name: file.name, path, size: file.size, type: getContentType(file) });
  }
}

async function uploadProductPhotos(user, products, uploaded) {
  for (const product of products) {
    product.images = await window.BELLEZAProductImages.upload(
      client,
      user.id,
      product.id,
      product.files
    );
    uploaded.push(...product.images);
    product.image = product.images[0].url;
    delete product.files;
  }
}

function readProductEntries() {
  return [...productEntries.querySelectorAll("[data-product-entry]")].map((entry) => {
    const files = [...entry.querySelector("[data-product-images]").files];
    window.BELLEZAProductImages.validate(files);
    return {
      id: `product-${crypto.randomUUID()}`,
      name: entry.querySelector("[data-product-name]").value.trim(),
      category: entry.querySelector("[data-product-category]").value,
      price: Number(entry.querySelector("[data-product-price]").value),
      badge: entry.querySelector("[data-product-badge]").value.trim(),
      files
    };
  });
}

catalogueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!productEntries.children.length) {
    uploadStatus.textContent = "Add at least one product before submitting the catalogue.";
    document.getElementById("addProductEntryButton").focus();
    return;
  }

  let products;
  try {
    products = readProductEntries();
  } catch (error) {
    uploadStatus.textContent = error.message;
    return;
  }

  const uploadedCatalogueFiles = [];
  const uploadedProductImages = [];
  const submitButton = catalogueForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  uploadStatus.textContent = "Uploading product photos and catalogue files…";
  let submissionState = "not-started";

  try {
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw new Error(`Could not verify your vendor session: ${sessionError.message}`);
    if (!sessionData.session) {
      showAuthMessage("Your vendor session has expired. Sign in again to submit a catalogue.");
      return;
    }

    const user = sessionData.session.user;
    const values = new FormData(catalogueForm);
    const submissionId = crypto.randomUUID();
    await uploadProductPhotos(user, products, uploadedProductImages);
    await uploadSelectedFiles(user, submissionId, uploadedCatalogueFiles);
    const catalogue = {
      id: `catalogue-${submissionId}`,
      title: values.get("title").trim(),
      brand: values.get("brand").trim(),
      category: values.get("category"),
      season: values.get("season").trim(),
      description: values.get("description").trim(),
      email: values.get("email").trim(),
      files: uploadedCatalogueFiles
    };
    submissionState = "pending";
    const { error } = await client.rpc("submit_catalogue_with_products", {
      p_catalogue: catalogue,
      p_products: products
    });
    submissionState = "complete";
    if (error) throw error;

    catalogueForm.reset();
    selectedFiles = [];
    renderFiles();
    resetProductEntries();
    uploadStatus.textContent = `${products.length} product${products.length === 1 ? "" : "s"} added to the storefront. Catalogue submitted for review.`;
  } catch (error) {
    if (submissionState === "pending") {
      uploadStatus.textContent = `Could not confirm the submission: ${error.message}. Refresh the storefront and seller panel before retrying; uploaded photos were kept to avoid breaking a submission that may have succeeded.`;
    } else {
      const cleanupErrors = [];
      try {
        await window.BELLEZAProductImages.remove(client, uploadedProductImages);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError.message);
      }
      if (uploadedCatalogueFiles.length) {
        const { error: cleanupError } = await client.storage
          .from("catalogues")
          .remove(uploadedCatalogueFiles.map((file) => file.path));
        if (cleanupError) cleanupErrors.push(`Catalogue files could not be removed: ${cleanupError.message}`);
      }
      uploadStatus.textContent = cleanupErrors.length
        ? `Submission failed: ${error.message}. ${cleanupErrors.join(" ")}`
        : `Submission failed: ${error.message}. Uploaded files were removed.`;
    }
  } finally {
    submitButton.disabled = false;
  }
});

async function initializeVendorPage() {
  populateCategoryOptions(document.getElementById("category"), "Select a category");
  addProductEntry();
  if (window.BELLEZA_SUPABASE_ERROR) {
    vendorAuthForm.hidden = true;
    showAuthMessage(window.BELLEZA_SUPABASE_ERROR);
    return;
  }
  if (!client) {
    vendorAuthForm.hidden = true;
    showAuthMessage("Supabase is not configured. Add the project URL and public publishable key before submitting catalogues.");
    return;
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    showAuthMessage(`Could not check the sign-in session: ${error.message}`);
    return;
  }
  if (data.session) showUploadForm(data.session.user);
}

initializeVendorPage();
