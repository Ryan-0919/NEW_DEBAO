import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { toast } from "sonner";
import { adminShopService, type AdminShopProductPayload, type AdminShopOrder, type AdminShopConfig } from "../../services/adminShopService";
import { adminUserService, type AdminCourse } from "../../services/adminUserService";
import type { ShopProduct } from "../../services/shopService";

const emptyPayload = (): AdminShopProductPayload => ({
  name: "",
  subtitle: "",
  type: "virtual",
  status: "draft",
  description: "",
  detailContent: "",
  requiresShipping: false,
  sortOrder: 0,
  skuName: "默认规格",
  price: 0,
  originalPrice: "",
  stock: 9999,
  courseIds: [],
});

const statusLabel: Record<string, string> = {
  draft: "草稿",
  on_sale: "已上架",
  off_sale: "已下架",
};

const orderStatusLabel: Record<string, string> = {
  pending_payment: "待支付",
  paid: "已支付",
  partially_fulfilled: "部分交付",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款",
};

const emptyConfig = (): AdminShopConfig => ({
  enableAlipayWap: true,
  paymentGuide: "",
  customerServiceUrl: "",
});

export function ShopManagement() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [orders, setOrders] = useState<AdminShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderLoading, setOrderLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<AdminShopProductPayload>(() => emptyPayload());
  const [configForm, setConfigForm] = useState<AdminShopConfig>(() => emptyConfig());

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [productPayload, coursePayload] = await Promise.all([
        adminShopService.getProducts(),
        adminUserService.getCourses(),
      ]);
      setProducts(productPayload);
      setCourses(coursePayload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商城商品加载失败");
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    setOrderLoading(true);
    try {
      const payload = await adminShopService.getOrders({ page: 1, pageSize: 30 });
      setOrders(payload.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "订单加载失败");
    } finally {
      setOrderLoading(false);
    }
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      setConfigForm(await adminShopService.getConfig());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付配置加载失败");
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
    void loadOrders();
    void loadConfig();
  }, []);

  const resetForm = () => {
    setEditingId("");
    setForm(emptyPayload());
  };

  const editProduct = (product: ShopProduct) => {
    const sku = product.sku ?? product.skus[0];
    setEditingId(product.id);
    setForm({
      name: product.name,
      subtitle: product.subtitle,
      coverUrl: product.coverUrl,
      coverObjectKey: product.coverObjectKey,
      type: product.type,
      status: product.status as AdminShopProductPayload["status"],
      description: product.description,
      detailContent: product.detailContent,
      requiresShipping: product.requiresShipping,
      sortOrder: product.sortOrder ?? 0,
      skuName: sku?.name ?? "默认规格",
      price: Number(sku?.price ?? 0),
      originalPrice: sku?.originalPrice ? Number(sku.originalPrice) : "",
      stock: Number(sku?.stock ?? 9999),
      courseIds: product.courseIds,
    });
  };

  const toggleCourse = (courseId: string) => {
    setForm((current) => ({
      ...current,
      courseIds: current.courseIds.includes(courseId)
        ? current.courseIds.filter((id) => id !== courseId)
        : [...current.courseIds, courseId],
    }));
  };

  const saveProduct = async () => {
    if (!form.name.trim() && form.courseIds.length === 0) {
      toast.warning("请输入商品名称或选择课程");
      return;
    }
    if (Number(form.price) <= 0) {
      toast.warning("请输入正确的价格");
      return;
    }

    try {
      if (editingId) {
        await adminShopService.updateProduct(editingId, form);
        toast.success("商品已更新");
      } else {
        await adminShopService.createProduct(form);
        toast.success("商品已创建");
      }
      resetForm();
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品保存失败");
    }
  };

  const deleteProduct = async (product: ShopProduct) => {
    if (!window.confirm(`确认删除商品「${product.name}」吗？`)) return;
    try {
      await adminShopService.deleteProduct(product.id);
      toast.success("商品已删除");
      await loadProducts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const saveConfig = async () => {
    setConfigLoading(true);
    try {
      setConfigForm(await adminShopService.updateConfig(configForm));
      toast.success("支付配置已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付配置保存失败");
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <Tabs defaultValue="products" className="space-y-5">
      <TabsList className="bg-white">
        <TabsTrigger value="products">商品管理</TabsTrigger>
        <TabsTrigger value="orders">订单记录</TabsTrigger>
        <TabsTrigger value="config">支付配置</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="grid gap-5 xl:grid-cols-[390px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-950">{editingId ? "编辑商品" : "新增商品"}</h3>
              <p className="mt-1 text-xs text-slate-500">课程商品支付成功后自动发放课程权限。</p>
            </div>
            {editingId ? <Button variant="outline" size="sm" onClick={resetForm}>取消</Button> : null}
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">商品名称</label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：26年刑诉小综课程" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">副标题</label>
              <Input value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} placeholder="可选，展示在商城卡片" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">价格</label>
                <Input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">库存</label>
                <Input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">状态</label>
                <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as AdminShopProductPayload["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="on_sale">上架</SelectItem>
                    <SelectItem value="off_sale">下架</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">排序</label>
                <Input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">关联课程</label>
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {courses.map((course) => (
                  <label key={course.id} className="flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-slate-700 hover:bg-blue-50">
                    <input type="checkbox" checked={form.courseIds.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                    <span className="min-w-0 flex-1 truncate">{course.name}</span>
                    <span className="text-xs text-slate-400">{course.courseType === "video" ? "视频" : "音频"}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveProduct()}>
              {editingId ? "保存商品" : "创建商品"}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-semibold text-slate-950">商品列表</h3>
              <p className="mt-1 text-xs text-slate-500">共 {products.length} 个商品</p>
            </div>
            <Button variant="outline" onClick={() => void loadProducts()}>刷新</Button>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? <div className="p-10 text-center text-sm text-slate-500">正在加载...</div> : null}
            {!loading && products.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">暂无商品</div> : null}
            {products.map((product) => (
              <div key={product.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="h-16 w-24 overflow-hidden rounded-lg bg-slate-100">
                  {product.coverUrl ? <img src={product.coverUrl} alt={product.name} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">{product.name}</p>
                    <Badge variant="outline">{statusLabel[product.status] ?? product.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{product.courseNames.join("、") || "未关联课程"}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold text-rose-600">¥{product.sku?.price ?? "0.00"}</p>
                  <p className="text-xs text-slate-400">库存 {product.sku?.stock ?? 0}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => editProduct(product)}>编辑</Button>
                  <Button variant="outline" className="text-rose-600" onClick={() => void deleteProduct(product)}>删除</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </TabsContent>

      <TabsContent value="orders">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h3 className="font-semibold text-slate-950">订单记录</h3>
              <p className="mt-1 text-xs text-slate-500">展示最近 30 条商城订单。</p>
            </div>
            <Button variant="outline" onClick={() => void loadOrders()}>刷新</Button>
          </div>
          <div className="divide-y divide-slate-100">
            {orderLoading ? <div className="p-10 text-center text-sm text-slate-500">正在加载...</div> : null}
            {!orderLoading && orders.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">暂无订单</div> : null}
            {orders.map((order) => (
              <div key={order.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-950">{order.orderNo}</p>
                  <p className="mt-1 text-sm text-slate-700">{order.items.map((item) => item.productName).join("、")}</p>
                  <p className="mt-1 text-xs text-slate-500">{order.user.phone || "-"} · 创建 {order.createdAt} · 支付 {order.paidAt || "-"}</p>
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <Badge variant="outline">{orderStatusLabel[order.status] ?? order.status}</Badge>
                  <span className="font-mono text-lg font-bold text-rose-600">¥{order.payAmount}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </TabsContent>
      <TabsContent value="config">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="font-semibold text-slate-950">支付和客服配置</h3>
            <p className="mt-1 text-xs text-slate-500">控制学员端是否可以发起支付宝收款；支付宝密钥仍在服务器 .env 中配置。</p>
          </div>

          <div className="max-w-3xl space-y-5">
            <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <span>
                <span className="block text-sm font-semibold text-slate-900">开启支付宝支付</span>
                <span className="mt-1 block text-xs text-slate-500">关闭后，学员下单后不能发起支付宝收银台。</span>
              </span>
              <input
                type="checkbox"
                checked={configForm.enableAlipayWap}
                onChange={(event) => setConfigForm({ ...configForm, enableAlipayWap: event.target.checked })}
                className="size-5"
              />
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">支付说明</label>
              <Textarea
                className="min-h-28"
                value={configForm.paymentGuide}
                onChange={(event) => setConfigForm({ ...configForm, paymentGuide: event.target.value })}
                placeholder="例如：支付成功后系统会自动开通课程，如有延迟请联系教务老师。"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">客服链接</label>
              <Input
                value={configForm.customerServiceUrl}
                onChange={(event) => setConfigForm({ ...configForm, customerServiceUrl: event.target.value })}
                placeholder="企业微信、客服页面或联系方式链接"
              />
            </div>

            <Button disabled={configLoading} className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => void saveConfig()}>
              {configLoading ? "保存中..." : "保存支付配置"}
            </Button>
          </div>
        </section>
      </TabsContent>
    </Tabs>
  );
}
