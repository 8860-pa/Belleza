export interface CheckoutItem {
  id: string;
  quantity: number;
}

export interface DeliveryDetails {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_postal_code: string;
  delivery_notes: string;
}

export type ParsedCheckout =
  | { details: DeliveryDetails; items: CheckoutItem[] }
  | { error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCheckoutPayload(payload: unknown): ParsedCheckout {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { error: "Invalid checkout request." };
  }
  const body = payload as Record<string, unknown>;
  const details: DeliveryDetails = {
    customer_name: text(body.customer_name),
    customer_email: text(body.customer_email),
    customer_phone: text(body.customer_phone),
    delivery_address: text(body.delivery_address),
    delivery_city: text(body.delivery_city),
    delivery_state: text(body.delivery_state),
    delivery_postal_code: text(body.delivery_postal_code),
    delivery_notes: text(body.delivery_notes)
  };

  if (!details.customer_name || details.customer_name.length > 120) return { error: "Enter a valid name." };
  if (details.customer_email.length > 254 || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(details.customer_email)) {
    return { error: "Enter a valid email address." };
  }
  if (!/^[+0-9() -]{10,18}$/.test(details.customer_phone)) return { error: "Enter a valid phone number." };
  if (!details.delivery_address || details.delivery_address.length > 500) return { error: "Enter a valid delivery address." };
  if (!details.delivery_city || details.delivery_city.length > 100) return { error: "Enter a valid city." };
  if (!details.delivery_state || details.delivery_state.length > 100) return { error: "Enter a valid state." };
  if (!/^[0-9]{6}$/.test(details.delivery_postal_code)) return { error: "Enter a valid 6-digit PIN code." };
  if (details.delivery_notes.length > 500) return { error: "Delivery instructions must be 500 characters or fewer." };

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    return { error: "Your cart must contain between 1 and 30 products." };
  }

  const quantities = new Map<string, number>();
  for (const item of body.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: "The cart contains an invalid product." };
    const row = item as Record<string, unknown>;
    const id = text(row.id);
    const quantity = row.quantity;
    if (!id || id.length > 128 || !Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 99) {
      return { error: "The cart contains an invalid product or quantity." };
    }
    const combined = (quantities.get(id) || 0) + Number(quantity);
    if (combined > 99) return { error: "A product quantity cannot exceed 99." };
    quantities.set(id, combined);
  }

  return {
    details,
    items: Array.from(quantities, ([id, quantity]) => ({ id, quantity }))
  };
}
