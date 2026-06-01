import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { Textarea } from "../../components/ui/textarea";
import { AdminSystemConfig, PortalConfig, adminOperationsService } from "../../services/adminOperationsService";

type FieldPath = (string | number)[];
type TargetType = "link" | "image";

type BannerItem = {
  id: string;
  badge: string;
  title: string;
  description: string;
  imageUrl: string;
  imageObjectKey: string;
  primaryButtonText: string;
  primaryButtonTargetType: TargetType;
  primaryButtonTarget: string;
  primaryButtonTargetImageUrl: string;
  primaryButtonTargetImageObjectKey: string;
  secondaryButtonText: string;
  secondaryButtonTargetType: TargetType;
  secondaryButtonTarget: string;
  secondaryButtonTargetImageUrl: string;
  secondaryButtonTargetImageObjectKey: string;
  isVisible: boolean;
  sortOrder: number;
};

type SideAdPosition = "left" | "right";

type SideAdItem = {
  title: string;
  description: string;
  imageUrl: string;
  imageObjectKey: string;
  buttonText: string;
  targetType: TargetType;
  target: string;
  targetImageUrl: string;
  targetImageObjectKey: string;
  isVisible: boolean;
};

type JoinGroupItem = {
  title: string;
  statusText: string;
  description: string;
  buttonText: string;
  modalTitle: string;
  modalHint: string;
  qrImageUrl: string;
  qrImageObjectKey: string;
};

const inputClass = "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-amber-400 focus-visible:ring-amber-100";
const selectTriggerClass = "border-slate-200 bg-white text-slate-900 focus-visible:border-amber-400 focus-visible:ring-amber-100";
const emptySideAds: Record<SideAdPosition, SideAdItem> = {
  left: {
    title: "",
    description: "",
    imageUrl: "",
    imageObjectKey: "",
    buttonText: "",
    targetType: "link",
    target: "",
    targetImageUrl: "",
    targetImageObjectKey: "",
    isVisible: false,
  },
  right: {
    title: "",
    description: "",
    imageUrl: "",
    imageObjectKey: "",
    buttonText: "",
    targetType: "link",
    target: "",
    targetImageUrl: "",
    targetImageObjectKey: "",
    isVisible: false,
  },
};
const emptyJoinGroup: JoinGroupItem = {
  title: "进群",
  statusText: "可加入",
  description: "扫码加入26法考资料分享群，获取备考资料、考点汇总和学习交流。",
  buttonText: "扫码进群",
  modalTitle: "扫码加入26法考资料分享群",
  modalHint: "长按或截图后使用微信扫码加入",
  qrImageUrl: "",
  qrImageObjectKey: "",
};

const bannerTargetOptions = [
  { label: "首页", value: "/" },
  { label: "课程中心", value: "/courses" },
  { label: "题库首页", value: "/question-bank" },
  { label: "我的题库", value: "/question-bank/my" },
  { label: "练习题库", value: "/question-bank/practice" },
  { label: "客观题模考", value: "/user/objective-mock-exams" },
  { label: "主观题批改", value: "/user/mock-exams" },
  { label: "法条检索", value: "/user/laws" },
  { label: "打字练习", value: "/user/typing-practice" },
  { label: "我的页面", value: "/profile" },
];
const SIDE_AD_EMPTY_TARGET_VALUE = "__none__";
const CUSTOM_TARGET_VALUE = "__custom__";
const IMAGE_TARGET_VALUE = "__image__";

const normalizeTarget = (value = "", fallback = "/courses") => {
  const normalized = value.trim();
  return normalized || fallback;
};
const normalizeTargetType = (value: unknown): TargetType => (value === "image" ? "image" : "link");
const normalizeTargetByType = (value = "", fallback = "/courses", targetType: TargetType = "link") =>
  targetType === "image" ? value.trim() : normalizeTarget(value, fallback);

const isPresetTarget = (value = "") => bannerTargetOptions.some((item) => item.value === value);
const getTargetLabel = (value = "", targetType: TargetType = "link") => {
  if (targetType === "image") return value.trim() ? "跳转图片" : "跳转图片（未上传）";
  if (!value.trim()) return "未设置";
  const preset = bannerTargetOptions.find((item) => item.value === value);
  if (preset) return preset.label;
  if (/^https?:\/\//i.test(value) || /^\/\//.test(value) || /^www\./i.test(value)) return "外部链接";
  return "自定义路径";
};
const toTargetSelectValue = (value = "", allowEmpty = false, targetType: TargetType = "link") => {
  if (targetType === "image") return IMAGE_TARGET_VALUE;
  if (!value.trim() && allowEmpty) return SIDE_AD_EMPTY_TARGET_VALUE;
  if (isPresetTarget(value)) return value;
  return CUSTOM_TARGET_VALUE;
};
const fromSideAdSelectValue = (value = "") => (value === SIDE_AD_EMPTY_TARGET_VALUE ? "" : value);

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `banner-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getPathValue = (source: any, path: FieldPath, fallback = "") =>
  path.reduce((current, key) => (current && current[key] !== undefined ? current[key] : undefined), source) ?? fallback;

const setPathValue = (source: any, path: FieldPath, value: unknown) => {
  const next = structuredClone(source ?? {});
  let cursor = next;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      cursor[key] = value;
      return;
    }
    if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = typeof path[index + 1] === "number" ? [] : {};
    cursor = cursor[key];
  });
  return next;
};

const emptyBanner = (sortOrder = 0): BannerItem => ({
  id: makeId(),
  badge: "课程推荐",
  title: "新的首页 Banner",
  description: "在这里填写课程卖点、学习规划或重要活动说明。",
  imageUrl: "",
  imageObjectKey: "",
  primaryButtonText: "继续学习",
  primaryButtonTargetType: "link",
  primaryButtonTarget: "/courses",
  primaryButtonTargetImageUrl: "",
  primaryButtonTargetImageObjectKey: "",
  secondaryButtonText: "进入题库",
  secondaryButtonTargetType: "link",
  secondaryButtonTarget: "/question-bank",
  secondaryButtonTargetImageUrl: "",
  secondaryButtonTargetImageObjectKey: "",
  isVisible: true,
  sortOrder,
});

const readLegacyBanner = (portalConfig: PortalConfig = {}): BannerItem => ({
  id: makeId(),
  badge: `${getPathValue(portalConfig, ["memberHome", "hero", "badge"], "快捷入口")}`,
  title: `${getPathValue(portalConfig, ["memberHome", "hero", "title"], "欢迎使用得宝")}`,
  description: `${getPathValue(portalConfig, ["memberHome", "hero", "description"], "课程学习、机考训练、法条检索和打字练习统一收口。")}`,
  imageUrl: `${getPathValue(portalConfig, ["memberHome", "bannerImageUrl"], "/portal/home-hero-banner.png")}`,
  imageObjectKey: `${getPathValue(portalConfig, ["memberHome", "bannerImageObjectKey"], "")}`,
  primaryButtonText: "继续学习",
  primaryButtonTargetType: "link",
  primaryButtonTarget: "/courses",
  primaryButtonTargetImageUrl: "",
  primaryButtonTargetImageObjectKey: "",
  secondaryButtonText: "进入题库",
  secondaryButtonTargetType: "link",
  secondaryButtonTarget: "/question-bank",
  secondaryButtonTargetImageUrl: "",
  secondaryButtonTargetImageObjectKey: "",
  isVisible: true,
  sortOrder: 0,
});

const readBannerItems = (portalConfig: PortalConfig = {}): BannerItem[] => {
  const rawItems = getPathValue(portalConfig, ["memberHome", "banners"], []);
  const source = Array.isArray(rawItems) && rawItems.length > 0 ? rawItems : [readLegacyBanner(portalConfig)];

  return source
    .filter((item) => item && typeof item === "object")
    .map((item, index) => ({
      id: `${item.id ?? ""}` || makeId(),
      badge: `${item.badge ?? "法考学习"}`,
      title: `${item.title ?? ""}`,
      description: `${item.description ?? ""}`,
      imageUrl: `${item.imageUrl ?? ""}`,
      imageObjectKey: `${item.imageObjectKey ?? ""}`,
      primaryButtonText: `${item.primaryButtonText ?? "继续学习"}`,
      primaryButtonTargetType: normalizeTargetType(item.primaryButtonTargetType),
      primaryButtonTarget: normalizeTargetByType(`${item.primaryButtonTarget ?? "/courses"}`, "/courses", normalizeTargetType(item.primaryButtonTargetType)),
      primaryButtonTargetImageUrl: `${item.primaryButtonTargetImageUrl ?? ""}`,
      primaryButtonTargetImageObjectKey: `${item.primaryButtonTargetImageObjectKey ?? ""}`,
      secondaryButtonText: `${item.secondaryButtonText ?? "进入题库"}`,
      secondaryButtonTargetType: normalizeTargetType(item.secondaryButtonTargetType),
      secondaryButtonTarget: normalizeTargetByType(`${item.secondaryButtonTarget ?? "/question-bank"}`, "/question-bank", normalizeTargetType(item.secondaryButtonTargetType)),
      secondaryButtonTargetImageUrl: `${item.secondaryButtonTargetImageUrl ?? ""}`,
      secondaryButtonTargetImageObjectKey: `${item.secondaryButtonTargetImageObjectKey ?? ""}`,
      isVisible: item.isVisible !== false,
      sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
};

const readSideAd = (portalConfig: PortalConfig = {}, position: SideAdPosition): SideAdItem => {
  const raw = getPathValue(portalConfig, ["memberHome", "sideAds", position], {}) ?? {};
  return {
    title: `${raw.title ?? ""}`,
    description: `${raw.description ?? ""}`,
    imageUrl: `${raw.imageUrl ?? ""}`,
    imageObjectKey: `${raw.imageObjectKey ?? ""}`,
    buttonText: `${raw.buttonText ?? ""}`,
    targetType: normalizeTargetType(raw.targetType),
    target: normalizeTargetByType(`${raw.target ?? ""}`, "", normalizeTargetType(raw.targetType)),
    targetImageUrl: `${raw.targetImageUrl ?? ""}`,
    targetImageObjectKey: `${raw.targetImageObjectKey ?? ""}`,
    isVisible: raw.isVisible === true,
  };
};

const readSideAds = (portalConfig: PortalConfig = {}): Record<SideAdPosition, SideAdItem> => ({
  left: readSideAd(portalConfig, "left"),
  right: readSideAd(portalConfig, "right"),
});

const readJoinGroup = (portalConfig: PortalConfig = {}): JoinGroupItem => {
  const raw = getPathValue(portalConfig, ["memberHome", "joinGroup"], {}) ?? {};
  return {
    title: `${raw.title ?? emptyJoinGroup.title}`,
    statusText: `${raw.statusText ?? emptyJoinGroup.statusText}`,
    description: `${raw.description ?? emptyJoinGroup.description}`,
    buttonText: `${raw.buttonText ?? emptyJoinGroup.buttonText}`,
    modalTitle: `${raw.modalTitle ?? emptyJoinGroup.modalTitle}`,
    modalHint: `${raw.modalHint ?? emptyJoinGroup.modalHint}`,
    qrImageUrl: `${raw.qrImageUrl ?? emptyJoinGroup.qrImageUrl}`,
    qrImageObjectKey: `${raw.qrImageObjectKey ?? emptyJoinGroup.qrImageObjectKey}`,
  };
};

const buildSideAds = (sideAds: Record<SideAdPosition, SideAdItem>) => ({
  left: {
    ...sideAds.left,
    title: sideAds.left.title.trim(),
    description: sideAds.left.description.trim(),
    imageUrl: sideAds.left.imageUrl.trim(),
    imageObjectKey: sideAds.left.imageObjectKey.trim(),
    buttonText: sideAds.left.buttonText.trim(),
    targetType: sideAds.left.targetType,
    target: normalizeTargetByType(sideAds.left.target.trim(), "", sideAds.left.targetType),
    targetImageUrl: sideAds.left.targetImageUrl.trim(),
    targetImageObjectKey: sideAds.left.targetImageObjectKey.trim(),
  },
  right: {
    ...sideAds.right,
    title: sideAds.right.title.trim(),
    description: sideAds.right.description.trim(),
    imageUrl: sideAds.right.imageUrl.trim(),
    imageObjectKey: sideAds.right.imageObjectKey.trim(),
    buttonText: sideAds.right.buttonText.trim(),
    targetType: sideAds.right.targetType,
    target: normalizeTargetByType(sideAds.right.target.trim(), "", sideAds.right.targetType),
    targetImageUrl: sideAds.right.targetImageUrl.trim(),
    targetImageObjectKey: sideAds.right.targetImageObjectKey.trim(),
  },
});

const buildJoinGroup = (joinGroup: JoinGroupItem) => ({
  title: joinGroup.title.trim(),
  statusText: joinGroup.statusText.trim(),
  description: joinGroup.description.trim(),
  buttonText: joinGroup.buttonText.trim(),
  modalTitle: joinGroup.modalTitle.trim(),
  modalHint: joinGroup.modalHint.trim(),
  qrImageUrl: joinGroup.qrImageUrl.trim(),
  qrImageObjectKey: joinGroup.qrImageObjectKey.trim(),
});

const buildPortalConfig = (portalConfig: PortalConfig, items: BannerItem[], sideAds: Record<SideAdPosition, SideAdItem>, joinGroup: JoinGroupItem) => {
  const normalizedItems = items.map((item, index) => ({
    ...item,
    badge: item.badge.trim(),
    title: item.title.trim(),
    description: item.description.trim(),
    imageUrl: item.imageUrl.trim(),
    imageObjectKey: item.imageObjectKey.trim(),
    primaryButtonText: item.primaryButtonText.trim(),
    primaryButtonTargetType: item.primaryButtonTargetType,
    primaryButtonTarget: normalizeTargetByType(item.primaryButtonTargetImageUrl || item.primaryButtonTarget, "/courses", item.primaryButtonTargetType),
    primaryButtonTargetImageUrl: item.primaryButtonTargetImageUrl.trim(),
    primaryButtonTargetImageObjectKey: item.primaryButtonTargetImageObjectKey.trim(),
    secondaryButtonText: item.secondaryButtonText.trim(),
    secondaryButtonTargetType: item.secondaryButtonTargetType,
    secondaryButtonTarget: normalizeTargetByType(item.secondaryButtonTargetImageUrl || item.secondaryButtonTarget, "/question-bank", item.secondaryButtonTargetType),
    secondaryButtonTargetImageUrl: item.secondaryButtonTargetImageUrl.trim(),
    secondaryButtonTargetImageObjectKey: item.secondaryButtonTargetImageObjectKey.trim(),
    sortOrder: index,
  }));
  const primary = normalizedItems.find((item) => item.isVisible !== false) || normalizedItems[0] || emptyBanner(0);

  let next = portalConfig;
  next = setPathValue(next, ["memberHome", "banners"], normalizedItems);
  next = setPathValue(next, ["memberHome", "hero", "badge"], primary.badge);
  next = setPathValue(next, ["memberHome", "hero", "title"], primary.title);
  next = setPathValue(next, ["memberHome", "hero", "description"], primary.description);
  next = setPathValue(next, ["memberHome", "bannerImageUrl"], primary.imageUrl);
  next = setPathValue(next, ["memberHome", "bannerImageObjectKey"], primary.imageObjectKey);
  next = setPathValue(next, ["memberHome", "sideAds"], buildSideAds(sideAds));
  next = setPathValue(next, ["memberHome", "joinGroup"], buildJoinGroup(joinGroup));
  return next;
};

function TargetField({
  label,
  targetType = "link",
  value,
  imageUrl = "",
  imageObjectKey = "",
  allowEmpty = false,
  emptyLabel = "不跳转",
  uploading = false,
  saving = false,
  onTypeChange,
  onChange,
  onImageChange,
  onImageUpload,
}: {
  label: string;
  targetType?: TargetType;
  value: string;
  imageUrl?: string;
  imageObjectKey?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  uploading?: boolean;
  saving?: boolean;
  onTypeChange?: (value: TargetType) => void;
  onChange: (value: string) => void;
  onImageChange?: (patch: { imageUrl: string; imageObjectKey: string }) => void;
  onImageUpload?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const options = allowEmpty ? [{ label: emptyLabel, value: SIDE_AD_EMPTY_TARGET_VALUE }, ...bannerTargetOptions] : bannerTargetOptions;
  const selectValue = toTargetSelectValue(value, allowEmpty, targetType);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const displayImageUrl = imageUrl || (targetType === "image" ? value : "");
  const handleLinkChange = (nextValue: string) => {
    onTypeChange?.("link");
    onImageChange?.({ imageUrl: "", imageObjectKey: "" });
    onChange(nextValue);
  };
  const handleImageTarget = (patch: { imageUrl: string; imageObjectKey: string }) => {
    onTypeChange?.("image");
    onImageChange?.(patch);
    onChange(patch.imageUrl);
  };
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(nextValue) => {
          if (nextValue === CUSTOM_TARGET_VALUE) return;
          if (nextValue === IMAGE_TARGET_VALUE) {
            onTypeChange?.("image");
            onChange(displayImageUrl);
            return;
          }
          handleLinkChange(fromSideAdSelectValue(nextValue));
        }}
      >
        <SelectTrigger className={selectTriggerClass}>
          <SelectValue placeholder="快捷选择本站页面" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="focus:bg-amber-50 focus:text-amber-800">
              {option.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_TARGET_VALUE} className="focus:bg-amber-50 focus:text-amber-800">
            自定义链接
          </SelectItem>
          <SelectItem value={IMAGE_TARGET_VALUE} className="focus:bg-amber-50 focus:text-amber-800">
            上传图片并跳转
          </SelectItem>
        </SelectContent>
      </Select>
      {targetType === "image" ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
          {displayImageUrl ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={displayImageUrl} alt="跳转图片预览" className="max-h-52 w-full object-contain" />
            </div>
          ) : (
            <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-xs text-slate-400">
              上传后，用户点击按钮或广告位会打开这张图片
            </div>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploading || saving} onClick={() => imageInputRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              上传跳转图片
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
              disabled={uploading || saving || !displayImageUrl}
              onClick={() => handleImageTarget({ imageUrl: "", imageObjectKey: "" })}
            >
              <Trash2 className="size-4" />
              清空跳转图片
            </Button>
          </div>
          {displayImageUrl ? <p className="mt-2 break-all text-xs text-slate-400">{displayImageUrl}</p> : null}
        </div>
      ) : (
        <Input
          className={inputClass}
          value={value}
          onChange={(event) => handleLinkChange(event.target.value)}
          placeholder={allowEmpty ? "可留空，或填写 /courses、https://example.com" : "填写 /courses、https://example.com 或 www.example.com"}
        />
      )}
      <p className="text-xs text-slate-400">当前：{getTargetLabel(value, targetType)}。外部链接和跳转图片会在新窗口打开，本站路径会在当前站内跳转。</p>
    </div>
  );
}

function SideAdEditor({
  position,
  item,
  uploading,
  uploadingTargetImage,
  saving,
  inputRef,
  onPatch,
  onUpload,
  onTargetImageUpload,
}: {
  position: SideAdPosition;
  item: SideAdItem;
  uploading: boolean;
  uploadingTargetImage: boolean;
  saving: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onPatch: (patch: Partial<SideAdItem>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onTargetImageUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const label = position === "left" ? "左侧广告位" : "右侧广告位";
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">PC 大屏首页主体内容外侧显示，不占用首页内容宽度。建议图片 280 x 440 px 竖图。</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={item.isVisible} onCheckedChange={(checked) => onPatch({ isVisible: checked })} />
          <span className="text-sm text-slate-600">{item.isVisible ? "展示" : "隐藏"}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          <div className="aspect-[7/11] bg-slate-100">
            {item.imageUrl ? (
              <img src={item.imageUrl} alt={item.title || label} className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center px-4 text-center text-xs leading-5 text-slate-400">暂无图片<br />建议 280 x 440 px</div>
            )}
          </div>
          <div className="space-y-2 p-3">
            <input
              ref={(node) => {
                localFileInputRef.current = node;
                inputRef(node);
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUpload}
            />
            <Button variant="outline" className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploading || saving} onClick={() => localFileInputRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              上传图片
            </Button>
            <Button variant="outline" className="w-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50" disabled={uploading || saving || !item.imageUrl} onClick={() => onPatch({ imageUrl: "", imageObjectKey: "" })}>
              <Trash2 className="size-4" />
              清空图片
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>广告标题</Label>
            <Input className={inputClass} value={item.title} onChange={(event) => onPatch({ title: event.target.value })} placeholder="例如：26法考资料包" />
          </div>
          <div className="space-y-2">
            <Label>广告说明</Label>
            <Textarea className={inputClass} rows={3} value={item.description} onChange={(event) => onPatch({ description: event.target.value })} placeholder="可选，显示在图片下方的小字" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>按钮文案</Label>
              <Input className={inputClass} value={item.buttonText} onChange={(event) => onPatch({ buttonText: event.target.value })} placeholder="例如：立即查看" />
            </div>
            <div className="space-y-2">
              <TargetField
                label="跳转链接"
                targetType={item.targetType}
                value={item.target}
                imageUrl={item.targetImageUrl}
                imageObjectKey={item.targetImageObjectKey}
                allowEmpty
                uploading={uploadingTargetImage}
                saving={saving}
                onTypeChange={(targetType) => onPatch({ targetType })}
                onChange={(target) => onPatch({ target })}
                onImageChange={({ imageUrl, imageObjectKey }) => onPatch({ targetImageUrl: imageUrl, targetImageObjectKey: imageObjectKey })}
                onImageUpload={onTargetImageUpload}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function JoinGroupEditor({
  item,
  uploading,
  saving,
  inputRef,
  onPatch,
  onUpload,
}: {
  item: JoinGroupItem;
  uploading: boolean;
  saving: boolean;
  inputRef: (node: HTMLInputElement | null) => void;
  onPatch: (patch: Partial<JoinGroupItem>) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-950">首页进群卡片</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">控制学员首页的进群入口、弹窗文案和二维码。建议上传正方形二维码图。</p>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="aspect-square overflow-hidden rounded-lg bg-white">
            {item.qrImageUrl ? (
              <img src={item.qrImageUrl} alt={item.modalTitle || item.title || "进群二维码"} className="h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-xs leading-5 text-slate-400">暂无二维码<br />建议正方形图片</div>
            )}
          </div>
          {item.qrImageUrl ? <p className="mt-2 line-clamp-2 break-all text-xs text-slate-400">{item.qrImageUrl}</p> : null}
          <div className="mt-3 space-y-2">
            <input
              ref={(node) => {
                localFileInputRef.current = node;
                inputRef(node);
              }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUpload}
            />
            <Button variant="outline" className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploading || saving} onClick={() => localFileInputRef.current?.click()}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              上传二维码
            </Button>
            <Button variant="outline" className="w-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50" disabled={uploading || saving || !item.qrImageUrl} onClick={() => onPatch({ qrImageUrl: "", qrImageObjectKey: "" })}>
              <Trash2 className="size-4" />
              清空二维码
            </Button>
          </div>
        </div>

        <div className="grid content-start gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>卡片标题</Label>
            <Input className={inputClass} value={item.title} onChange={(event) => onPatch({ title: event.target.value })} placeholder="例如：进群" />
          </div>
          <div className="space-y-2">
            <Label>状态文案</Label>
            <Input className={inputClass} value={item.statusText} onChange={(event) => onPatch({ statusText: event.target.value })} placeholder="例如：可加入" />
          </div>
          <div className="space-y-2">
            <Label>按钮文案</Label>
            <Input className={inputClass} value={item.buttonText} onChange={(event) => onPatch({ buttonText: event.target.value })} placeholder="例如：扫码进群" />
          </div>
          <div className="space-y-2">
            <Label>弹窗标题</Label>
            <Input className={inputClass} value={item.modalTitle} onChange={(event) => onPatch({ modalTitle: event.target.value })} placeholder="例如：扫码加入26法考资料分享群" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>进群说明</Label>
            <Textarea className={inputClass} rows={3} value={item.description} onChange={(event) => onPatch({ description: event.target.value })} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>弹窗提示</Label>
            <Input className={inputClass} value={item.modalHint} onChange={(event) => onPatch({ modalHint: event.target.value })} placeholder="例如：长按或截图后使用微信扫码加入" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeBannerManagement() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sideAdFileInputRefs = useRef<Record<SideAdPosition, HTMLInputElement | null>>({ left: null, right: null });
  const joinGroupQrInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<AdminSystemConfig | null>(null);
  const [items, setItems] = useState<BannerItem[]>([emptyBanner(0)]);
  const [sideAds, setSideAds] = useState<Record<SideAdPosition, SideAdItem>>(emptySideAds);
  const [joinGroup, setJoinGroup] = useState<JoinGroupItem>(emptyJoinGroup);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingSideAd, setUploadingSideAd] = useState<SideAdPosition | "">("");
  const [uploadingSideAdTargetImage, setUploadingSideAdTargetImage] = useState<SideAdPosition | "">("");
  const [uploadingJoinGroupQr, setUploadingJoinGroupQr] = useState(false);

  const selectedItem = items.find((item) => item.id === selectedId) || items[0] || emptyBanner(0);
  const visibleCount = items.filter((item) => item.isVisible !== false).length;
  const isBusy = saving || uploading || Boolean(uploadingSideAd) || Boolean(uploadingSideAdTargetImage) || uploadingJoinGroupQr;
  const previewStyle = useMemo(
    () => ({
      backgroundImage: selectedItem.imageUrl
        ? `linear-gradient(105deg,rgba(4,8,20,0.95) 0%,rgba(4,8,20,0.8) 42%,rgba(4,8,20,0.18) 100%), url("${selectedItem.imageUrl}")`
        : "linear-gradient(105deg,#111827 0%,#0f172a 100%)",
    }),
    [selectedItem.imageUrl],
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const payload = await adminOperationsService.getSystemConfig();
      const nextItems = readBannerItems(payload.portalConfig ?? {});
      setConfig(payload);
      setItems(nextItems);
      setSideAds(readSideAds(payload.portalConfig ?? {}));
      setJoinGroup(readJoinGroup(payload.portalConfig ?? {}));
      setSelectedId(nextItems[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "首页 Banner 加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const patchSelected = (patch: Partial<BannerItem>) => {
    setItems((current) => current.map((item) => (item.id === selectedItem.id ? { ...item, ...patch } : item)));
  };

  const patchSideAd = (position: SideAdPosition, patch: Partial<SideAdItem>) => {
    setSideAds((current) => ({
      ...current,
      [position]: {
        ...current[position],
        ...patch,
      },
    }));
  };

  const patchJoinGroup = (patch: Partial<JoinGroupItem>) => {
    setJoinGroup((current) => ({ ...current, ...patch }));
  };

  const saveItems = async (nextItems = items, successText = "首页 Banner、广告位和进群卡片已保存") => {
    if (!config) return;
    const normalizedItems = nextItems
      .map((item, index) => ({ ...item, sortOrder: index }))
      .filter((item) => item.title.trim() || item.description.trim() || item.imageUrl.trim());

    if (normalizedItems.length === 0) {
      toast.warning("请至少保留一张 Banner");
      return;
    }

    if (!normalizedItems.some((item) => item.isVisible !== false)) {
      toast.warning("请至少保留一张展示中的 Banner");
      return;
    }

    setSaving(true);
    try {
      const nextPortalConfig = buildPortalConfig(config.portalConfig ?? {}, normalizedItems, sideAds, joinGroup);
      const payload = await adminOperationsService.updateSystemConfig({ portalConfig: nextPortalConfig });
      const savedItems = readBannerItems(payload.portalConfig ?? {});
      setConfig(payload);
      setItems(savedItems);
      setSideAds(readSideAds(payload.portalConfig ?? {}));
      setJoinGroup(readJoinGroup(payload.portalConfig ?? {}));
      setSelectedId((current) => savedItems.some((item) => item.id === current) ? current : savedItems[0]?.id || "");
      toast.success(successText);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "首页 Banner 保存失败");
    } finally {
      setSaving(false);
    }
  };

  const addBanner = () => {
    const nextItem = emptyBanner(items.length);
    setItems((current) => [...current, nextItem]);
    setSelectedId(nextItem.id);
  };

  const removeSelected = () => {
    if (items.length <= 1) {
      toast.warning("至少保留一张 Banner");
      return;
    }
    const currentIndex = items.findIndex((item) => item.id === selectedItem.id);
    const nextItems = items.filter((item) => item.id !== selectedItem.id).map((item, index) => ({ ...item, sortOrder: index }));
    setItems(nextItems);
    setSelectedId(nextItems[Math.max(0, currentIndex - 1)]?.id || nextItems[0]?.id || "");
  };

  const moveSelected = (direction: -1 | 1) => {
    const currentIndex = items.findIndex((item) => item.id === selectedItem.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const nextItems = [...items];
    const [removed] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, removed);
    setItems(nextItems.map((item, index) => ({ ...item, sortOrder: index })));
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !config) return;

    setUploading(true);
    try {
      const uploaded = await adminOperationsService.uploadSystemImage(file);
      patchSelected({ imageUrl: uploaded.url, imageObjectKey: uploaded.objectKey });
      toast.success("图片已上传，请确认文案后保存轮播");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleSideAdUpload = async (position: SideAdPosition, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !config) return;

    setUploadingSideAd(position);
    try {
      const uploaded = await adminOperationsService.uploadSystemImage(file);
      patchSideAd(position, { imageUrl: uploaded.url, imageObjectKey: uploaded.objectKey });
      toast.success(`${position === "left" ? "左侧" : "右侧"}广告图片已上传，请保存配置`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "广告图片上传失败");
    } finally {
      setUploadingSideAd("");
    }
  };

  const handleTargetImageUpload = async (
    event: ChangeEvent<HTMLInputElement>,
    onUploaded: (uploaded: { url: string; objectKey: string }) => void,
    options: { sideAdPosition?: SideAdPosition } = {},
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !config) return;

    if (options.sideAdPosition) {
      setUploadingSideAdTargetImage(options.sideAdPosition);
    } else {
      setUploading(true);
    }
    try {
      const uploaded = await adminOperationsService.uploadSystemImage(file);
      onUploaded({ url: uploaded.url, objectKey: uploaded.objectKey });
      toast.success("跳转图片已上传，请保存配置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "跳转图片上传失败");
    } finally {
      if (options.sideAdPosition) {
        setUploadingSideAdTargetImage("");
      } else {
        setUploading(false);
      }
    }
  };

  const handleJoinGroupQrUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !config) return;

    setUploadingJoinGroupQr(true);
    try {
      const uploaded = await adminOperationsService.uploadSystemImage(file);
      patchJoinGroup({ qrImageUrl: uploaded.url, qrImageObjectKey: uploaded.objectKey });
      toast.success("进群二维码已上传，请保存配置");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "进群二维码上传失败");
    } finally {
      setUploadingJoinGroupQr(false);
    }
  };

  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-slate-500">首页 Banner 加载中...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">首页运营位管理</h2>
            <p className="mt-1 text-sm text-slate-500">统一维护首页 Banner 轮播、PC 左右广告位和进群卡片。当前 Banner {items.length} 张，展示 {visibleCount} 张。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={loading || isBusy} onClick={() => void loadData()}>
              <RefreshCw className="size-4" />
              重新加载
            </Button>
            <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={isBusy} onClick={addBanner}>
              <Plus className="size-4" />
              新增 Banner
            </Button>
            <Button className="bg-[#c9973e] text-slate-950 hover:bg-[#b88932]" disabled={isBusy} onClick={() => void saveItems()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存配置
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">Banner 轮播图</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">管理首页顶部轮播内容、展示顺序、主按钮和次按钮跳转。</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-semibold text-slate-950">轮播列表</div>
          </div>
          <div className="max-h-[680px] space-y-2 overflow-y-auto p-3">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-lg border p-2 text-left transition ${item.id === selectedItem.id ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="flex gap-3">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-400">无图</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-slate-400">#{index + 1}</span>
                      {item.isVisible !== false ? <Eye className="size-3 text-emerald-600" /> : <EyeOff className="size-3 text-slate-400" />}
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-slate-900">{item.title || "未填写标题"}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">{item.description || "未填写描述"}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div
            className="relative min-h-[360px] overflow-hidden rounded-lg bg-cover bg-center p-8 shadow-sm"
            style={previewStyle}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <div className="relative z-10 flex h-full min-h-[300px] max-w-2xl flex-col justify-center">
              <div className="mb-5 inline-flex w-fit items-center rounded-full border border-amber-300/40 bg-amber-300/15 px-3 py-1 text-xs font-bold tracking-wider text-amber-200">
                {selectedItem.badge || "法考学习"}
              </div>
              <h3 className="whitespace-pre-line font-serif text-4xl font-bold leading-tight text-amber-50 drop-shadow">
                {selectedItem.title || "欢迎使用得宝"}
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-blue-100/75">
                {selectedItem.description || "课程学习、机考训练、法条检索和打字练习统一收口。"}
              </p>
              {selectedItem.primaryButtonText.trim() || selectedItem.secondaryButtonText.trim() ? (
                <div className="mt-7 flex flex-wrap gap-3">
                  {selectedItem.primaryButtonText.trim() ? (
                    <span className="rounded-lg bg-gradient-to-r from-[#c9973e] to-[#e8c46a] px-6 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/25">
                      {selectedItem.primaryButtonText.trim()}
                    </span>
                  ) : null}
                  {selectedItem.secondaryButtonText.trim() ? (
                    <span className="rounded-lg border border-white/15 bg-white/10 px-5 py-3 text-sm text-blue-100">
                      {selectedItem.secondaryButtonText.trim()}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {selectedItem.imageUrl ? <p className="mt-3 break-all text-xs text-slate-500">{selectedItem.imageUrl}</p> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <Label>展示状态</Label>
              <div className="flex items-center gap-2">
                <Switch checked={selectedItem.isVisible !== false} onCheckedChange={(checked) => patchSelected({ isVisible: checked })} />
                <span className="text-sm text-slate-600">{selectedItem.isVisible !== false ? "展示" : "隐藏"}</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={selectedItem.sortOrder <= 0} onClick={() => moveSelected(-1)}>
                <ArrowUp className="size-4" />
                上移
              </Button>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={selectedItem.sortOrder >= items.length - 1} onClick={() => moveSelected(1)}>
                <ArrowDown className="size-4" />
                下移
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <Label>Banner 图片</Label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <div className="mt-3 grid gap-2">
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50" disabled={uploading || saving} onClick={() => fileInputRef.current?.click()}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                上传图片
              </Button>
              <Button variant="outline" className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50" disabled={uploading || saving || !selectedItem.imageUrl} onClick={() => patchSelected({ imageUrl: "", imageObjectKey: "" })}>
                <Trash2 className="size-4" />
                清空当前图片
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>徽标</Label>
                <Input className={inputClass} value={selectedItem.badge} onChange={(event) => patchSelected({ badge: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>标题</Label>
                <Input className={inputClass} value={selectedItem.title} onChange={(event) => patchSelected({ title: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Textarea className={inputClass} rows={5} value={selectedItem.description} onChange={(event) => patchSelected({ description: event.target.value })} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="mb-4">
              <div className="text-sm font-semibold text-slate-950">按钮设置</div>
              <p className="mt-1 text-xs text-slate-500">按钮文字留空则不显示；跳转页面从下方选择。</p>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>主按钮文字</Label>
                <Input className={inputClass} value={selectedItem.primaryButtonText} placeholder="例如：继续学习" onChange={(event) => patchSelected({ primaryButtonText: event.target.value })} />
              </div>
              <TargetField
                label="主按钮跳转链接"
                targetType={selectedItem.primaryButtonTargetType}
                value={selectedItem.primaryButtonTarget}
                imageUrl={selectedItem.primaryButtonTargetImageUrl}
                imageObjectKey={selectedItem.primaryButtonTargetImageObjectKey}
                uploading={uploading}
                saving={saving}
                onTypeChange={(primaryButtonTargetType) => patchSelected({ primaryButtonTargetType })}
                onChange={(primaryButtonTarget) => patchSelected({ primaryButtonTarget })}
                onImageChange={({ imageUrl, imageObjectKey }) => patchSelected({ primaryButtonTargetImageUrl: imageUrl, primaryButtonTargetImageObjectKey: imageObjectKey })}
                onImageUpload={(event) => void handleTargetImageUpload(event, (uploaded) => patchSelected({
                  primaryButtonTargetType: "image",
                  primaryButtonTarget: uploaded.url,
                  primaryButtonTargetImageUrl: uploaded.url,
                  primaryButtonTargetImageObjectKey: uploaded.objectKey,
                }))}
              />
              <div className="border-t border-slate-100 pt-4" />
              <div className="space-y-2">
                <Label>次按钮文字</Label>
                <Input className={inputClass} value={selectedItem.secondaryButtonText} placeholder="例如：进入题库" onChange={(event) => patchSelected({ secondaryButtonText: event.target.value })} />
              </div>
              <TargetField
                label="次按钮跳转链接"
                targetType={selectedItem.secondaryButtonTargetType}
                value={selectedItem.secondaryButtonTarget}
                imageUrl={selectedItem.secondaryButtonTargetImageUrl}
                imageObjectKey={selectedItem.secondaryButtonTargetImageObjectKey}
                uploading={uploading}
                saving={saving}
                onTypeChange={(secondaryButtonTargetType) => patchSelected({ secondaryButtonTargetType })}
                onChange={(secondaryButtonTarget) => patchSelected({ secondaryButtonTarget })}
                onImageChange={({ imageUrl, imageObjectKey }) => patchSelected({ secondaryButtonTargetImageUrl: imageUrl, secondaryButtonTargetImageObjectKey: imageObjectKey })}
                onImageUpload={(event) => void handleTargetImageUpload(event, (uploaded) => patchSelected({
                  secondaryButtonTargetType: "image",
                  secondaryButtonTarget: uploaded.url,
                  secondaryButtonTargetImageUrl: uploaded.url,
                  secondaryButtonTargetImageObjectKey: uploaded.objectKey,
                }))}
              />
            </div>
          </div>

          <Button variant="outline" className="w-full border-rose-200 bg-white text-rose-700 hover:bg-rose-50" disabled={saving || uploading || items.length <= 1} onClick={removeSelected}>
            <Trash2 className="size-4" />
            删除当前 Banner
          </Button>
        </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">首页左右广告位</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">配置 PC 首页内容区两侧的广告图、按钮文案和跳转链接，手机端不展示。</p>
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          {(["left", "right"] as const).map((position) => (
            <SideAdEditor
              key={position}
              position={position}
              item={sideAds[position]}
              uploading={uploadingSideAd === position}
              uploadingTargetImage={uploadingSideAdTargetImage === position}
              saving={isBusy}
              inputRef={(node) => {
                sideAdFileInputRefs.current[position] = node;
              }}
              onPatch={(patch) => patchSideAd(position, patch)}
              onUpload={(event) => void handleSideAdUpload(position, event)}
              onTargetImageUpload={(event) => void handleTargetImageUpload(
                event,
                (uploaded) => patchSideAd(position, {
                  targetType: "image",
                  target: uploaded.url,
                  targetImageUrl: uploaded.url,
                  targetImageObjectKey: uploaded.objectKey,
                }),
                { sideAdPosition: position },
              )}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-950">首页进群卡片</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">配置首页进群入口和扫码弹窗，和 Banner、广告位放在同一个运营位页面统一管理。</p>
        </div>
        <JoinGroupEditor
          item={joinGroup}
          uploading={uploadingJoinGroupQr}
          saving={isBusy}
          inputRef={(node) => {
            joinGroupQrInputRef.current = node;
          }}
          onPatch={patchJoinGroup}
          onUpload={(event) => void handleJoinGroupQrUpload(event)}
        />
      </section>
    </div>
  );
}
