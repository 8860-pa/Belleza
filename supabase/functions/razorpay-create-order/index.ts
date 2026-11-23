import { createAdminClient } from "../_shared/supabase.ts";
import { jsonResponse, preflightResponse, isAllowedOrigin } from "../_shared/http.ts";
import { parseCheckoutPayload } from "../_shared/checkout.ts";
import { getRazorpayCredentials, razorpayAuthorization } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isAllowedOrigin(request)) return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed." }, 405);

  const credentials = getRazorpayCredentials();
  if (!credentials) {
    return jsonResponse(request, { error: "Razorpay is not configured. Choose cash on delivery or contact BELLEZA." }, 503);
  }

  try {
    const parsed = parseCheckoutPayload(await request.json());
    if ("error" in parsed) return jsonResponse(request, { error: parsed.error }, 400);

    const admin = createAdminClient();
    const productIds = parsed.items.map((item) => item.id);
    const { data: products, error: productError } = await admin
      .from("products")
      .select("id,name,price")
      .in("id", productIds);
    if (productError) throw new Error("Could not verify the current product list.");

    const productById = new Map((products || []).map((product) => [product.id, product]));
    if (productById.size !== productIds.length) {
      return jsonResponse(request, { error: "A product in your cart is no longer available." }, 400);
    }

    let amountPaise = 0;
    const orderItems = parsed.items.map((item) => {
      const product = productById.get(item.id);
      if (!product) throw new Error("A product in your cart is no longer available.");
      const unitPricePaise = Math.round(Number(product.price) * 100);
      if (!Number.isSafeInteger(unitPricePaise) || unitPricePaise < 1) throw new Error("A product has an invalid price.");
      amountPaise += unitPricePaise * item.quantity;
      return {
        id: product.id,
        name: product.name,
        unit_price: unitPricePaise / 100,
        quantity: item.quantity
      };
    });
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      return jsonResponse(request, { error: "The payment amount is below Razorpay's minimum." }, 400);
    }

    const { data: bellezaOrder, error: insertError } = await admin
      .from("orders")
      .insert({
        ...parsed.details,
        items: orderItems,
        subtotal: amountPaise / 100,
        payment_method: "razorpay",
        payment_status: "pending",
        status: "pending"
      })
      .select("id")
      .single();
    if (insertError || !bellezaOrder) throw new Error("Could not save your order.");

    const providerResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: razorpayAuthorization(credentials.keyId, credentials.keySecret),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt: bellezaOrder.id,
        notes: { belleza_order_id: bellezaOrder.id }
      })
    });
    const providerOrder = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok || typeof providerOrder?.id !== "string" ||
      providerOrder.amount !== amountPaise || providerOrder.currency !== "INR") {
      await admin.from("orders").update({ payment_status: "failed" }).eq("id", bellezaOrder.id);
      console.error("Razorpay order creation failed with status", providerResponse.status);
      return jsonResponse(request, { error: "Razorpay could not start this payment. Try cash on delivery or contact BELLEZA." }, 502);
    }

    const { error: updateError } = await admin
      .from("orders")
      .update({ razorpay_order_id: providerOrder.id })
      .eq("id", bellezaOrder.id);
    if (updateError) throw new Error("Could not link the payment to your order.");

    return jsonResponse(request, {
      belleza_order_id: bellezaOrder.id,
      key_id: credentials.keyId,
      razorpay_order_id: providerOrder.id,
      amount: amountPaise,
      currency: "INR"
    });
  } catch (error) {
    console.error("Razorpay order request failed.", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(request, { error: "Could not start online payment. Please try again or choose cash on delivery." }, 500);
  }
});
