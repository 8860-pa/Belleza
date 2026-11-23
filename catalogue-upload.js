const client = window.BELLEZA_SUPABASE;
const vendorAuth = document.getElementById("vendorAuth");
const vendorAuthForm = document.getElementById("vendorAuthForm");
const vendorAuthMessage = document.getElementById("vendorAuthMessage");
const catalogueForm = document.getElementById("catalogueForm");
const uploadStatus = document.getElementById("uploadStatus");
const fileInput = document.getElementById("catalogueFiles");
const dropZone = document.getElementById("dropZone");
const fileList = document.getElementById("fileList");
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
  showAuthMessage("You have signed out.");
});

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

catalogueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFiles.length) {
    uploadStatus.textContent = "Add at least one catalogue file before submitting.";
    dropZone.focus();
    return;
  }

  const uploaded = [];
  const submitButton = catalogueForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  uploadStatus.textContent = "Uploading catalogue files…";

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
    await uploadSelectedFiles(user, submissionId, uploaded);
    const { error } = await client.from("catalogues").insert({
      id: `catalogue-${submissionId}`,
      submitter_id: user.id,
      title: values.get("title").trim(),
      brand: values.get("brand").trim(),
      category: values.get("category"),
      season: values.get("season").trim(),
      product_count: values.get("productCount") ? Number(values.get("productCount")) : null,
      description: values.get("description").trim(),
      email: values.get("email").trim(),
      files: uploaded
    });
    if (error) throw error;

    catalogueForm.reset();
    selectedFiles = [];
    renderFiles();
    uploadStatus.textContent = "Catalogue submitted. The BELLEZA team can now review your files.";
  } catch (error) {
    if (uploaded.length) {
      try {
        const { error: cleanupError } = await client.storage
          .from("catalogues")
          .remove(uploaded.map((file) => file.path));
        if (cleanupError) throw cleanupError;
        uploadStatus.textContent = `Submission failed: ${error.message}. Uploaded files were removed.`;
      } catch (cleanupError) {
        uploadStatus.textContent = `Submission failed: ${error.message}. Uploaded files could not be cleaned up: ${cleanupError.message}`;
      }
    } else {
      uploadStatus.textContent = `Submission failed: ${error.message}`;
    }
  } finally {
    submitButton.disabled = false;
  }
});

async function initializeVendorPage() {
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
