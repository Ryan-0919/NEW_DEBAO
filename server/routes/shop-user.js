import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { config } from "../lib/config.js";
import { requireUserAuth } from "../middleware/auth.js";
import { buildAlipayPayForm } from "../lib/alipay.js";
import {
  generateShopOrderNo,
  getOrderDisplaySubject,
  getShopOrderPayExpireAt,
  grantPaidOrderDigitalAccess,
  serializeShopOrder,
  serializeShopProduct,
  toMoney,
  toNumber,
} from "../lib/shop.js";

export const shopUserRouter = Router();

const shopProductInclude = {
  category: true,
  skus: {
    where: { status: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  },
  courses: {
    include: {
      course: {
        select: {
          id: true,
          name: true,
          status: true,
          courseType: true,
        },
      },
    },
  },
};

const shopOrderInclude = {
  items: {
    orderBy: { createdAt: "asc" },
  },
  payments: {
    orderBy: { createdAt: "desc" },
  },
};

const getShopConfig = async () => {
  const configRow = await prisma.shopConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return {
    enableAlipayWap: Boolean(configRow.enableAlipayWap),
    paymentGuide: configRow.paymentGuide ?? "",
    customerServiceUrl: configRow.customerServiceUrl ?? "",
    paymentMode: config.shopPaymentMode,
  };
};

shopUserRouter.get("/config", requireUserAuth, async (_req, res) => {
  return ok(res, await getShopConfig());
});

shopUserRouter.get("/products", requireUserAuth, async (_req, res) => {
  const products = await prisma.shopProduct.findMany({
    where: {
      isDeleted: false,
      status: "on_sale",
    },
    include: shopProductInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(res, products.map(serializeShopProduct));
});

shopUserRouter.post("/orders", requireUserAuth, async (req, res) => {
  const productId = `${req.body?.productId ?? ""}`.trim();
  const skuId = `${req.body?.skuId ?? ""}`.trim();
  const quantity = Math.max(1, Math.min(99, Number.parseInt(`${req.body?.quantity ?? "1"}`, 10) || 1));
  if (!productId) return fail(res, "请选择要购买的商品", 400);

  const product = await prisma.shopProduct.findFirst({
    where: {
      id: productId,
      isDeleted: false,
      status: "on_sale",
    },
    include: shopProductInclude,
  });
  if (!product) return fail(res, "商品不存在或已下架", 404);

  const sku = product.skus.find((item) => item.id === skuId) ?? product.skus.find((item) => item.isDefault) ?? product.skus[0];
  if (!sku) return fail(res, "商品暂未配置可购买规格", 400);
  if (!sku.status) return fail(res, "当前规格暂不可购买", 400);
  if (Number(sku.stock ?? 0) < quantity) return fail(res, "库存不足，请联系教务老师", 400);

  const courseIds = product.courses.map((item) => item.courseId).filter(Boolean);
  const unitPrice = toNumber(sku.price);
  const totalAmount = Number((unitPrice * quantity).toFixed(2));
  const orderNo = generateShopOrderNo();

  const order = await prisma.$transaction(async (tx) => {
    const stockResult = await tx.shopSku.updateMany({
      where: {
        id: sku.id,
        stock: { gte: quantity },
      },
      data: {
        stock: {
          decrement: quantity,
        },
      },
    });
    if (stockResult.count === 0) {
      throw Object.assign(new Error("库存不足，请刷新后重试"), { statusCode: 400 });
    }

    return tx.shopOrder.create({
      data: {
        orderNo,
        userId: req.auth.userId,
        status: "pending_payment",
        paymentStatus: "unpaid",
        totalAmount,
        payAmount: totalAmount,
        freightAmount: 0,
        payExpireAt: getShopOrderPayExpireAt(),
        items: {
          create: [
            {
              productId: product.id,
              skuId: sku.id,
              productNameSnapshot: product.name,
              productTypeSnapshot: product.type,
              coverSnapshot: product.coverUrl,
              priceSnapshot: unitPrice,
              originalPriceSnapshot: sku.originalPrice ?? null,
              quantity,
              requiresShipping: Boolean(product.requiresShipping),
              courseIdsSnapshot: JSON.stringify(courseIds),
            },
          ],
        },
      },
      include: shopOrderInclude,
    });
  });

  return ok(res, serializeShopOrder(order), "订单已创建");
});

shopUserRouter.get("/orders", requireUserAuth, async (req, res) => {
  const orders = await prisma.shopOrder.findMany({
    where: { userId: req.auth.userId },
    include: shopOrderInclude,
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });

  return ok(res, orders.map(serializeShopOrder));
});

shopUserRouter.get("/orders/:orderId", requireUserAuth, async (req, res) => {
  const order = await prisma.shopOrder.findFirst({
    where: {
      id: req.params.orderId,
      userId: req.auth.userId,
    },
    include: shopOrderInclude,
  });
  if (!order) return fail(res, "订单不存在", 404);

  return ok(res, serializeShopOrder(order));
});

shopUserRouter.post("/orders/:orderId/pay", requireUserAuth, async (req, res) => {
  const channel = `${req.body?.channel ?? "alipay"}`.trim().toLowerCase();
  if (channel !== "alipay") return fail(res, "当前仅支持支付宝支付", 400);

  const shopConfig = await getShopConfig();
  if (!shopConfig.enableAlipayWap) return fail(res, "支付宝支付暂未开启", 400);

  const order = await prisma.shopOrder.findFirst({
    where: {
      id: req.params.orderId,
      userId: req.auth.userId,
    },
    include: shopOrderInclude,
  });
  if (!order) return fail(res, "订单不存在", 404);
  if (order.paymentStatus === "paid") return ok(res, { status: "paid", order: serializeShopOrder(order) }, "订单已支付");
  if (order.status !== "pending_payment" || order.paymentStatus !== "unpaid") return fail(res, "订单状态不支持支付", 400);
  if (order.payExpireAt && new Date(order.payExpireAt).getTime() < Date.now()) {
    await prisma.shopOrder.update({
      where: { id: order.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
    });
    return fail(res, "订单已超时关闭，请重新下单", 400);
  }

  await prisma.shopPaymentRecord.create({
    data: {
      orderId: order.id,
      channel: "alipay",
      status: "unpaid",
      payAmount: order.payAmount,
      rawPayload: JSON.stringify({ scene: "create_payment", orderNo: order.orderNo, createdAt: new Date().toISOString() }),
    },
  });

  const siteBaseUrl = config.paySiteBaseUrl || `${req.protocol}://${req.get("host")}`;
  const notifyBaseUrl = config.payNotifyBaseUrl || siteBaseUrl;
  const returnUrl = `${siteBaseUrl}/shop/orders/${encodeURIComponent(order.id)}/result`;
  const notifyUrl = `${notifyBaseUrl}/api/shop/payments/alipay/notify`;
  const formHtml = buildAlipayPayForm({
    orderNo: order.orderNo,
    subject: getOrderDisplaySubject(order),
    totalAmount: toMoney(order.payAmount),
    notifyUrl,
    returnUrl,
    quitUrl: `${siteBaseUrl}/shop/orders/${encodeURIComponent(order.id)}`,
    scene: req.body?.scene === "page" ? "page" : "wap",
  });

  return ok(res, {
    channel: "alipay",
    method: "form",
    formHtml,
    order: serializeShopOrder(order),
  });
});

shopUserRouter.post("/orders/:orderId/mock-pay", requireUserAuth, async (req, res) => {
  if (config.shopPaymentMode !== "mock") return fail(res, "当前环境未开启模拟支付", 403);

  const order = await prisma.shopOrder.findFirst({
    where: {
      id: req.params.orderId,
      userId: req.auth.userId,
    },
    include: shopOrderInclude,
  });
  if (!order) return fail(res, "订单不存在", 404);

  const paidOrder = await prisma.$transaction(async (tx) => {
    const latest = await tx.shopOrder.findUnique({
      where: { id: order.id },
      include: shopOrderInclude,
    });
    if (!latest || latest.paymentStatus === "paid") return latest;

    const now = new Date();
    await tx.shopPaymentRecord.create({
      data: {
        orderId: latest.id,
        channel: "mock",
        status: "paid",
        transactionNo: `MOCK-${latest.orderNo}`,
        payAmount: latest.payAmount,
        paidAt: now,
        rawPayload: JSON.stringify({ operator: req.auth.userId, createdAt: now.toISOString() }),
      },
    });

    const grantResult = await grantPaidOrderDigitalAccess({ tx, order: latest });
    const nextStatus = grantResult.failedCount > 0 ? "paid" : latest.items.some((item) => item.requiresShipping) ? "paid" : "completed";
    await tx.shopProduct.updateMany({
      where: { id: { in: latest.items.map((item) => item.productId) } },
      data: { salesCount: { increment: 1 } },
    });

    return tx.shopOrder.update({
      where: { id: latest.id },
      data: {
        status: nextStatus,
        paymentStatus: "paid",
        paidAt: now,
        completedAt: nextStatus === "completed" ? now : null,
      },
      include: shopOrderInclude,
    });
  });

  return ok(res, serializeShopOrder(paidOrder), "模拟支付成功，课程权限已发放");
});
