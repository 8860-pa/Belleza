const cartStorageKey = "belleza.cart";
const checkoutForm = document.getElementById("checkoutForm");
const checkoutItems = document.getElementById("checkoutItems");
const checkoutSubtotal = document.getElementById("checkoutSubtotal");
const checkoutMessage = document.getElementById("checkoutMessage");
const placeOrderButton = document.getElementById("placeOrderButton");
const client = window.BELLEZA_SUPABASE;
let cart = [];
let products = [];
let razorpayModalOpen = false;

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
    console.error("Could not read the BELLEZA checkout cart.", error);
    return [];
  }
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showEmptyCart(message) {
  checkoutItems.innerHTML = `<p class="checkout-note">${escapeHtml(message)}</p>`;
  checkoutSubtotal.textContent = window.BELLEZAStore.formatPrice(0);
  placeOrderButton.disabled = true;
}

async function loadCheckout() {
  cart = readCart();
  if (!cart.length) {
    showEmptyCart("Your cart is empty. Add items before checking out.");
    checkoutMessage.textContent = "";
    return;
  }

  try {
    products = await window.BELLEZAStore.getProducts();
  } catch (error) {
    showEmptyCart("Products could not be verified. Return to the storefront and try again.");
    checkoutMessage.textContent = error.message;
    return;
  }

  const unavailable = cart.filter((item) => !products.some((product) => product.id === item.id));
  if (unavailable.length) {
    showEmptyCart("A product in your cart is no longer available. Return to the storefront to refresh your cart.");
    return;
  }

  checkoutItems.innerHTML = cart.map((item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    const lineTotal = Number(product.price) * item.quantity;
    return `<div class="checkout-item">
      <div><strong>${escapeHtml(product.name)}</strong><p>Qty ${item.quantity} · ${window.BELLEZAStore.formatPrice(product.price)} each</p></div>
      <strong>${window.BELLEZAStore.formatPrice(lineTotal)}</strong>
    </div>`;
  }).join("");

  const subtotal = cart.reduce((total, item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    return total + Number(product.price) * item.quantity;
  }, 0);
  checkoutSubtotal.textContent = window.BELLEZAStore.formatPrice(subtotal);
  placeOrderButton.disabled = false;
}

function selectedPaymentMethod() {
  return checkoutForm.querySelector('input[name="paymentMethod"]:checked')?.value || "cash_on_delivery";
}

function updatePaymentButton() {
  placeOrderButton.textContent = selectedPaymentMethod() === "razorpay"
    ? "Continue to secure payment"
    : "Place cash-on-delivery order";
}

function getDeliveryDetails(values) {
  return {
    customer_name: values.get("customerName").trim(),
    customer_email: values.get("customerEmail").trim(),
    customer_phone: values.get("customerPhone").trim(),
    delivery_address: values.get("deliveryAddress").trim(),
    delivery_city: values.get("deliveryCity").trim(),
    delivery_state: values.get("deliveryState").trim(),
    delivery_postal_code: values.get("deliveryPostalCode").trim(),
    delivery_notes: values.get("deliveryNotes").trim()
  };
}

function showConfirmation(orderId, subtotal, paymentMethod) {
  sessionStorage.removeItem(cartStorageKey);
  checkoutForm.hidden = true;
  document.getElementById("confirmationDetails").textContent =
    `Order reference ${orderId.toUpperCase()} · Items subtotal ${window.BELLEZAStore.formatPrice(subtotal)}.`;
  document.getElementById("trackOrderLink").href = `track-order.html?order=${encodeURIComponent(orderId)}`;
  document.getElementById("confirmationPaymentDetails").textContent = paymentMethod === "razorpay"
    ? "Payment confirmed through Razorpay. BELLEZA will confirm delivery charges separately; those are payable on delivery."
    : "Payment is due on delivery. BELLEZA will contact you to confirm delivery charges and details.";
  document.getElementById("orderConfirmation").hidden = false;
}

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Razorpay Checkout could not be loaded."));
    document.head.appendChild(script);
  });
}

async function openRazorpayCheckout(deliveryDetails) {
  const { data, error } = await client.functions.invoke("razorpay-create-order", {
    body: {
      ...deliveryDetails,
      items: cart.map((item) => ({ id: item.id, quantity: item.quantity }))
    }
  });
  if (error) throw new Error(`Could not start online payment: ${error.message}`);
  if (!data?.key_id || !data?.razorpay_order_id || !data?.belleza_order_id) {
    throw new Error("The payment gateway is not configured. Choose cash on delivery or contact BELLEZA.");
  }

  await loadRazorpayScript();
  const checkout = new window.Razorpay({
    key: data.key_id,
    amount: data.amount,
    currency: data.currency,
    name: "BELLEZA",
    description: "BELLEZA storefront order",
    order_id: data.razorpay_order_id,
    prefill: {
      name: deliveryDetails.customer_name,
      email: deliveryDetails.customer_email,
      contact: deliveryDetails.customer_phone
    },
    theme: { color: "#1d211c" },
    modal: {
      ondismiss: () => {
        razorpayModalOpen = false;
        placeOrderButton.disabled = false;
        updatePaymentButton();
      }
    },
    handler: async (response) => {
      checkoutMessage.textContent = "Verifying your payment…";
      try {
        const { data: verification, error: verificationError } = await client.functions.invoke("razorpay-verify-payment", {
          body: {
            belleza_order_id: data.belleza_order_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          }
        });
        if (verificationError) throw verificationError;
        if (!verification?.paid || !verification.belleza_order_id) {
          throw new Error("The payment is still being verified.");
        }
        razorpayModalOpen = false;
        showConfirmation(verification.belleza_order_id, verification.subtotal, "razorpay");
      } catch (error) {
        razorpayModalOpen = false;
        checkoutMessage.textContent = `Payment verification is pending. Do not retry yet; contact BELLEZA with order ${data.belleza_order_id.slice(0, 8).toUpperCase()}. ${error.message}`;
        placeOrderButton.disabled = false;
        updatePaymentButton();
      }
    }
  });

  checkout.on("payment.failed", (response) => {
    const description = response?.error?.description || "Payment was not completed.";
    checkoutMessage.textContent = description;
    razorpayModalOpen = false;
    placeOrderButton.disabled = false;
    updatePaymentButton();
  });
  checkout.open();
  razorpayModalOpen = true;
}

checkoutForm.querySelectorAll('input[name="paymentMethod"]').forEach((input) => {
  input.addEventListener("change", updatePaymentButton);
});

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutMessage.textContent = "";
  if (!checkoutForm.reportValidity()) return;
  if (!client) {
    checkoutMessage.textContent = "Order placement is unavailable because Supabase is not configured.";
    return;
  }
  if (!cart.length) {
    showEmptyCart("Your cart is empty. Add items before checking out.");
    return;
  }

  const values = new FormData(checkoutForm);
  const paymentMethod = selectedPaymentMethod();
  const deliveryDetails = getDeliveryDetails(values);
  placeOrderButton.disabled = true;
  placeOrderButton.textContent = paymentMethod === "razorpay" ? "Connecting to Razorpay…" : "Placing order…";
  try {
    if (paymentMethod === "razorpay") {
      await openRazorpayCheckout(deliveryDetails);
      return;
    }

    const { data, error } = await client.rpc("create_order", {
      p_customer_name: deliveryDetails.customer_name,
      p_customer_email: deliveryDetails.customer_email,
      p_customer_phone: deliveryDetails.customer_phone,
      p_delivery_address: deliveryDetails.delivery_address,
      p_delivery_city: deliveryDetails.delivery_city,
      p_delivery_state: deliveryDetails.delivery_state,
      p_delivery_postal_code: deliveryDetails.delivery_postal_code,
      p_delivery_notes: deliveryDetails.delivery_notes,
      p_items: cart.map((item) => ({ id: item.id, quantity: item.quantity }))
    });
    if (error) throw error;
    if (!data || typeof data.order_id !== "string") throw new Error("The order was not confirmed. Please try again.");
    showConfirmation(data.order_id, data.subtotal, "cash_on_delivery");
  } catch (error) {
    checkoutMessage.textContent = `Could not place your order: ${error.message}`;
  } finally {
    if (!razorpayModalOpen && !checkoutForm.hidden) {
      placeOrderButton.disabled = false;
      updatePaymentButton();
    }
  }
});

updatePaymentButton();
loadCheckout();
