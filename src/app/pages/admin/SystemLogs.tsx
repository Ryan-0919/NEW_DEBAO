import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AdminAuditLog, AdminLogsSummary, AdminWebhookLog, adminOperationsService } from "../../services/adminOperationsService";

const PAGE_SIZE = 20;

const emptySummary: AdminLogsSummary = {
  auditTotal: 0,
  webhookTotal: 0,
  auditToday: 0,
  webhookToday: 0,
  webhookFailed: 0,
  latestAuditAt: "",
  latestWebhookAt: "",
};

const webhookStatusMeta: Record<string, { label: string; className: string }> = {
  success: { label: "成功", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  failed: { label: "失败", className: "border-rose-200 bg-rose-50 text-rose-700" },
  skipped: { label: "跳过", className: "border-slate-200 bg-slate-50 text-slate-700" },
};

export function SystemLogs() {
  const [activeTab, setActiveTab] = useState("audit");
  const [summary, setSummary] = useState<AdminLogsSummary>(emptySummary);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<AdminWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditKeyword, setAuditKeyword] = useState("");
  const [auditEntityType, setAuditEntityType] = useState("all");
  const [webhookKeyword, setWebhookKeyword] = useState("");
  const [webhookStatus, setWebhookStatus] = useState("all");
  const [auditPage, setAuditPage] = useState({ page: 1, total: 0, totalPages: 1 });
  const [webhookPage, setWebhookPage] = useState({ page: 1, total: 0, totalPages: 1 });

  const loadSummary = async () => {
    try {
      setSummary(await adminOperationsService.getLogsSummary());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载日志概览失败");
    }
  };

  const loadAuditLogs = async (page = auditPage.page) => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        keyword: auditKeyword.trim(),
        entityType: auditEntityType,
      });
      setAuditLogs(payload.items);
      setAuditPage({ page: payload.page, total: payload.total, totalPages: payload.totalPages });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载操作日志失败");
    } finally {
      setLoading(false);
    }
  };

  const loadWebhookLogs = async (page = webhookPage.page) => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getWebhookLogs({
        page,
        pageSize: PAGE_SIZE,
        keyword: webhookKeyword.trim(),
        status: webhookStatus,
      });
      setWebhookLogs(payload.items);
      setWebhookPage({ page: payload.page, total: payload.total, totalPages: payload.totalPages });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载 Webhook 日志失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrent = async () => {
    await loadSummary();
    if (activeTab === "audit") await loadAuditLogs(1);
    else await loadWebhookLogs(1);
  };

  useEffect(() => {
    void Promise.all([loadSummary(), loadAuditLogs(1)]);
  }, []);

  useEffect(() => {
    if (activeTab === "webhook" && webhookLogs.length === 0) void loadWebhookLogs(1);
  }, [activeTab]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["操作日志", summary.auditTotal],
          ["今日操作", summary.auditToday],
          ["Webhook日志", summary.webhookTotal],
          ["今日Webhook", summary.webhookToday],
          ["Webhook失败", summary.webhookFailed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <TabsList className="bg-slate-100">
              <TabsTrigger value="audit">操作日志</TabsTrigger>
              <TabsTrigger value="webhook">Webhook 日志</TabsTrigger>
            </TabsList>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading} onClick={() => void refreshCurrent()}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              刷新
            </Button>
          </div>

          <TabsContent value="audit" className="m-0">
            <div className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={auditKeyword}
                  onChange={(event) => setAuditKeyword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void loadAuditLogs(1); }}
                  placeholder="搜索操作人、动作、对象或详情"
                />
              </div>
              <Select value={auditEntityType} onValueChange={setAuditEntityType}>
                <SelectTrigger className="w-[180px] border-slate-200 bg-white text-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  <SelectItem value="all">全部对象</SelectItem>
                  <SelectItem value="user">用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="system_config">系统配置</SelectItem>
                  <SelectItem value="mock_exam_record">考试记录</SelectItem>
                  <SelectItem value="mock_exam_paper">机考试卷</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => void loadAuditLogs(1)}>
                搜索
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">时间</th>
                    <th className="px-5 py-3">操作人</th>
                    <th className="px-5 py-3">动作</th>
                    <th className="px-5 py-3">对象</th>
                    <th className="px-5 py-3">详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center text-slate-500">{loading ? "操作日志加载中..." : "暂无操作日志"}</td></tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{log.createdAt}</td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{log.operatorName || log.operatorAccount || "系统"}</p>
                          <p className="mt-1 text-xs text-slate-500">{log.operatorAccount}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-700">{log.action}</td>
                        <td className="px-5 py-4 text-slate-700">
                          <p>{log.entityType}</p>
                          <p className="mt-1 max-w-[240px] truncate text-xs text-slate-500">{log.entityName || log.entityId}</p>
                        </td>
                        <td className="max-w-[420px] px-5 py-4">
                          <p className="line-clamp-3 break-words text-xs leading-5 text-slate-500">{log.detail || "-"}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>第 {auditPage.page} / {auditPage.totalPages} 页，共 {auditPage.total} 条</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={auditPage.page <= 1 || loading} onClick={() => void loadAuditLogs(auditPage.page - 1)}>上一页</Button>
                <Button variant="outline" disabled={auditPage.page >= auditPage.totalPages || loading} onClick={() => void loadAuditLogs(auditPage.page + 1)}>下一页</Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="webhook" className="m-0">
            <div className="flex flex-wrap gap-3 border-b border-slate-100 px-5 py-4">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={webhookKeyword}
                  onChange={(event) => setWebhookKeyword(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void loadWebhookLogs(1); }}
                  placeholder="搜索标题、场景、错误信息"
                />
              </div>
              <Select value={webhookStatus} onValueChange={setWebhookStatus}>
                <SelectTrigger className="w-[160px] border-slate-200 bg-white text-slate-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                  <SelectItem value="skipped">跳过</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => void loadWebhookLogs(1)}>
                搜索
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">时间</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">场景</th>
                    <th className="px-5 py-3">标题</th>
                    <th className="px-5 py-3">响应</th>
                    <th className="px-5 py-3">错误</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {webhookLogs.length === 0 ? (
                    <tr><td colSpan={6} className="py-16 text-center text-slate-500">{loading ? "Webhook 日志加载中..." : "暂无 Webhook 日志"}</td></tr>
                  ) : (
                    webhookLogs.map((log) => {
                      const meta = webhookStatusMeta[log.status] ?? webhookStatusMeta.skipped;
                      return (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{log.createdAt}</td>
                          <td className="px-5 py-4"><Badge variant="outline" className={meta.className}>{meta.label}</Badge></td>
                          <td className="px-5 py-4 text-slate-700">{log.scene}</td>
                          <td className="px-5 py-4 text-slate-700">{log.title || "-"}</td>
                          <td className="px-5 py-4 text-slate-600">{log.responseCode ?? "-"}</td>
                          <td className="max-w-[360px] px-5 py-4 text-xs leading-5 text-rose-600">{log.errorMessage || "-"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500">
              <span>第 {webhookPage.page} / {webhookPage.totalPages} 页，共 {webhookPage.total} 条</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={webhookPage.page <= 1 || loading} onClick={() => void loadWebhookLogs(webhookPage.page - 1)}>上一页</Button>
                <Button variant="outline" disabled={webhookPage.page >= webhookPage.totalPages || loading} onClick={() => void loadWebhookLogs(webhookPage.page + 1)}>下一页</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
