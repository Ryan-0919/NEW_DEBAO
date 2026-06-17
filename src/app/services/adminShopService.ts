import { adminDelete, adminPatchJson, adminPostJson, adminRequest, buildAdminQueryString } from "./adminApiClient";
import type { AdminPagedResult } from "./adminOperationsService";
import type { ShopOrder, ShopProduct } from "./shopService";

export type AdminShopProductPayload = {
  name: string;
  subtitle?: string;
  coverUrl?: string;
  coverObjectKey?: string;
  type: "virtual" | "physical" | "hybrid";
  status: "draft" | "on_sale" | "off_sale";
  description?: string;
  detailContent?: string;
  requiresShipping?: boolean;
  sortOrder?: number;
  skuName?: string;
  price: number;
  originalPrice?: number | "";
  stock: number;
  courseIds: string[];
};

export type AdminShopOrder = ShopOrder & {
  user: {
    id: string;
    phone: string;
    nickname: string;
  };
};

export type AdminShopConfig = {
  enableAlipayWap: boolean;
  paymentGuide: string;
  customerServiceUrl: string;
};

export const adminShopService = {
  getConfig: () => adminRequest<AdminShopConfig>("/api/admin/shop/config"),
  updateConfig: (payload: AdminShopConfig) => adminPatchJson<AdminShopConfig>("/api/admin/shop/config", payload),
  getProducts: () => adminRequest<ShopProduct[]>("/api/admin/shop/products"),
  createProduct: (payload: AdminShopProductPayload) => adminPostJson<ShopProduct>("/api/admin/shop/products", payload),
  updateProduct: (productId: string, payload: AdminShopProductPayload) =>
    adminPatchJson<ShopProduct>(`/api/admin/shop/products/${encodeURIComponent(productId)}`, payload),
  deleteProduct: (productId: string) => adminDelete<{ success: boolean }>(`/api/admin/shop/products/${encodeURIComponent(productId)}`),
  getOrders: (params: { page?: number; pageSize?: number; status?: string } = {}) =>
    adminRequest<AdminPagedResult<AdminShopOrder>>(`/api/admin/shop/orders${buildAdminQueryString(params)}`),
};
