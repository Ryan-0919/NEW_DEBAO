import { config } from "./config.js";
import { formatDateTime } from "./time.js";
import { getReadableObjectUrl } from "./upload.js";

export const toNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toNumber === "function") return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const toMoney = (value) => toNumber(value).toFixed(2);

export const toStringArray = (value) =>
  [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((item) => `${item}`.trim()).filter(Boolean))];

export const parseJsonStringArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return toStringArray(parsed);
  } catch {
    return [];
  }
};

export const serializeShopProduct = (product) => {
  const defaultSku = product.skus?.find((sku) => sku.isDefault) ?? product.skus?.[0] ?? null;
  const courseIds = (product.courses ?? []).map((item) => item.courseId);
  const courseNames = (product.courses ?? []).map((item) => item.course?.name).filter(Boolean);

  return {
    id: product.id,
    categoryId: product.categoryId ?? "",
    categoryName: product.category?.name ?? "",
    name: product.name,
    subtitle: product.subtitle ?? "",
    coverUrl: getReadableObjectUrl({
      objectKey: product.coverObjectKey ?? "",
      fallbackUrl: product.coverUrl ?? "",
    }),
    coverObjectKey: product.coverObjectKey ?? "",
    type: product.type,
    status: product.status,
    description: product.description ?? "",
    detailContent: product.detailContent ?? "",
    requiresShipping: Boolean(product.requiresShipping),
    sortOrder: Number(product.sortOrder ?? 0),
    salesCount: Number(product.salesCount ?? 0),
    courseIds,
    courseNames,
    sku: defaultSku
      ? {
          id: defaultSku.id,
          name: defaultSku.name,
          price: toMoney(defaultSku.price),
          originalPrice: defaultSku.originalPrice == null ? "" : toMoney(defaultSku.originalPrice),
          stock: Number(defaultSku.stock ?? 0),
          status: Boolean(defaultSku.status),
        }
      : null,
    skus: (product.skus ?? []).map((sku) => ({
      id: sku.id,
      name: sku.name,
      price: toMoney(sku.price),
      originalPrice: sku.originalPrice == null ? "" : toMoney(sku.originalPrice),
      stock: Number(sku.stock ?? 0),
      isDefault: Boolean(sku.isDefault),
      status: Boolean(sku.status),
    })),
    createdAt: product.createdAt ? formatDateTime(product.createdAt) : "",
    updatedAt: product.updatedAt ? formatDateTime(product.updatedAt) : "",
  };
};

export const serializeShopOrder = (order) => ({
  id: order.id,
  orderNo: order.orderNo,
  status: order.status,
  paymentStatus: order.paymentStatus,
  totalAmount: toMoney(order.totalAmount),
  payAmount: toMoney(order.payAmount),
  freightAmount: toMoney(order.freightAmount),
  payExpireAt: order.payExpireAt ? formatDateTime(order.payExpireAt) : "",
  paidAt: order.paidAt ? formatDateTime(order.paidAt) : "",
  cancelledAt: order.cancelledAt ? formatDateTime(order.cancelledAt) : "",
  completedAt: order.completedAt ? formatDateTime(order.completedAt) : "",
  createdAt: order.createdAt ? formatDateTime(order.createdAt) : "",
  updatedAt: order.updatedAt ? formatDateTime(order.updatedAt) : "",
  items: (order.items ?? []).map((item) => ({
    id: item.id,
    productId: item.productId,
    skuId: item.skuId,
    productName: item.productNameSnapshot,
    productType: item.productTypeSnapshot,
    cover: getReadableObjectUrl({ objectKey: "", fallbackUrl: item.coverSnapshot ?? "" }),
    price: toMoney(item.priceSnapshot),
    originalPrice: item.originalPriceSnapshot == null ? "" : toMoney(item.originalPriceSnapshot),
    quantity: Number(item.quantity ?? 0),
    requiresShipping: Boolean(item.requiresShipping),
    courseIds: parseJsonStringArray(item.courseIdsSnapshot),
  })),
  payments: (order.payments ?? []).map((payment) => ({
    id: payment.id,
    channel: payment.channel,
    status: payment.status,
    transactionNo: payment.transactionNo ?? "",
    payAmount: toMoney(payment.payAmount),
    paidAt: payment.paidAt ? formatDateTime(payment.paidAt) : "",
    createdAt: payment.createdAt ? formatDateTime(payment.createdAt) : "",
  })),
});

const buildDatePart = (date = new Date()) => {
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join("");
};

export const generateShopOrderNo = () => `DB${buildDatePart()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const getShopOrderPayExpireAt = () => new Date(Date.now() + config.shopOrderAutoCloseMinutes * 60 * 1000);

export const getOrderDisplaySubject = (order) => {
  const firstName = order.items?.[0]?.productNameSnapshot ?? "";
  const count = order.items?.length ?? 0;
  if (!firstName) return `得宝订单${order.orderNo}`;
  return count > 1 ? `${firstName}等${count}件商品` : firstName;
};

export const grantPaidOrderDigitalAccess = async ({ tx, order }) => {
  const now = new Date();
  let successCount = 0;
  let failedCount = 0;

  for (const item of order.items ?? []) {
    const courseIds = parseJsonStringArray(item.courseIdsSnapshot);
    if (courseIds.length === 0) continue;

    const existing = await tx.shopDigitalFulfillment.findFirst({
      where: {
        orderId: order.id,
        orderItemId: item.id,
        userId: order.userId,
        grantType: "course",
        status: "success",
      },
      select: { id: true },
    });
    if (existing) {
      successCount += 1;
      continue;
    }

    try {
      await tx.userCoursePermission.createMany({
        data: courseIds.map((courseId) => ({
          userId: order.userId,
          courseId,
        })),
        skipDuplicates: true,
      });

      await tx.shopDigitalFulfillment.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          userId: order.userId,
          status: "success",
          grantType: "course",
          grantPayload: JSON.stringify({ courseIds, orderNo: order.orderNo, orderItemId: item.id }),
          grantedAt: now,
        },
      });
      successCount += 1;
    } catch (error) {
      failedCount += 1;
      await tx.shopDigitalFulfillment.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          userId: order.userId,
          status: "failed",
          grantType: "course",
          grantPayload: JSON.stringify({ courseIds, orderNo: order.orderNo, orderItemId: item.id }),
          errorMessage: `${error?.message ?? "课程权限发放失败"}`.slice(0, 500),
        },
      });
    }
  }

  return { successCount, failedCount };
};

