import { createAdminClient } from "../_shared/supabase.ts";
import { hmacSha256Hex, safeEqualHex } from "../_shared/razorpay.ts";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!webhookSecret) return response({ error: "Webhook is not configured." }, 503);

  try {
    const rawBody = await request.text();
    if (rawBody.length > 1_000_000) return response({ error: "Webhook payload is too large." }, 413);
    const signature = request.headers.get("x-razorpay-signature") || "";
    if (!/^[0-9a-f]{64}$/i.test(signature)) return response({ error: "Invalid webhook signature." }, 400);

    const expectedSignature = await hmacSha256Hex(webhookSecret, rawBody);
    if (!safeEqualHex(expectedSignature, signature)) return response({ error: "Invalid webhook signature." }, 400);

    const event = JSON.parse(rawBody);
    if (event?.event !== "payment.captured") return response({ received: true, ignored: true });

    const payment = event?.payload?.payment?.entity;
    if (!payment || typeof payment !== "object" ||
      typeof payment.order_id !== "string" ||
      typeof payment.id !== "string" ||
      payment.status !== "captured" ||
      payment.currency !== "INR" ||
      !Number.isSafeInteger(payment.amount)) {
      return response({ error: "Invalid captured payment event." }, 400);
    }

    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,subtotal,payment_method,payment_status,razorpay_payment_id")
      .eq("razorpay_order_id", payment.order_id)
      .maybeSingle();
    if (orderError) throw new Error("Could not look up the payment order.");
    if (!order || order.payment_method !== "razorpay") return response({ error: "Payment order not found." }, 404);
    if (payment.amount !== Math.round(Number(order.subtotal) * 100)) {
      return response({ error: "Captured amount does not match the order." }, 400);
    }
    if (order.payment_status === "paid" && order.razorpay_payment_id === payment.id) {
      return response({ received: true, already_verified: true });
    }
    if (order.payment_status === "paid") return response({ error: "A different payment is already recorded." }, 409);

    const { error: updateError } = await admin
      .from("orders")
      .update({
        razorpay_payment_id: payment.id,
        payment_status: "paid",
        status: "confirmed"
      })
      .eq("id", order.id);
    if (updateError) throw new Error("Could not save captured payment status.");

    return response({ received: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed.", error instanceof Error ? error.message : "unknown error");
    return response({ error: "Webhook processing failed." }, 500);
  }
});
