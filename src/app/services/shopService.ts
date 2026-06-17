import { postJson, request } from "./apiClient";

export type ShopSku = {
  id: string;
  name: string;
  price: string;
  originalPrice: string;
  stock: number;
  isDefault?: boolean;
  status: boolean;
};

export type ShopProduct = {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  subtitle: string;
  coverUrl: string;
  coverObjectKey: string;
  type: "virtual" | "physical" | "hybrid";
  status: string;
  description: string;
  detailContent: string;
  requiresShipping: boolean;
  sortOrder: number;
  salesCount: number;
  courseIds: string[];
  courseNames: string[];
  sku: ShopSku | null;
  skus: ShopSku[];
};

export type ShopConfig = {
  enableAlipayWap: boolean;
  paymentGuide: string;
  customerServiceUrl: string;
  paymentMode: string;
};

export type ShopOrder = {
  id: string;
  orderNo: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  payAmount: string;
  freightAmount: string;
  payExpireAt: string;
  paidAt: string;
  createdAt: string;
  items: Array<{
    id: string;
    productId: string;
    skuId: string;
    productName: string;
    productType: string;
    cover: string;
    price: string;
    originalPrice: string;
    quantity: number;
    requiresShipping: boolean;
    courseIds: string[];
  }>;
};

export type ShopPayPayload =
  | {
      status: "paid";
      order: ShopOrder;
    }
  | {
      channel: "alipay";
      method: "form";
      formHtml: string;
      order: ShopOrder;
    };

export const shopService = {
  getConfig: () => request<ShopConfig>("/api/shop/config"),
  getProducts: () => request<ShopProduct[]>("/api/shop/products"),
  createOrder: (payload: { productId: string; skuId?: string; quantity?: number }) =>
    postJson<ShopOrder>("/api/shop/orders", payload),
  getOrder: (orderId: string) => request<ShopOrder>(`/api/shop/orders/${encodeURIComponent(orderId)}`),
  getOrders: () => request<ShopOrder[]>("/api/shop/orders"),
  payOrder: (orderId: string, payload: { channel: "alipay"; scene?: "wap" | "page" }) =>
    postJson<ShopPayPayload>(`/api/shop/orders/${encodeURIComponent(orderId)}/pay`, payload),
  mockPayOrder: (orderId: string) => postJson<ShopOrder>(`/api/shop/orders/${encodeURIComponent(orderId)}/mock-pay`),
};
