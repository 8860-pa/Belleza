import { createAdminClient } from "../_shared/supabase.ts";
import { jsonResponse, preflightResponse, isAllowedOrigin } from "../_shared/http.ts";
import { getRazorpayCredentials, hmacSha256Hex, razorpayAuthorization, safeEqualHex } from "../_shared/razorpay.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isAllowedOrigin(request)) return jsonResponse(request, { error: "Origin is not allowed." }, 403);
  if (request.method !== "POST") return jsonResponse(request, { error: "Method not allowed." }, 405);

  const credentials = getRazorpayCredentials();
  if (!credentials) return jsonResponse(request, { error: "Razorpay is not configured." }, 503);

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse(request, { error: "Invalid payment verification request." }, 400);
    }

    const payload = body as Record<string, unknown>;
    const bellezaOrderId = typeof payload.belleza_order_id === "string" ? payload.belleza_order_id : "";
    const razorpayOrderId = typeof payload.razorpay_order_id === "string" ? payload.razorpay_order_id : "";
    const paymentId = typeof payload.razorpay_payment_id === "string" ? payload.razorpay_payment_id : "";
    const signature = typeof payload.razorpay_signature === "string" ? payload.razorpay_signature : "";
    if (!/^[0-9a-f-]{36}$/i.test(bellezaOrderId) || !razorpayOrderId || !paymentId || !/^[0-9a-f]{64}$/i.test(signature)) {
      return jsonResponse(request, { error: "Invalid payment verification details." }, 400);
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,subtotal,payment_method,payment_status,razorpay_order_id,razorpay_payment_id")
      .eq("id", bellezaOrderId)
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    if (orderError || !order || order.payment_method !== "razorpay") {
      return jsonResponse(request, { error: "Payment order was not found." }, 404);
    }

    const expectedSignature = await hmacSha256Hex(
      credentials.keySecret,
      `${order.razorpay_order_id}|${paymentId}`
    );
    if (!safeEqualHex(expectedSignature, signature)) {
      return jsonResponse(request, { error: "Payment signature is invalid." }, 400);
    }
    if (order.payment_status === "paid" && order.razorpay_payment_id === paymentId) {
      return jsonResponse(request, { paid: true, belleza_order_id: order.id, subtotal: order.subtotal });
    }
    if (order.payment_status === "paid") {
      return jsonResponse(request, { error: "A different payment is already recorded for this order." }, 409);
    }

    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: razorpayAuthorization(credentials.keyId, credentials.keySecret) }
    });
    const payment = await paymentResponse.json().catch(() => null);
    const expectedAmount = Math.round(Number(order.subtotal) * 100);
    if (!paymentResponse.ok || payment?.status !== "captured" ||
      payment.order_id !== order.razorpay_order_id ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR") {
      return jsonResponse(request, { error: "Payment has not been captured and verified yet." }, 409);
    }

    const { error: updateError } = await admin
      .from("orders")
      .update({
        razorpay_payment_id: paymentId,
        payment_status: "paid",
        status: "confirmed"
      })
      .eq("id", order.id);
    if (updateError) throw new Error("Could not save verified payment status.");

    return jsonResponse(request, { paid: true, belleza_order_id: order.id, subtotal: order.subtotal });
  } catch (error) {
    console.error("Razorpay payment verification failed.", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(request, { error: "Payment verification could not be completed. Contact BELLEZA before retrying." }, 500);
  }
});
