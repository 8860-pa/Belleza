const trackOrderForm = document.getElementById("trackOrderForm");
const trackOrderButton = document.getElementById("trackOrderButton");
const trackMessage = document.getElementById("trackMessage");
const trackResult = document.getElementById("trackResult");
const orderStatuses = ["pending", "confirmed", "packed", "shipped", "delivered"];
const orderStatusLabels = {
  pending: "Order received",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled"
};
const paymentStatusLabels = {
  due: "Due on delivery",
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded"
};

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatOrderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function renderOrder(order) {
  const status = orderStatusLabels[order.status] ? order.status : "pending";
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.map((item) => `
    <li class="track-item">
      <span>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)}</span>
      <strong>${window.BELLEZAStore.formatPrice(Number(item.unit_price) * Number(item.quantity))}</strong>
    </li>
  `).join("");
  const deliveryAddress = [
    order.delivery_address,
    `${order.delivery_city}, ${order.delivery_state} ${order.delivery_postal_code}`
  ].filter(Boolean).map(escapeHtml).join("<br>");
  const progress = status === "cancelled"
    ? '<p class="track-cancelled">This order was cancelled.</p>'
    : `<ol class="track-progress" aria-label="Order progress">${orderStatuses.map((step, index) => {
      const currentIndex = orderStatuses.indexOf(status);
      const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "";
      return `<li class="${state}"${state === "current" ? ' aria-current="step"' : ""}>${orderStatusLabels[step]}</li>`;
    }).join("")}</ol>`;
  const paymentMethod = order.payment_method === "razorpay" ? "Razorpay" : "Cash on delivery";
  const paymentStatus = paymentStatusLabels[order.payment_status] || "Status unavailable";

  trackResult.innerHTML = `
    <div class="track-result-heading">
      <div>
        <p class="eyebrow">Order status</p>
        <h2>${orderStatusLabels[status]}</h2>
      </div>
      <p class="track-reference">Ref: ${escapeHtml(String(order.id).toUpperCase())}</p>
    </div>
    ${progress}
    <div class="track-details">
      <section class="track-detail-card">
        <h3>Order details</h3>
        <p><strong>Placed:</strong> ${escapeHtml(formatOrderDate(order.created_at))}</p>
        <ul class="track-items">${itemRows || "<li>Item details unavailable.</li>"}</ul>
        <div class="track-total"><span>Items subtotal</span><strong>${window.BELLEZAStore.formatPrice(order.subtotal)}</strong></div>
        <p class="track-note">Delivery charges are confirmed separately before dispatch.</p>
      </section>
      <section class="track-detail-card">
        <h3>Delivery and payment</h3>
        <p><strong>Delivering to</strong><br>${deliveryAddress}</p>
        <p><strong>Payment:</strong> ${paymentMethod}<br>${escapeHtml(paymentStatus)}</p>
      </section>
    </div>
  `;
  trackResult.hidden = false;
}

const orderFromUrl = new URLSearchParams(window.location.search).get("order");
if (orderFromUrl) {
  trackOrderForm.elements.orderReference.value = orderFromUrl;
}

trackOrderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  trackMessage.textContent = "";
  trackResult.hidden = true;
  if (!trackOrderForm.reportValidity()) return;

  const values = new FormData(trackOrderForm);
  const orderReference = values.get("orderReference").trim();
  const orderReferencePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orderReferencePattern.test(orderReference)) {
    trackMessage.textContent = "Enter the full order reference shown after checkout.";
    return;
  }
  if (!window.BELLEZA_SUPABASE) {
    trackMessage.textContent = "Order tracking is currently unavailable. Please contact BELLEZA for help.";
    return;
  }

  trackOrderButton.disabled = true;
  trackOrderButton.textContent = "Looking up your order…";
  try {
    const { data, error } = await window.BELLEZA_SUPABASE.rpc("track_order", {
      p_order_id: orderReference,
      p_customer_email: values.get("customerEmail").trim(),
      p_customer_phone: values.get("customerPhone").trim()
    });
    if (error) throw error;
    if (!data) {
      trackMessage.textContent = "No order matched those details. Check the reference, email, and phone number and try again.";
      return;
    }
    renderOrder(data);
  } catch (error) {
    console.error("Could not retrieve BELLEZA order tracking details.", error);
    trackMessage.textContent = "We could not retrieve your order right now. Please try again later.";
  } finally {
    trackOrderButton.disabled = false;
    trackOrderButton.textContent = "Find my order";
  }
});
