const client = window.BELLEZA_SUPABASE;
const sellerAuth = document.getElementById("sellerAuth");
const sellerAuthForm = document.getElementById("sellerAuthForm");
const sellerAuthMessage = document.getElementById("sellerAuthMessage");
const sellerDashboard = document.getElementById("sellerDashboard");
const sellerMessage = document.getElementById("sellerMessage");
const cataloguesBody = document.getElementById("sellerCatalogues");
let authMode = "signin";

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function setAuthMessage(message) {
  sellerAuth.hidden = false;
  sellerDashboard.hidden = true;
  sellerAuthMessage.textContent = message;
}

function setAuthMode() {
  const signingUp = authMode === "signup";
  document.getElementById("sellerAuthSubmit").textContent = signingUp ? "Create account" : "Sign in";
  document.getElementById("toggleSellerAuth").textContent = signingUp ? "Already have an account? Sign in" : "Create seller account";
  document.getElementById("sellerPassword").autocomplete = signingUp ? "new-password" : "current-password";
  sellerAuthMessage.textContent = "";
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

async function createFileLinks(catalogue, userId, failures) {
  const files = Array.isArray(catalogue.files) ? catalogue.files : [];
  return Promise.all(files.map(async (file) => {
    if (!file || typeof file.path !== "string" || !file.path.startsWith(`${userId}/`)) {
      failures.push(`${catalogue.title}: invalid file reference`);
      return `<span class="seller-file-link">${escapeHtml(file?.name || "Invalid file reference")}</span>`;
    }

    try {
      const { data, error } = await client.storage
        .from("catalogues")
        .createSignedUrl(file.path, 3600);
      if (error) throw error;
      return `<a class="seller-file-link" href="${escapeHtml(data.signedUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.name || "Download file")}</a>`;
    } catch (error) {
      failures.push(`${catalogue.title}: ${error.message}`);
      return `<span class="seller-file-link">${escapeHtml(file.name || "File unavailable")}</span>`;
    }
  }));
}

async function loadSellerCatalogues(user) {
  sellerMessage.textContent = "Loading your catalogues…";
  cataloguesBody.innerHTML = "";

  try {
    const { data, error } = await client
      .from("catalogues")
      .select("id,title,brand,category,season,product_count,description,files,created_at,submitter_id")
      .eq("submitter_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const failures = [];
    const rows = await Promise.all(data.map(async (catalogue) => {
      const fileLinks = await createFileLinks(catalogue, user.id, failures);
      const details = [
        catalogue.brand,
        catalogue.season,
        catalogue.product_count ? `${catalogue.product_count} products` : "",
        catalogue.description
      ].filter(Boolean).map(escapeHtml).join(" · ");

      return `<tr>
        <td><strong>${escapeHtml(catalogue.title)}</strong><span class="catalogue-details">${details}</span></td>
        <td>${escapeHtml(catalogue.category)}</td>
        <td>${formatDate(catalogue.created_at)}</td>
        <td>${fileLinks.length ? fileLinks.join("") : '<span class="seller-file-link">No files listed</span>'}</td>
      </tr>`;
    }));

    document.getElementById("sellerCatalogueCount").textContent = `(${data.length})`;
    cataloguesBody.innerHTML = rows.length
      ? rows.join("")
      : '<tr><td class="seller-empty" colspan="4">No catalogues yet. Upload your first catalogue to get started.</td></tr>';
    sellerMessage.textContent = failures.length
      ? `${failures.length} file${failures.length === 1 ? "" : "s"} could not be made available. First error: ${failures[0]}`
      : "";
  } catch (error) {
    sellerMessage.textContent = `Could not load your catalogues: ${error.message}`;
  }
}

async function showSellerDashboard(user) {
  sellerAuth.hidden = true;
  sellerDashboard.hidden = false;
  document.getElementById("sellerIdentity").textContent = `Signed in as ${user.email || "seller"}`;
  await loadSellerCatalogues(user);
}

document.getElementById("toggleSellerAuth").addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  setAuthMode();
});

sellerAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("sellerAuthSubmit");
  button.disabled = true;
  sellerAuthMessage.textContent = authMode === "signup" ? "Creating account…" : "Signing in…";

  try {
    const values = new FormData(sellerAuthForm);
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
      sellerAuthMessage.textContent = `Authentication failed: ${result.error.message}`;
      return;
    }
    if (authMode === "signup" && !result.data.session) {
      sellerAuthMessage.textContent = "Check your email to confirm your seller account, then sign in.";
      return;
    }
    if (result.data.session) await showSellerDashboard(result.data.user);
  } catch (error) {
    sellerAuthMessage.textContent = `Authentication failed: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

document.getElementById("sellerSignOut").addEventListener("click", async () => {
  const button = document.getElementById("sellerSignOut");
  button.disabled = true;
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    cataloguesBody.innerHTML = "";
    document.getElementById("sellerCatalogueCount").textContent = "";
    setAuthMessage("You have signed out.");
  } catch (error) {
    sellerMessage.textContent = `Could not sign out: ${error.message}`;
  } finally {
    button.disabled = false;
  }
});

async function initializeSellerPanel() {
  if (window.BELLEZA_SUPABASE_ERROR) {
    sellerAuthForm.hidden = true;
    setAuthMessage(window.BELLEZA_SUPABASE_ERROR);
    return;
  }
  if (!client) {
    sellerAuthForm.hidden = true;
    setAuthMessage("Supabase is not configured. Add the project URL and public publishable key before using the seller panel.");
    return;
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data.session) await showSellerDashboard(data.session.user);
  } catch (error) {
    setAuthMessage(`Could not check the sign-in session: ${error.message}`);
  }
}

initializeSellerPanel();
