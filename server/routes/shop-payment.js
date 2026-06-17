import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";
import { getAlipayNotifyStatus, verifyAlipayNotify } from "../lib/alipay.js";
import { grantPaidOrderDigitalAccess, toNumber } from "../lib/shop.js";

export const shopPaymentRouter = Router();

const shopOrderInclude = {
  items: {
    orderBy: { createdAt: "asc" },
  },
  payments: {
    orderBy: { createdAt: "desc" },
  },
};

const writeNotifyFailure = async ({ orderId, params, message }) => {
  if (!orderId) return;
  await prisma.shopPaymentRecord.create({
    data: {
      orderId,
      channel: "alipay",
      status: "failed",
      transactionNo: `${params.trade_no ?? ""}`.trim() || null,
      payAmount: Number(params.total_amount ?? 0) || 0,
      rawPayload: JSON.stringify({ error: message, params }),
    },
  });
};

shopPaymentRouter.post("/alipay/notify", async (req, res) => {
  const params = { ...(req.body ?? {}) };
  const orderNo = `${params.out_trade_no ?? ""}`.trim();
  const transactionNo = `${params.trade_no ?? ""}`.trim();

  if (!orderNo) return res.status(400).send("fail");

  const order = await prisma.shopOrder.findUnique({
    where: { orderNo },
    include: shopOrderInclude,
  });
  if (!order) return res.status(404).send("fail");

  if (!verifyAlipayNotify(params)) {
    await writeNotifyFailure({ orderId: order.id, params, message: "支付宝异步通知验签失败" });
    return res.status(400).send("fail");
  }

  if (`${params.app_id ?? ""}`.trim() !== config.alipay.appId) {
    await writeNotifyFailure({ orderId: order.id, params, message: "支付宝 APP_ID 不匹配" });
    return res.status(400).send("fail");
  }

  if (!getAlipayNotifyStatus(params)) {
    await prisma.shopPaymentRecord.create({
      data: {
        orderId: order.id,
        channel: "alipay",
        status: "failed",
        transactionNo: transactionNo || null,
        payAmount: Number(params.total_amount ?? 0) || order.payAmount,
        rawPayload: JSON.stringify(params),
      },
    });
    return res.send("success");
  }

  const paidAmount = Number(params.total_amount ?? 0);
  const expectedAmount = toNumber(order.payAmount);
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
    await writeNotifyFailure({ orderId: order.id, params, message: `支付金额不匹配，应付 ${expectedAmount}，实付 ${paidAmount}` });
    return res.status(400).send("fail");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const latest = await tx.shopOrder.findUnique({
        where: { id: order.id },
        include: shopOrderInclude,
      });
      if (!latest) throw new Error("订单不存在");

      const existingPayment = transactionNo
        ? await tx.shopPaymentRecord.findFirst({
            where: {
              orderId: latest.id,
              transactionNo,
              status: "paid",
            },
            select: { id: true },
          })
        : null;

      if (!existingPayment) {
        await tx.shopPaymentRecord.create({
          data: {
            orderId: latest.id,
            channel: "alipay",
            status: "paid",
            transactionNo: transactionNo || null,
            payAmount: paidAmount,
            paidAt: params.gmt_payment ? new Date(`${params.gmt_payment}`.replace(" ", "T")) : new Date(),
            rawPayload: JSON.stringify(params),
          },
        });
      }

      if (latest.paymentStatus === "paid") return;

      const now = new Date();
      const grantResult = await grantPaidOrderDigitalAccess({ tx, order: latest });
      const nextStatus = grantResult.failedCount > 0 ? "paid" : latest.items.some((item) => item.requiresShipping) ? "paid" : "completed";
      await tx.shopProduct.updateMany({
        where: { id: { in: latest.items.map((item) => item.productId) } },
        data: { salesCount: { increment: 1 } },
      });

      await tx.shopOrder.update({
        where: { id: latest.id },
        data: {
          status: nextStatus,
          paymentStatus: "paid",
          paidAt: params.gmt_payment ? new Date(`${params.gmt_payment}`.replace(" ", "T")) : now,
          completedAt: nextStatus === "completed" ? now : null,
        },
      });
    });
  } catch (error) {
    console.error("[alipay notify] failed:", error);
    await writeNotifyFailure({ orderId: order.id, params, message: error?.message || "支付宝回调处理失败" });
    return res.status(500).send("fail");
  }

  return res.send("success");
});

