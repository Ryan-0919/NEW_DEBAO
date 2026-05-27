import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Copy,
  Eye,
  Fingerprint,
  KeyRound,
  Laptop,
  Loader2,
  Monitor,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import {
  AdminCourse,
  AdminDevice,
  AdminMockExamPaperSummary,
  AdminMockExamSeriesOption,
  AdminQuestionBank,
  AdminUser,
  AdminUserDetail,
  AdminUserStatus,
  AdminUserSummary,
  BatchImportResult,
  adminUserService,
} from "../../services/adminUserService";

type UserStatusFilter = AdminUserStatus | "all";

const DEVICE_LIMIT = 5;
const PAGE_SIZE = 20;

const adminUi = {
  checkbox:
    "border-slate-300 bg-white text-white data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white focus-visible:ring-blue-200",
  input: "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-blue-100",
  selectTrigger: "border-slate-200 bg-white text-slate-700 focus:ring-blue-100",
  selectContent: "border-slate-200 bg-white text-slate-900 shadow-lg",
  dialog: "border border-slate-200 bg-white text-slate-900 shadow-xl [&_[data-slot=dialog-close]]:text-slate-500 [&_[data-slot=dialog-close]]:hover:bg-slate-100 [&_[data-slot=dialog-close]]:hover:text-slate-900",
  sheet:
    "border-l border-slate-200 bg-white text-slate-900 shadow-xl [&_[data-slot=sheet-close]]:text-slate-500 [&_[data-slot=sheet-close]]:hover:bg-slate-100 [&_[data-slot=sheet-close]]:hover:text-slate-900",
  title: "text-slate-900",
  description: "text-slate-500",
  outlineButton: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900",
  primaryButton: "bg-blue-600 text-white hover:bg-blue-700",
  dangerButton: "bg-rose-600 text-white hover:bg-rose-700",
  ghostButton: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

const statusMeta = {
  active: { label: "启用", className: "bg-emerald-100 text-emerald-700" },
  disabled: { label: "停用", className: "bg-slate-100 text-slate-700" },
} as const;

const examStatusMeta: Record<string, string> = {
  in_progress: "进行中",
  submitted: "已交卷",
};

const orderStatusMeta: Record<string, string> = {
  pending_payment: "待支付",
  paid: "已支付",
  partially_fulfilled: "部分履约",
  completed: "已完成",
  cancelled: "已取消",
  refunding: "退款中",
  refunded: "已退款",
};

const paymentStatusMeta: Record<string, string> = {
  unpaid: "未支付",
  paid: "已支付",
  failed: "支付失败",
  refunded: "已退款",
};

const getUserDisplayName = (user: AdminUser) => user.displayName?.trim() || user.nickname?.trim() || user.phone;

const getUserInitial = (user: AdminUser) => getUserDisplayName(user).slice(0, 1).toUpperCase();

const getDeviceLimit = (user: AdminUser) => user.deviceLimit ?? DEVICE_LIMIT;

const isDeviceFull = (user: AdminUser) => Boolean(user.deviceFull ?? user.deviceCount >= getDeviceLimit(user));

const getPermissionCounts = (user: AdminUser) => ({
  courses: user.permissionCounts?.courses ?? user.coursePermissions.length,
  mockExamSeries: user.permissionCounts?.mockExamSeries ?? (user.mockExamPermissions ?? []).length,
  mockExamPapers: user.permissionCounts?.mockExamPapers ?? (user.mockExamAccessiblePaperIds ?? []).length,
  questionBanks: user.permissionCounts?.questionBanks ?? (user.questionBankPermissions ?? []).length,
  total:
    user.permissionCounts?.total ??
    user.coursePermissions.length + (user.mockExamPermissions ?? []).length + (user.questionBankPermissions ?? []).length,
});

const formatPermissionNames = (ids: string[] = [], nameMap: Map<string, string>, limit = 2) => {
  if (ids.length === 0) return "暂无";
  const names = ids.map((id) => nameMap.get(id) ?? id);
  const visible = names.slice(0, limit).join("、");
  return names.length > limit ? `${visible} 等 ${names.length} 项` : visible;
};

const toggleArrayValue = (value: string, selected: string[], setter: (value: string[]) => void) => {
  setter(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
};

const parsePhones = (value: string) =>
  value
    .split(/\r?\n|,|，|\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

const formatDuration = (seconds?: number) => {
  const safeSeconds = Math.max(0, Number(seconds ?? 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分钟`;
};

function OptionList<T extends { id: string }>({
  items,
  selected,
  onChange,
  emptyText,
  getTitle,
  getMeta,
  tall = false,
}: {
  items: T[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyText: string;
  getTitle: (item: T) => string;
  getMeta?: (item: T) => string;
  tall?: boolean;
}) {
  return (
    <div className={`${tall ? "h-[52vh] min-h-[360px]" : "max-h-72"} space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-slate-900`}>
      {items.map((item) => (
        <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-slate-50">
          <Checkbox className={adminUi.checkbox} checked={selected.includes(item.id)} onCheckedChange={() => toggleArrayValue(item.id, selected, onChange)} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-slate-800">{getTitle(item)}</span>
            {getMeta ? <span className="mt-1 block text-xs leading-5 text-slate-500">{getMeta(item)}</span> : null}
          </span>
        </label>
      ))}
      {items.length === 0 ? <div className="py-5 text-center text-sm text-slate-400">{emptyText}</div> : null}
    </div>
  );
}

export function UserList() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [mockExamSeries, setMockExamSeries] = useState<AdminMockExamSeriesOption[]>([]);
  const [mockExamPapers, setMockExamPapers] = useState<AdminMockExamPaperSummary[]>([]);
  const [questionBanks, setQuestionBanks] = useState<AdminQuestionBank[]>([]);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [summary, setSummary] = useState<AdminUserSummary>({ total: 0, active: 0, disabled: 0, fullDevices: 0 });
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [searchPhone, setSearchPhone] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showBatchPermissionDialog, setShowBatchPermissionDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeviceSheet, setShowDeviceSheet] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [showMockExamResetDialog, setShowMockExamResetDialog] = useState(false);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("den2024");
  const [batchPhones, setBatchPhones] = useState("");
  const [batchImportResult, setBatchImportResult] = useState<BatchImportResult | null>(null);
  const [formCourseIds, setFormCourseIds] = useState<string[]>([]);
  const [formMockExamSeriesIds, setFormMockExamSeriesIds] = useState<string[]>([]);
  const [formQuestionBankIds, setFormQuestionBankIds] = useState<string[]>([]);
  const [resettingPaperId, setResettingPaperId] = useState("");
  const detailRequestRef = useRef(0);

  const courseNameMap = useMemo(() => new Map(courses.map((course) => [course.id, course.name])), [courses]);
  const seriesNameMap = useMemo(() => new Map(mockExamSeries.map((series) => [series.id, series.title])), [mockExamSeries]);
  const questionBankNameMap = useMemo(() => new Map(questionBanks.map((book) => [book.id, book.name])), [questionBanks]);
  const paperSummaryMap = useMemo(() => new Map(mockExamPapers.map((paper) => [paper.id, paper])), [mockExamPapers]);
  const selectedUserMockExamConfigMap = useMemo(
    () => new Map((selectedUser?.mockExamPermissionConfigs ?? []).map((item) => [item.paperId, item])),
    [selectedUser],
  );
  const allCurrentPageSelected = users.length > 0 && users.every((user) => selectedUserIds.includes(user.id));

  const loadSummary = async () => {
    try {
      setSummary(await adminUserService.getSummary());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载用户汇总失败");
    }
  };

  const loadReferenceData = async () => {
    try {
      const [courseList, seriesList, paperList, bookList] = await Promise.all([
        adminUserService.getCourses(),
        adminUserService.getMockExamSeriesOptions(),
        adminUserService.getMockExamPapers(),
        adminUserService.getQuestionBanks(),
      ]);
      setCourses(courseList);
      setMockExamSeries(seriesList);
      setMockExamPapers(paperList);
      setQuestionBanks(bookList);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载权限选项失败");
    }
  };

  const loadUsers = async (
    initial = false,
    nextPage = page,
    overrides?: { keyword?: string; status?: UserStatusFilter; courseId?: string },
  ) => {
    if (initial) setLoading(true);
    else setListLoading(true);

    try {
      const result = await adminUserService.getUsers({
        keyword: overrides?.keyword ?? searchPhone.trim(),
        status: overrides?.status ?? statusFilter,
        courseId: overrides?.courseId ?? courseFilter,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setUsers(result.items);
      setTotalUsers(result.total);
      setTotalPages(result.totalPages);
      if (result.totalPages > 0 && nextPage > result.totalPages) setPage(result.totalPages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载用户列表失败");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadReferenceData(), loadSummary(), loadUsers(true)]);
  }, []);

  useEffect(() => {
    if (!loading) void loadUsers();
  }, [page, statusFilter, courseFilter]);

  const handleSearch = () => {
    setPage(1);
    void loadUsers(false, 1);
  };

  const handleResetFilters = () => {
    setSearchPhone("");
    setStatusFilter("all");
    setCourseFilter("all");
    setPage(1);
    void loadUsers(false, 1, { keyword: "", status: "all", courseId: "all" });
  };

  const refreshUsers = async () => {
    await Promise.all([loadUsers(), loadSummary()]);
  };

  const patchUsers = (userIds: string[], updater: (user: AdminUser) => AdminUser) => {
    const idSet = new Set(userIds);
    setUsers((current) => current.map((user) => (idSet.has(user.id) ? updater(user) : user)));
    setSelectedUser((current) => (current && idSet.has(current.id) ? updater(current) : current));
  };

  const resetPermissionForm = () => {
    setFormCourseIds([]);
    setFormMockExamSeriesIds([]);
    setFormQuestionBankIds([]);
  };

  const handleAddUser = async () => {
    if (!newPhone.trim()) {
      toast.error("请输入手机号");
      return;
    }
    if (formCourseIds.length === 0 && formMockExamSeriesIds.length === 0 && formQuestionBankIds.length === 0) {
      toast.error("请至少选择一种权限");
      return;
    }

    try {
      const result = await adminUserService.createUser({
        phone: newPhone.trim(),
        courseIds: formCourseIds,
        mockExamSeriesIds: formMockExamSeriesIds,
        questionBankBookIds: formQuestionBankIds,
      });
      toast.success(result.isNew ? "用户已新增" : "已为现有用户追加权限");
      setShowAddDialog(false);
      setNewPhone("");
      resetPermissionForm();
      await refreshUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新增用户失败");
    }
  };

  const handleBatchImport = async () => {
    const phones = parsePhones(batchPhones);
    if (phones.length === 0) {
      toast.error("请输入手机号列表");
      return;
    }
    if (formCourseIds.length === 0 && formMockExamSeriesIds.length === 0 && formQuestionBankIds.length === 0) {
      toast.error("请至少选择一种权限");
      return;
    }

    try {
      const result = await adminUserService.batchImportUsers({
        phones,
        courseIds: formCourseIds,
        mockExamSeriesIds: formMockExamSeriesIds,
        questionBankBookIds: formQuestionBankIds,
      });
      setBatchImportResult(result);
      toast.success(`导入完成，新增 ${result.createdCount}，追加权限 ${result.appendedCount}`);
      await refreshUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量导入失败");
    }
  };

  const openPermissionDialog = (user: AdminUser) => {
    setSelectedUser(user);
    setFormCourseIds(user.coursePermissions ?? []);
    setFormMockExamSeriesIds(user.mockExamPermissions ?? []);
    setFormQuestionBankIds(user.questionBankPermissions ?? []);
    setShowPermissionDialog(true);
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;

    const addCourses = formCourseIds.filter((id) => !selectedUser.coursePermissions.includes(id));
    const removeCourses = selectedUser.coursePermissions.filter((id) => !formCourseIds.includes(id));
    const addMockExamSeriesIds = formMockExamSeriesIds.filter((id) => !(selectedUser.mockExamPermissions ?? []).includes(id));
    const removeMockExamSeriesIds = (selectedUser.mockExamPermissions ?? []).filter((id) => !formMockExamSeriesIds.includes(id));
    const addQuestionBankBookIds = formQuestionBankIds.filter((id) => !(selectedUser.questionBankPermissions ?? []).includes(id));
    const removeQuestionBankBookIds = (selectedUser.questionBankPermissions ?? []).filter((id) => !formQuestionBankIds.includes(id));

    try {
      await adminUserService.updateUserPermissions(selectedUser.id, {
        addCourses,
        removeCourses,
        addMockExamSeriesIds,
        removeMockExamSeriesIds,
        addQuestionBankBookIds,
        removeQuestionBankBookIds,
      });
      toast.success("权限已更新");
      setShowPermissionDialog(false);
      await Promise.all([loadUsers(), loadReferenceData()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存权限失败");
    }
  };

  const handleBatchAddPermissions = async () => {
    if (selectedUserIds.length === 0) {
      toast.error("请先选择用户");
      return;
    }
    if (formCourseIds.length === 0 && formMockExamSeriesIds.length === 0 && formQuestionBankIds.length === 0) {
      toast.error("请至少选择一种权限");
      return;
    }

    try {
      await adminUserService.batchAddPermissions({
        userIds: selectedUserIds,
        courseIds: formCourseIds,
        mockExamSeriesIds: formMockExamSeriesIds,
        questionBankBookIds: formQuestionBankIds,
      });
      toast.success("批量加权限完成");
      setShowBatchPermissionDialog(false);
      resetPermissionForm();
      await loadUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量加权限失败");
    }
  };

  const handleChangePassword = async () => {
    if (!selectedUser || !newPassword.trim()) {
      toast.error("请输入新密码");
      return;
    }

    try {
      await adminUserService.updatePassword(selectedUser.id, newPassword.trim());
      toast.success("密码已修改");
      setShowPasswordDialog(false);
      setNewPassword("den2024");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改密码失败");
    }
  };

  const handleSingleStatus = async (user: AdminUser) => {
    const nextStatus: AdminUserStatus = user.status === "active" ? "disabled" : "active";
    try {
      await adminUserService.updateStatus(user.id, nextStatus);
      patchUsers([user.id], (item) => ({ ...item, status: nextStatus }));
      await loadSummary();
      toast.success(nextStatus === "active" ? "用户已启用" : "用户已停用");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态更新失败");
    }
  };

  const handleBatchStatus = async (status: AdminUserStatus) => {
    if (selectedUserIds.length === 0) {
      toast.error("请先选择用户");
      return;
    }

    try {
      await adminUserService.batchUpdateStatus(selectedUserIds, status);
      patchUsers(selectedUserIds, (item) => ({ ...item, status }));
      setSelectedUserIds([]);
      await loadSummary();
      toast.success(status === "active" ? "批量启用完成" : "批量停用完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量状态更新失败");
    }
  };

  const handleSingleDelete = async (user: AdminUser) => {
    if (!window.confirm(`确定删除用户 ${user.phone} 吗？删除后会清空该用户相关数据。`)) return;

    try {
      await adminUserService.deleteUser(user.id);
      toast.success("用户已删除");
      await refreshUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  const openDetailSheet = (user: AdminUser) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setSelectedUser(user);
    setUserDetail(null);
    setDetailError("");
    setShowDetailSheet(true);
    setDetailLoading(true);
    adminUserService
      .getUserDetail(user.id)
      .then((detail) => {
        if (detailRequestRef.current !== requestId) return;
        setUserDetail(detail);
      })
      .catch((error) => {
        if (detailRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : "加载用户详情失败";
        setDetailError(message);
        toast.error(message);
      })
      .finally(() => {
        if (detailRequestRef.current !== requestId) return;
        setDetailLoading(false);
      });
  };

  const copyText = async (label: string, value?: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label}已复制`);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  const handleBatchDelete = async () => {
    if (selectedUserIds.length === 0) {
      toast.error("请先选择用户");
      return;
    }
    if (!window.confirm(`确定删除所选 ${selectedUserIds.length} 位用户吗？删除后会清空用户相关数据。`)) return;

    try {
      await adminUserService.batchDeleteUsers(selectedUserIds);
      setSelectedUserIds([]);
      toast.success("批量删除完成");
      await refreshUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败");
    }
  };

  const handleViewDevices = async (user: AdminUser) => {
    setSelectedUser(user);
    setDevices([]);
    setShowDeviceSheet(true);
    setDeviceLoading(true);
    try {
      setDevices(await adminUserService.getDevices(user.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载设备失败");
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (!selectedUser) return;

    try {
      await adminUserService.removeDevice(deviceId);
      const nextDevices = await adminUserService.getDevices(selectedUser.id);
      setDevices(nextDevices);
      patchUsers([selectedUser.id], (user) => ({
        ...user,
        deviceCount: nextDevices.length,
        deviceFull: nextDevices.length >= getDeviceLimit(user),
        lastDevice: nextDevices[0]
          ? {
              type: nextDevices[0].type,
              model: nextDevices[0].model,
              ip: nextDevices[0].ip,
              loginTime: nextDevices[0].loginTime,
            }
          : null,
      }));
      toast.success("设备已退出");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设备退出失败");
    }
  };

  const handleClearDevices = async () => {
    if (!selectedUser) return;
    if (!window.confirm("确定清空该用户的全部设备吗？")) return;

    try {
      await adminUserService.clearDevices(selectedUser.id);
      setDevices([]);
      patchUsers([selectedUser.id], (user) => ({ ...user, deviceCount: 0, deviceFull: false, lastDevice: null }));
      toast.success("设备已清空");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清空设备失败");
    }
  };

  const selectedUserResetPapers = useMemo(() => {
    if (!selectedUser) return [];
    return (selectedUser.mockExamAccessiblePaperIds ?? [])
      .map((paperId) => ({
        paperId,
        paper: paperSummaryMap.get(paperId),
        config: selectedUserMockExamConfigMap.get(paperId),
      }))
      .sort((left, right) => `${left.paper?.title ?? left.paperId}`.localeCompare(`${right.paper?.title ?? right.paperId}`));
  }, [paperSummaryMap, selectedUser, selectedUserMockExamConfigMap]);

  const handleResetMockExamAttempts = async (paperId: string) => {
    if (!selectedUser) return;
    setResettingPaperId(`attempts:${paperId}`);
    try {
      const result = await adminUserService.resetMockExamAttempts(selectedUser.id, paperId);
      patchUsers([selectedUser.id], (user) => ({
        ...user,
        mockExamPermissionConfigs: [
          ...(user.mockExamPermissionConfigs ?? []).filter((item) => item.paperId !== paperId),
          {
            paperId,
            manualAttemptLimit: result.manualAttemptLimit,
            manualAttemptUsed: result.manualAttemptUsed,
            currentRecordStartedAt: "",
          },
        ],
      }));
      toast.success("考试次数已重置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置次数失败");
    } finally {
      setResettingPaperId("");
    }
  };

  const handleResetMockExamTime = async (paperId: string) => {
    if (!selectedUser) return;
    setResettingPaperId(`time:${paperId}`);
    try {
      const result = await adminUserService.resetMockExamTime(selectedUser.id, paperId);
      patchUsers([selectedUser.id], (user) => ({
        ...user,
        mockExamPermissionConfigs: [
          ...(user.mockExamPermissionConfigs ?? []).filter((item) => item.paperId !== paperId),
          {
            paperId,
            manualAttemptLimit: selectedUserMockExamConfigMap.get(paperId)?.manualAttemptLimit ?? null,
            manualAttemptUsed: selectedUserMockExamConfigMap.get(paperId)?.manualAttemptUsed ?? 0,
            currentRecordStartedAt: result.currentRecordStartedAt,
          },
        ],
      }));
      toast.success("考试时间已重置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置时间失败");
    } finally {
      setResettingPaperId("");
    }
  };

  const renderPermissionOptions = (tall = false) => (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3">
        <Label>课程权限</Label>
        <OptionList
          tall={tall}
          items={courses}
          selected={formCourseIds}
          onChange={setFormCourseIds}
          emptyText="暂无可选课程"
          getTitle={(course) => course.name}
          getMeta={(course) => `${course.courseType === "video" ? "视频" : "音频"} · ${course.contentCount ?? 0} 节`}
        />
      </div>
      <div className="space-y-3">
        <Label>机考权限</Label>
        <OptionList
          tall={tall}
          items={mockExamSeries}
          selected={formMockExamSeriesIds}
          onChange={setFormMockExamSeriesIds}
          emptyText="暂无可选机考系列"
          getTitle={(series) => series.title}
          getMeta={(series) => `${series.paperCount} 套试卷${series.description ? ` · ${series.description}` : ""}`}
        />
      </div>
      <div className="space-y-3">
        <Label>题库权限</Label>
        <OptionList
          tall={tall}
          items={questionBanks}
          selected={formQuestionBankIds}
          onChange={setFormQuestionBankIds}
          emptyText="暂无可选题库"
          getTitle={(book) => book.name}
          getMeta={(book) => `${book.code} · ${book.status}${book.isVisible ? "" : " · 隐藏"}`}
        />
      </div>
    </div>
  );

  const renderNameList = (ids: string[] = [], nameMap: Map<string, string>) => {
    if (ids.length === 0) return <div className="rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-400">暂无</div>;
    return (
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => (
          <Badge key={id} variant="outline" className="max-w-full border-slate-200 bg-slate-50 text-slate-700">
            <span className="max-w-[220px] truncate">{nameMap.get(id) ?? id}</span>
          </Badge>
        ))}
      </div>
    );
  };

  const renderMetricGrid = (items: { label: string; value: string | number; helper?: string }[]) => (
    <div className="grid gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">{item.label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">{item.value}</p>
          {item.helper ? <p className="mt-1 truncate text-xs text-slate-500">{item.helper}</p> : null}
        </div>
      ))}
    </div>
  );

  const renderEmptyState = (text: string) => (
    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-400">{text}</div>
  );

  const renderDetailData = () => {
    if (detailLoading) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-12 text-sm text-slate-500">
          <Loader2 className="mr-2 size-4 animate-spin" />
          用户业务数据加载中...
        </div>
      );
    }

    if (detailError) {
      return (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          {detailError}
          {selectedUser ? (
            <Button variant="outline" size="sm" className="ml-3 border-rose-200 bg-white text-rose-700 hover:bg-rose-50" onClick={() => openDetailSheet(selectedUser)}>
              重新加载
            </Button>
          ) : null}
        </div>
      );
    }

    if (!userDetail) return null;

    return (
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">业务数据</h3>
          <p className="text-xs text-slate-500">学习、题库、机考、订单和后台操作记录</p>
        </div>
        <Tabs defaultValue="learning" className="rounded-lg border border-slate-200 bg-white p-3">
          <TabsList className="grid h-auto w-full grid-cols-5 rounded-lg bg-slate-100 p-1 text-slate-600">
            <TabsTrigger value="learning" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900">
              学习
            </TabsTrigger>
            <TabsTrigger value="questionBanks" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900">
              题库
            </TabsTrigger>
            <TabsTrigger value="mockExams" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900">
              机考
            </TabsTrigger>
            <TabsTrigger value="orders" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900">
              订单
            </TabsTrigger>
            <TabsTrigger value="logs" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-slate-900">
              日志
            </TabsTrigger>
          </TabsList>

          <TabsContent value="learning" className="mt-4 space-y-4">
            {renderMetricGrid([
              { label: "授权课程", value: userDetail.learning.summary.courseCount },
              { label: "音频进度", value: `${userDetail.learning.summary.audioCompletedCount}/${userDetail.learning.summary.audioProgressCount}` },
              { label: "视频进度", value: `${userDetail.learning.summary.videoCompletedCount}/${userDetail.learning.summary.videoProgressCount}` },
              { label: "最近学习", value: userDetail.learning.summary.lastLearningAt || "-" },
            ])}
            <div className="space-y-2">
              {userDetail.learning.courses.map((course) => (
                <div key={course.courseId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{course.courseName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {course.courseType === "video" ? "视频课" : "音频课"} · 已学 {course.progressCount} 节 · 完成 {course.completedCount}/{course.totalContentCount}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                      {course.completionRate}%
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(course.completionRate, 100)}%` }} />
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-500">
                    最近：{course.lastContentName || "-"} {course.lastLearningAt ? `· ${course.lastLearningAt}` : ""}
                  </p>
                </div>
              ))}
              {userDetail.learning.courses.length === 0 ? renderEmptyState("暂无学习记录") : null}
            </div>
          </TabsContent>

          <TabsContent value="questionBanks" className="mt-4 space-y-4">
            {renderMetricGrid([
              { label: "题库", value: userDetail.questionBanks.summary.bookCount },
              { label: "已答", value: userDetail.questionBanks.summary.answeredCount },
              { label: "掌握", value: userDetail.questionBanks.summary.masteredCount },
              { label: "最近练习", value: userDetail.questionBanks.summary.lastPracticedAt || "-" },
            ])}
            <div className="space-y-2">
              {userDetail.questionBanks.items.map((book) => (
                <div key={book.bookId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{book.bookName}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {book.code || "无编码"} · {book.status} {book.isVisible ? "" : "· 隐藏"}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                      重做 {book.redoCount}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <span>已答 {book.answeredCount}</span>
                    <span>看解析 {book.viewedAnswerCount}</span>
                    <span>掌握 {book.masteredCount}</span>
                    <span>最近 {book.lastPracticedAt || "-"}</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-slate-500">
                    位置：{book.lastSubjectName || "-"} {book.lastItemTitle ? `· ${book.lastItemTitle}` : ""}
                  </p>
                </div>
              ))}
              {userDetail.questionBanks.items.length === 0 ? renderEmptyState("暂无题库记录") : null}
            </div>
          </TabsContent>

          <TabsContent value="mockExams" className="mt-4 space-y-4">
            {renderMetricGrid([
              { label: "可访问试卷", value: userDetail.mockExams.summary.accessiblePaperCount },
              { label: "考试记录", value: userDetail.mockExams.summary.recordCount },
              { label: "已交卷", value: userDetail.mockExams.summary.submittedCount },
              { label: "最近考试", value: userDetail.mockExams.summary.lastExamAt || "-" },
            ])}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">最近考试记录</p>
              {userDetail.mockExams.records.slice(0, 8).map((record) => (
                <div key={record.recordId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{record.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.seriesName || "未归属系列"} · 第 {record.attemptNo} 次 · {examStatusMeta[record.status] ?? record.status}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">
                      {record.score}/{record.totalScore || "-"}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <span>答题 {record.answeredCount}/{record.questionCount}</span>
                    <span>正确 {record.correctCount}</span>
                    <span>用时 {formatDuration(record.consumedSeconds)}</span>
                    <span>{record.submittedAt || record.startedAt || "-"}</span>
                  </div>
                </div>
              ))}
              {userDetail.mockExams.records.length === 0 ? renderEmptyState("暂无机考记录") : null}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">试卷权限</p>
              {userDetail.mockExams.permissions.slice(0, 8).map((permission) => (
                <div key={permission.paperId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-800">{permission.title}</span>
                  <span className="text-xs text-slate-500">
                    已用 {permission.manualAttemptUsed} · 剩余 {permission.remainingAttempts ?? "不限"}
                    {permission.currentRecordStartedAt ? ` · 进行中 ${permission.currentRecordStartedAt}` : ""}
                  </span>
                </div>
              ))}
              {userDetail.mockExams.permissions.length === 0 ? renderEmptyState("暂无机考权限") : null}
            </div>
          </TabsContent>

          <TabsContent value="orders" className="mt-4 space-y-4">
            {renderMetricGrid([
              { label: "订单数", value: userDetail.orders.summary.orderCount },
              { label: "已支付订单", value: userDetail.orders.summary.paidOrderCount },
              { label: "支付金额", value: `¥${userDetail.orders.summary.totalPaidAmount}` },
              { label: "最近支付", value: userDetail.orders.summary.lastPaidAt || "-" },
            ])}
            <div className="space-y-2">
              {userDetail.orders.items.map((order) => (
                <div key={order.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold text-slate-900">{order.orderNo}</p>
                      <p className="mt-1 truncate text-sm text-slate-700">{order.productNames.join("、") || "未记录商品"}</p>
                    </div>
                    <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                      ¥{order.payAmount}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <span>{orderStatusMeta[order.status] ?? order.status}</span>
                    <span>{paymentStatusMeta[order.paymentStatus] ?? order.paymentStatus}</span>
                    <span>创建 {order.createdAt}</span>
                    <span>支付 {order.paidAt || "-"}</span>
                  </div>
                </div>
              ))}
              {userDetail.orders.items.length === 0 ? renderEmptyState("暂无订单记录") : null}
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-4 space-y-4">
            {renderMetricGrid([{ label: "后台记录", value: userDetail.auditLogs.summary.count }])}
            <div className="space-y-2">
              {userDetail.auditLogs.items.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{log.action}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {log.operatorName || log.operatorAccount || "系统"} · {log.entityType}
                        {log.entityName ? ` · ${log.entityName}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{log.createdAt}</span>
                  </div>
                  {log.detail ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{log.detail}</p> : null}
                </div>
              ))}
              {userDetail.auditLogs.items.length === 0 ? renderEmptyState("暂无后台操作记录") : null}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    );
  };

  if (loading) {
    return <div className="py-10 text-slate-500">用户数据加载中...</div>;
  }

  return (
    <>
      <div className="space-y-6">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: "用户总数", value: summary.total, icon: Users },
            { label: "启用中", value: summary.active, icon: ShieldCheck },
            { label: "已停用", value: summary.disabled, icon: ShieldOff },
            { label: "设备满额", value: summary.fullDevices, icon: Laptop },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <Icon className="size-4 text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchPhone}
                    onChange={(event) => setSearchPhone(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleSearch();
                    }}
                    placeholder="手机号 / 昵称 / 用户ID"
                    className={`w-64 pl-9 ${adminUi.input}`}
                  />
                </div>
                <Button className={adminUi.primaryButton} onClick={handleSearch}>
                  搜索
                </Button>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value as UserStatusFilter);
                    setPage(1);
                  }}
                >
                <SelectTrigger className={`w-32 ${adminUi.selectTrigger}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={adminUi.selectContent}>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="disabled">停用</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={courseFilter}
                  onValueChange={(value) => {
                    setCourseFilter(value);
                    setPage(1);
                  }}
                >
                <SelectTrigger className={`w-56 ${adminUi.selectTrigger}`}>
                    <SelectValue placeholder="课程筛选" />
                  </SelectTrigger>
                  <SelectContent className={adminUi.selectContent}>
                    <SelectItem value="all">全部课程</SelectItem>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" className={adminUi.ghostButton} onClick={handleResetFilters}>
                  重置筛选
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className={adminUi.outlineButton}
                  onClick={() => {
                    resetPermissionForm();
                    setBatchImportResult(null);
                    setShowBatchDialog(true);
                  }}
                >
                  <UserPlus className="mr-2 size-4" />
                  批量导入
                </Button>
                <Button
                  className={adminUi.primaryButton}
                  onClick={() => {
                    resetPermissionForm();
                    setNewPhone("");
                    setShowAddDialog(true);
                  }}
                >
                  <Plus className="mr-2 size-4" />
                  新增用户
                </Button>
              </div>
            </div>

            {selectedUserIds.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="text-sm font-medium text-blue-800">已选 {selectedUserIds.length} 人，批量操作会包含跨页选择</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className={adminUi.outlineButton}
                    size="sm"
                    onClick={() => {
                      resetPermissionForm();
                      setShowBatchPermissionDialog(true);
                    }}
                  >
                    批量加权限
                  </Button>
                  <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void handleBatchStatus("active")}>
                    批量启用
                  </Button>
                  <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void handleBatchStatus("disabled")}>
                    批量停用
                  </Button>
                  <Button variant="ghost" size="sm" className={adminUi.ghostButton} onClick={() => setSelectedUserIds([])}>
                    清空选择
                  </Button>
                  <Button variant="destructive" size="sm" className={adminUi.dangerButton} onClick={() => void handleBatchDelete()}>
                    批量删除
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      className={adminUi.checkbox}
                      checked={allCurrentPageSelected}
                      onCheckedChange={() => {
                        if (allCurrentPageSelected) {
                          setSelectedUserIds((current) => current.filter((id) => !users.some((user) => user.id === id)));
                        } else {
                          setSelectedUserIds((current) => [...new Set([...current, ...users.map((user) => user.id)])]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">最近登录</th>
                  <th className="px-4 py-3">权限概览</th>
                  <th className="px-4 py-3">设备</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => {
                  const counts = getPermissionCounts(user);
                  const deviceLimit = getDeviceLimit(user);
                  const deviceFull = isDeviceFull(user);
                  return (
                    <tr key={user.id} className="bg-white hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <Checkbox className={adminUi.checkbox} checked={selectedUserIds.includes(user.id)} onCheckedChange={() => toggleArrayValue(user.id, selectedUserIds, setSelectedUserIds)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">
                            {getUserInitial(user)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <button className="truncate text-left font-medium text-slate-900 hover:text-blue-700" onClick={() => openDetailSheet(user)}>
                                {getUserDisplayName(user)}
                              </button>
                              <Badge className={statusMeta[user.status].className}>{statusMeta[user.status].label}</Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                              <span>{user.phone}</span>
                              <span>ID: {user.userCode || user.id.slice(-8)}</span>
                              <span>注册：{user.registeredAt || "-"}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs leading-6 text-slate-500">
                        <div className="flex items-center gap-1 text-slate-700">
                          <Clock3 className="size-3.5 text-slate-400" />
                          {user.lastLogin || "从未登录"}
                        </div>
                        {user.lastDevice ? (
                          <div className="mt-1 max-w-[220px] truncate">
                            {user.lastDevice.model || user.lastDevice.type || "未知设备"}
                            {user.lastDevice.ip ? ` · ${user.lastDevice.ip}` : ""}
                          </div>
                        ) : (
                          <div className="mt-1 text-slate-400">暂无设备记录</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline" className="border-blue-100 bg-blue-50 text-blue-700">
                            课程 {counts.courses}
                          </Badge>
                          <Badge variant="outline" className="border-violet-100 bg-violet-50 text-violet-700">
                            机考 {counts.mockExamSeries}
                          </Badge>
                          <Badge variant="outline" className="border-emerald-100 bg-emerald-50 text-emerald-700">
                            题库 {counts.questionBanks}
                          </Badge>
                        </div>
                        <button className="mt-2 block max-w-[360px] truncate text-left text-xs text-slate-500 hover:text-blue-700" onClick={() => openDetailSheet(user)}>
                          {counts.total > 0
                            ? `${formatPermissionNames(user.coursePermissions, courseNameMap)} / ${formatPermissionNames(user.mockExamPermissions ?? [], seriesNameMap)}`
                            : "暂无权限"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-sm font-medium ${
                            deviceFull ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                          onClick={() => void handleViewDevices(user)}
                        >
                          <Monitor className="size-4" />
                          {user.deviceCount}/{deviceLimit}
                          {deviceFull ? " 已满" : ""}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" onClick={() => openDetailSheet(user)}>
                            <Eye className="mr-2 size-4" />
                            详情
                          </Button>
                          <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => openPermissionDialog(user)}>
                            编辑权限
                          </Button>
                          <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void handleViewDevices(user)}>
                            <Laptop className="mr-2 size-4" />
                            设备
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={adminUi.outlineButton}
                            onClick={() => {
                              setSelectedUser(user);
                              setShowMockExamResetDialog(true);
                            }}
                          >
                            <RefreshCcw className="mr-2 size-4" />
                            机考
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={adminUi.outlineButton}
                            onClick={() => {
                              setSelectedUser(user);
                              setNewPassword("den2024");
                              setShowPasswordDialog(true);
                            }}
                          >
                            <KeyRound className="mr-2 size-4" />
                            改密码
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-500">
                      暂无符合条件的用户
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4">
            <div className="text-sm text-slate-500">
              共 {totalUsers} 位用户，第 {page} / {totalPages} 页
              {listLoading ? "，刷新中..." : ""}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className={adminUi.outlineButton} disabled={page <= 1 || listLoading} onClick={() => setPage((current) => Math.max(current - 1, 1))}>
                上一页
              </Button>
              <Button variant="outline" size="sm" className={adminUi.outlineButton} disabled={page >= totalPages || listLoading} onClick={() => setPage((current) => Math.min(current + 1, totalPages))}>
                下一页
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent side="right" className={`w-full overflow-hidden p-0 sm:max-w-[920px] ${adminUi.sheet}`}>
          <SheetHeader className="border-b border-slate-200 bg-white pr-12">
            <SheetTitle className={adminUi.title}>{selectedUser ? getUserDisplayName(selectedUser) : "用户详情"}</SheetTitle>
            <SheetDescription className={adminUi.description}>{selectedUser ? `${selectedUser.phone} · ID ${selectedUser.userCode || selectedUser.id.slice(-8)}` : "查看用户账号、权限、设备和机考状态。"}</SheetDescription>
          </SheetHeader>
          {selectedUser ? (
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  { label: "账号状态", value: statusMeta[selectedUser.status].label },
                  { label: "注册时间", value: selectedUser.registeredAt || "-" },
                  { label: "最近登录", value: selectedUser.lastLogin || "从未登录" },
                  { label: "设备占用", value: `${selectedUser.deviceCount}/${getDeviceLimit(selectedUser)}` },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">{item.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">基础信息</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void copyText("手机号", selectedUser.phone)}>
                      <Copy className="mr-2 size-4" />
                      复制手机号
                    </Button>
                    <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void copyText("用户ID", selectedUser.id)}>
                      <Fingerprint className="mr-2 size-4" />
                      复制ID
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">昵称</p>
                    <p className="mt-1 text-slate-900">{selectedUser.nickname || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">手机号</p>
                    <p className="mt-1 text-slate-900">{selectedUser.phone}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-slate-500">完整用户ID</p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedUser.id}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">权限详情</h3>
                  <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => openPermissionDialog(selectedUser)}>
                    编辑权限
                  </Button>
                </div>
                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">课程权限</p>
                    {renderNameList(selectedUser.coursePermissions, courseNameMap)}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">机考权限</p>
                    {renderNameList(selectedUser.mockExamPermissions ?? [], seriesNameMap)}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium text-slate-500">题库权限</p>
                    {renderNameList(selectedUser.questionBankPermissions ?? [], questionBankNameMap)}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">设备状态</h3>
                    <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void handleViewDevices(selectedUser)}>
                      设备管理
                    </Button>
                  </div>
                  <div className={isDeviceFull(selectedUser) ? "rounded-lg bg-amber-50 px-3 py-2 text-amber-800" : "rounded-lg bg-slate-50 px-3 py-2 text-slate-700"}>
                    <p className="text-sm font-semibold">
                      {selectedUser.deviceCount}/{getDeviceLimit(selectedUser)}
                      {isDeviceFull(selectedUser) ? " 已满" : ""}
                    </p>
                    {selectedUser.lastDevice ? (
                      <p className="mt-1 text-xs">
                        最近：{selectedUser.lastDevice.model || selectedUser.lastDevice.type || "未知设备"} · {selectedUser.lastDevice.loginTime || "-"}
                        {selectedUser.lastDevice.ip ? ` · ${selectedUser.lastDevice.ip}` : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">暂无设备登录记录</p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">机考状态</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      className={adminUi.outlineButton}
                      onClick={() => {
                        setShowMockExamResetDialog(true);
                      }}
                    >
                      重置管理
                    </Button>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <p>可访问试卷：{selectedUser.mockExamAccessiblePaperIds?.length ?? 0}</p>
                    <p className="mt-1 text-xs text-slate-500">进行中：{(selectedUser.mockExamPermissionConfigs ?? []).filter((item) => item.currentRecordStartedAt).length} 场</p>
                  </div>
                </div>
              </section>

              {renderDetailData()}
            </div>
          ) : null}
          <SheetFooter className="border-t border-slate-200 bg-white">
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowDetailSheet(false)}>
              关闭
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className={`max-h-[92vh] w-[calc(100vw-48px)] max-w-[1200px] overflow-y-auto sm:max-w-[1200px] ${adminUi.dialog}`}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>新增用户</DialogTitle>
            <DialogDescription className={adminUi.description}>默认密码为 den2024，可同时分配课程、机考和题库权限。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="new-phone">手机号</Label>
              <Input id="new-phone" className={adminUi.input} value={newPhone} onChange={(event) => setNewPhone(event.target.value)} placeholder="请输入手机号" />
            </div>
            {renderPermissionOptions(true)}
          </div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button className={adminUi.primaryButton} onClick={() => void handleAddUser()}>确认新增</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent className={`max-h-[92vh] w-[calc(100vw-48px)] max-w-[1200px] overflow-y-auto sm:max-w-[1200px] ${adminUi.dialog}`}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>批量导入用户</DialogTitle>
            <DialogDescription className={adminUi.description}>每行一个手机号，导入时会给新用户和已有用户同步追加所选权限。</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label>手机号列表</Label>
              <Textarea
                value={batchPhones}
                className={adminUi.input}
                onChange={(event) => {
                  setBatchPhones(event.target.value);
                  setBatchImportResult(null);
                }}
                rows={7}
                placeholder={"13800138000\n13900139000"}
              />
            </div>
            {renderPermissionOptions(true)}
            {batchImportResult ? (
              <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                导入结果：新增 {batchImportResult.createdCount}，追加权限 {batchImportResult.appendedCount}
                {batchImportResult.failed.length > 0 ? `，失败 ${batchImportResult.failed.join("、")}` : ""}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowBatchDialog(false)}>
              关闭
            </Button>
            <Button className={adminUi.primaryButton} onClick={() => void handleBatchImport()}>开始导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
        <DialogContent className={`max-h-[92vh] w-[calc(100vw-48px)] max-w-[1200px] overflow-y-auto sm:max-w-[1200px] ${adminUi.dialog}`}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>编辑用户权限</DialogTitle>
            <DialogDescription className={adminUi.description}>{selectedUser ? `${getUserDisplayName(selectedUser)} · ${selectedUser.phone}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="py-4">{renderPermissionOptions(true)}</div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowPermissionDialog(false)}>
              取消
            </Button>
            <Button className={adminUi.primaryButton} onClick={() => void handleSavePermissions()}>保存权限</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchPermissionDialog} onOpenChange={setShowBatchPermissionDialog}>
        <DialogContent className={`max-h-[92vh] w-[calc(100vw-48px)] max-w-[1200px] overflow-y-auto sm:max-w-[1200px] ${adminUi.dialog}`}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>批量加权限</DialogTitle>
            <DialogDescription className={adminUi.description}>当前已选 {selectedUserIds.length} 位用户。</DialogDescription>
          </DialogHeader>
          <div className="py-4">{renderPermissionOptions(true)}</div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowBatchPermissionDialog(false)}>
              取消
            </Button>
            <Button className={adminUi.primaryButton} onClick={() => void handleBatchAddPermissions()}>确认加权限</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className={adminUi.dialog}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>修改密码</DialogTitle>
            <DialogDescription className={adminUi.description}>{selectedUser ? `${getUserDisplayName(selectedUser)} · ${selectedUser.phone}` : "用户默认密码为 den2024"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="new-password">新密码</Label>
            <Input id="new-password" className={adminUi.input} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowPasswordDialog(false)}>
              取消
            </Button>
            <Button className={adminUi.primaryButton} onClick={() => void handleChangePassword()}>确认修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMockExamResetDialog} onOpenChange={setShowMockExamResetDialog}>
        <DialogContent className={`max-h-[92vh] w-[calc(100vw-48px)] max-w-[980px] overflow-y-auto sm:max-w-[980px] ${adminUi.dialog}`}>
          <DialogHeader>
            <DialogTitle className={adminUi.title}>重置机考试卷状态</DialogTitle>
            <DialogDescription className={adminUi.description}>{selectedUser ? `${getUserDisplayName(selectedUser)} · ${selectedUser.phone}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto py-4 pr-2">
            {selectedUserResetPapers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400">
                该用户当前没有可重置的机考试卷
              </div>
            ) : (
              selectedUserResetPapers.map(({ paperId, paper, config }) => {
                const resettingAttempts = resettingPaperId === `attempts:${paperId}`;
                const resettingTime = resettingPaperId === `time:${paperId}`;
                return (
                  <div key={paperId} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-center">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-6 text-slate-900">{paper?.title ?? paperId}</p>
                        <p className="mt-1 text-xs text-slate-500">{[paper?.seriesName, paper?.phase, paper?.year ? `${paper.year}年` : ""].filter(Boolean).join(" · ") || "未绑定系列"}</p>
                        <p className="mt-2 text-xs leading-6 text-slate-500">
                          已用次数：{config?.manualAttemptUsed ?? 0}
                          {config?.manualAttemptLimit ? ` / ${config.manualAttemptLimit}` : ""}
                          {config?.currentRecordStartedAt ? ` · 当前开考时间：${config.currentRecordStartedAt}` : " · 当前没有进行中的考试"}
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
                        <Button variant="outline" size="sm" className={adminUi.outlineButton} disabled={!!resettingPaperId} onClick={() => void handleResetMockExamAttempts(paperId)}>
                          {resettingAttempts ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                          重置次数
                        </Button>
                        <Button variant="outline" size="sm" className={adminUi.outlineButton} disabled={!!resettingPaperId} onClick={() => void handleResetMockExamTime(paperId)}>
                          {resettingTime ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                          重置时间
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowMockExamResetDialog(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={showDeviceSheet} onOpenChange={setShowDeviceSheet}>
        <SheetContent side="right" className={`w-full p-0 sm:max-w-[560px] ${adminUi.sheet}`}>
          <SheetHeader className="border-b border-slate-200 bg-white">
            <SheetTitle className={adminUi.title}>{selectedUser ? `${getUserDisplayName(selectedUser)} · ${selectedUser.phone}` : "设备管理"}</SheetTitle>
            <SheetDescription className={adminUi.description}>查看登录设备并清理占用名额。</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto p-4">
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">当前设备数</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {selectedUser?.deviceCount ?? 0}/{DEVICE_LIMIT}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-3">类型</th>
                    <th className="px-3 py-3">型号</th>
                    <th className="px-3 py-3">登录时间</th>
                    <th className="px-3 py-3">IP</th>
                    <th className="px-3 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deviceLoading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        设备信息加载中...
                      </td>
                    </tr>
                  ) : devices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        暂无设备
                      </td>
                    </tr>
                  ) : (
                    devices.map((device) => (
                      <tr key={device.id} className="bg-white">
                        <td className="px-3 py-3">{device.type}</td>
                        <td className="px-3 py-3">{device.model}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{device.loginTime}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{device.ip}</td>
                        <td className="px-3 py-3 text-right">
                          <Button variant="outline" size="sm" className={adminUi.outlineButton} onClick={() => void handleRemoveDevice(device.id)}>
                            退出
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <SheetFooter className="border-t border-slate-200 bg-white">
            <Button variant="outline" className={adminUi.outlineButton} onClick={() => setShowDeviceSheet(false)}>
              关闭
            </Button>
            <Button variant="destructive" className={adminUi.dangerButton} onClick={() => void handleClearDevices()}>
              清空全部设备
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
