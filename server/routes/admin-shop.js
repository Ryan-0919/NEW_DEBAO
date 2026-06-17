import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ok, fail } from "../lib/response.js";
import { requireAdminAuth, requireAdminRoles } from "../middleware/auth.js";
import { writeAdminAuditLog } from "../lib/admin-audit.js";
import { serializeShopOrder, serializeShopProduct, toNumber, toStringArray } from "../lib/shop.js";

export const adminShopRouter = Router();

const SHOP_MANAGER_ROLES = ["super_admin", "operations_admin"];

adminShopRouter.use(requireAdminAuth);
adminShopRouter.use(requireAdminRoles(...SHOP_MANAGER_ROLES));

const productInclude = {
  category: true,
  skus: {
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
          coverUrl: true,
          coverObjectKey: true,
        },
      },
    },
  },
};

const orderInclude = {
  user: {
    select: {
      id: true,
      phone: true,
      nickname: true,
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
  },
  payments: {
    orderBy: { createdAt: "desc" },
  },
};

const normalizeStatus = (value) => (value === "on_sale" || value === "off_sale" || value === "draft" ? value : "draft");
const normalizeProductType = (value) => (value === "physical" || value === "hybrid" ? value : "virtual");
const serializeShopConfig = (row) => ({
  enableAlipayWap: Boolean(row.enableAlipayWap),
  paymentGuide: row.paymentGuide ?? "",
  customerServiceUrl: row.customerServiceUrl ?? "",
});

const getOrCreateShopConfig = () =>
  prisma.shopConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

const readProductPayload = async (body = {}) => {
  const courseIds = toStringArray(body.courseIds);
  const courses =
    courseIds.length === 0
      ? []
      : await prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, name: true, coverUrl: true, coverObjectKey: true },
        });
  const firstCourse = courses[0] ?? null;
  const name = `${body.name ?? ""}`.trim() || firstCourse?.name || "";
  const price = Math.max(0, toNumber(body.price));
  const originalPrice = body.originalPrice === "" || body.originalPrice == null ? null : Math.max(0, toNumber(body.originalPrice));
  const stock = Math.max(0, Number.parseInt(`${body.stock ?? "9999"}`, 10) || 0);

  return {
    product: {
      name,
      subtitle: `${body.subtitle ?? ""}`.trim(),
      coverUrl: `${body.coverUrl ?? ""}`.trim() || firstCourse?.coverUrl || "",
      coverObjectKey: `${body.coverObjectKey ?? ""}`.trim() || firstCourse?.coverObjectKey || null,
      type: normalizeProductType(body.type),
      status: normalizeStatus(body.status),
      description: `${body.description ?? ""}`.trim(),
      detailContent: `${body.detailContent ?? ""}`.trim(),
      requiresShipping: Boolean(body.requiresShipping),
      sortOrder: Number.parseInt(`${body.sortOrder ?? "0"}`, 10) || 0,
      isDeleted: false,
    },
    sku: {
      name: `${body.skuName ?? ""}`.trim() || "默认规格",
      price,
      originalPrice,
      stock,
      isDefault: true,
      status: true,
    },
    courseIds: courses.map((course) => course.id),
  };
};

adminShopRouter.get("/products", async (_req, res) => {
  const products = await prisma.shopProduct.findMany({
    where: { isDeleted: false },
    include: productInclude,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return ok(res, products.map(serializeShopProduct));
});

adminShopRouter.get("/config", async (_req, res) => {
  const row = await getOrCreateShopConfig();
  return ok(res, serializeShopConfig(row));
});

adminShopRouter.patch("/config", async (req, res) => {
  const row = await prisma.shopConfig.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      enableAlipayWap: Boolean(req.body?.enableAlipayWap),
      paymentGuide: `${req.body?.paymentGuide ?? ""}`.trim(),
      customerServiceUrl: `${req.body?.customerServiceUrl ?? ""}`.trim(),
    },
    update: {
      enableAlipayWap: Boolean(req.body?.enableAlipayWap),
      paymentGuide: `${req.body?.paymentGuide ?? ""}`.trim(),
      customerServiceUrl: `${req.body?.customerServiceUrl ?? ""}`.trim(),
    },
  });

  await writeAdminAuditLog(req, {
    action: "update_shop_payment_config",
    entityType: "shop_config",
    entityId: "1",
    entityName: "商城支付配置",
    detail: serializeShopConfig(row),
  });

  return ok(res, serializeShopConfig(row), "商城支付配置已保存");
});

adminShopRouter.post("/products", async (req, res) => {
  const payload = await readProductPayload(req.body);
  if (!payload.product.name) return fail(res, "请输入商品名称或选择课程", 400);
  if (!payload.product.coverUrl) return fail(res, "请填写商品封面或选择带封面的课程", 400);
  if (payload.sku.price <= 0) return fail(res, "商品价格必须大于 0", 400);
  if (payload.courseIds.length === 0 && payload.product.type !== "physical") return fail(res, "课程商品至少需要关联一门课程", 400);

  const product = await prisma.shopProduct.create({
    data: {
      ...payload.product,
      skus: {
        create: [payload.sku],
      },
      courses: {
        create: payload.courseIds.map((courseId) => ({ courseId })),
      },
    },
    include: productInclude,
  });

  await writeAdminAuditLog(req, {
    action: "create_shop_product",
    entityType: "shop_product",
    entityId: product.id,
    entityName: product.name,
    detail: { courseIds: payload.courseIds, price: payload.sku.price, status: payload.product.status },
  });

  return ok(res, serializeShopProduct(product), "商品已创建");
});

adminShopRouter.patch("/products/:productId", async (req, res) => {
  const existing = await prisma.shopProduct.findFirst({
    where: { id: req.params.productId, isDeleted: false },
    include: { skus: true },
  });
  if (!existing) return fail(res, "商品不存在", 404);

  const payload = await readProductPayload(req.body);
  if (!payload.product.name) return fail(res, "请输入商品名称或选择课程", 400);
  if (!payload.product.coverUrl) return fail(res, "请填写商品封面或选择带封面的课程", 400);
  if (payload.sku.price <= 0) return fail(res, "商品价格必须大于 0", 400);
  if (payload.courseIds.length === 0 && payload.product.type !== "physical") return fail(res, "课程商品至少需要关联一门课程", 400);

  const product = await prisma.$transaction(async (tx) => {
    await tx.shopProductCourse.deleteMany({ where: { productId: existing.id } });
    await tx.shopProduct.update({
      where: { id: existing.id },
      data: {
        ...payload.product,
        courses: {
          create: payload.courseIds.map((courseId) => ({ courseId })),
        },
      },
    });

    const sku = existing.skus.find((item) => item.isDefault) ?? existing.skus[0];
    if (sku) {
      await tx.shopSku.update({
        where: { id: sku.id },
        data: payload.sku,
      });
    } else {
      await tx.shopSku.create({
        data: {
          ...payload.sku,
          productId: existing.id,
        },
      });
    }

    return tx.shopProduct.findUnique({
      where: { id: existing.id },
      include: productInclude,
    });
  });

  await writeAdminAuditLog(req, {
    action: "update_shop_product",
    entityType: "shop_product",
    entityId: product.id,
    entityName: product.name,
    detail: { courseIds: payload.courseIds, price: payload.sku.price, status: payload.product.status },
  });

  return ok(res, serializeShopProduct(product), "商品已更新");
});

adminShopRouter.delete("/products/:productId", async (req, res) => {
  const product = await prisma.shopProduct.findFirst({
    where: { id: req.params.productId, isDeleted: false },
    select: { id: true, name: true },
  });
  if (!product) return fail(res, "商品不存在", 404);

  await prisma.shopProduct.update({
    where: { id: product.id },
    data: {
      isDeleted: true,
      status: "off_sale",
    },
  });

  await writeAdminAuditLog(req, {
    action: "delete_shop_product",
    entityType: "shop_product",
    entityId: product.id,
    entityName: product.name,
  });

  return ok(res, { success: true }, "商品已删除");
});

adminShopRouter.get("/orders", async (req, res) => {
  const page = Math.max(1, Number.parseInt(`${req.query.page ?? "1"}`, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(`${req.query.pageSize ?? "20"}`, 10) || 20));
  const status = `${req.query.status ?? ""}`.trim();
  const where = {
    ...(status ? { status } : {}),
  };
  const [total, orders] = await Promise.all([
    prisma.shopOrder.count({ where }),
    prisma.shopOrder.findMany({
      where,
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(res, {
    items: orders.map((order) => ({
      ...serializeShopOrder(order),
      user: {
        id: order.user?.id ?? "",
        phone: order.user?.phone ?? "",
        nickname: order.user?.nickname ?? "",
      },
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
