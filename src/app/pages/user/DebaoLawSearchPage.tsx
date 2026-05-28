import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { lawService } from "../../services/lawService";
import type { LawContentItem, LawContentPayload, LawOverview, LawTreeNode } from "../../services/lawService";

type DebaoLawSearchPageProps = {
  setPage: (page: string) => void;
  embedded?: boolean;
  onClose?: () => void;
  fullscreenBridge?: {
    isFullscreen: boolean;
    toggleFullscreen: () => void;
  };
};

type LawTreeStateNode = LawTreeNode & {
  parentId?: string;
  isOpen?: boolean;
  children?: LawTreeStateNode[];
};

type SearchMatch = {
  id: string;
};

const LEFT_WIDTH_MIN = 240;
const LEFT_WIDTH_MAX = 680;
const LEFT_COLLAPSE_THRESHOLD = 72;
const LEFT_REOPEN_DEFAULT_WIDTH = 320;
const MAX_ICON_URL = "https://oss.zhumavip.com/images/lawPage/ic-fangda.png";
const RESTORE_ICON_URL = "https://oss.zhumavip.com/images/lawPage/ic-zuixiaohua.png";

const lawStyles = `
.debao-law-page{box-sizing:border-box;width:100%;height:100%;min-height:100vh;background:#f5f5f5;color:#404040;font-family:"PingFang SC","Microsoft YaHei",sans-serif}
.debao-law-page *{box-sizing:border-box}
.debao-law-outer{display:flex;justify-content:center;min-height:100vh;padding:0 16px 40px}
.debao-law-outer.embedded{min-height:100%;height:100%;padding:0;background:#f5f5f5}
.debao-law-box{display:flex;flex-direction:column;color:#404040;background:#fff;box-shadow:0 0 10px rgba(0,0,0,.1);border-radius:5px;overflow:hidden;user-select:none;width:1200px;height:calc(100vh - 80px);min-height:540px;margin-top:40px;margin-bottom:40px}
.debao-law-box.fullscreen{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;min-height:0!important;margin:0!important;border-radius:0!important;z-index:1000}
.debao-law-outer.embedded .debao-law-box{width:100%;height:100%;min-height:0;margin:0;border-radius:0;box-shadow:none}
.debao-law-top{flex-shrink:0;height:40px;width:100%;padding:0 15px;font-size:14px;line-height:40px;color:#41485d;overflow:hidden}
.debao-law-title{float:left;color:#333;font-family:"Songti SC","STSong",serif}
.debao-law-top-actions{float:right;display:flex;align-items:center;height:40px;gap:8px}
.debao-law-fullscreen{display:block;width:12px;height:12px;margin:0;padding:14px 10px;border:0;background:transparent;cursor:pointer;box-sizing:content-box}
.debao-law-fullscreen img{display:block;width:12px;height:12px}
.debao-law-close{float:right;margin-top:9px;height:22px;border:1px solid #dfdfdf;border-radius:4px;background:#fafafa;color:#41485d;font-size:12px;line-height:20px;cursor:pointer}
.debao-law-body{display:flex;position:relative;height:calc(100% - 40px);border-top:1px solid #dfdfdf}
.debao-law-left{flex-shrink:0;height:100%;border-right:1px solid #dfdfdf;overflow:hidden;background:#fff}
.debao-law-left-collapsed{position:absolute;left:0;top:0;bottom:0;width:12px;border-right:1px solid #d7dbe5;background:linear-gradient(180deg,#f8f8f8 0%,#f1f1f1 100%);cursor:col-resize;z-index:3}
.debao-law-nav{height:33px;width:100%;display:flex;align-items:center;justify-content:space-between;padding:0 13px;font-size:14px;line-height:33px;background:#fafafa;border-bottom:1px solid #dfdfdf}
.debao-law-nav div{color:#333;font-family:"Songti SC","STSong",serif}
.debao-law-nav-button{flex-shrink:0;padding:11px;margin:-11px;border:0;background:transparent;cursor:pointer;color:#666f83}
.debao-law-inline-icon{display:block;width:16px;height:16px;color:#666f83;fill:currentColor}
.debao-law-searchbar{flex-shrink:0;display:flex;align-items:center;height:44px}
.debao-law-searchbox{display:flex;align-items:center;height:32px;margin:0 13px}
.debao-law-searchbox input{width:177px;height:30px;background:#fafafa;border:1px solid #dfdfdf;border-radius:4px;padding:0 10px;outline:none;font-family:"Songti SC","STSong",serif;color:#404040}
.debao-law-searchbox input::placeholder{color:#aaa}
.debao-law-search-button{margin-left:16px;width:16px;height:16px;border:0;background:transparent;cursor:pointer;padding:0;color:#666f83}
.debao-law-search-right{margin-left:3px;display:flex;align-items:center;justify-content:space-between;padding-right:10px;width:60px;height:100%}
.debao-law-search-nav{display:flex;align-items:center;justify-content:center;width:20px;height:30px;border:1px solid #dfdfdf;border-radius:4px;background:#fff;cursor:pointer}
.debao-law-list-area{height:calc(100% - 77px);overflow:auto;padding:5px;font-family:"Songti SC","STSong",serif}
.debao-law-list-area::-webkit-scrollbar-thumb,.debao-law-right::-webkit-scrollbar-thumb{background:#cdcdcd!important;border-radius:2px}
.debao-law-list-area::-webkit-scrollbar{width:12px}
.debao-law-right::-webkit-scrollbar{width:18px}
.debao-law-list-area::-webkit-scrollbar-track,.debao-law-right::-webkit-scrollbar-track{background:#f5f5f5}
.debao-law-tree{display:flex;flex-direction:column;align-items:flex-start}
.debao-law-children{padding-left:18px;background:url("https://osscdn2.zhongheschool.com/common/defaultType/202404/202404261636300721.gif") 0 0 repeat-y}
.debao-law-row{display:flex;align-items:center;height:22px;padding:1px;font-size:14px;white-space:nowrap;cursor:default;color:#404040}
.debao-law-row:hover{background:#ebebeb}
.debao-law-row-inner{display:flex;align-items:center}
.debao-law-icon{flex-shrink:0;height:18px;width:18px;background-image:url("https://osscdn2.zhongheschool.com/common/defaultType/202503/202503171558340059.png")}
.debao-law-icon-folder-closed{background-position:-74px -18px}
.debao-law-icon-folder-closed-first{background-position:-74px 0}
.debao-law-icon-folder-closed-last{background-position:-74px -36px}
.debao-law-icon-folder-open{background-position:-92px -18px}
.debao-law-icon-folder-open-first{background-position:-92px 0}
.debao-law-icon-folder-open-last{background-position:-92px -36px}
.debao-law-icon-file{background-position:-56px -18px}
.debao-law-icon-file-first{background-position:-56px 0}
.debao-law-icon-file-last{background-position:-56px -36px}
.debao-law-selected-folder{padding:0 4px 0 0;background:#f2d493!important;z-index:3}
.debao-law-selected-file{margin-left:-1px;padding:0 4px 0 0;background:#f2d493!important;z-index:3}
.debao-law-movebar{flex-shrink:0;margin:0;width:12px;height:100%;cursor:col-resize;position:relative;z-index:2;background:linear-gradient(90deg,transparent 0,transparent 5px,#d7dbe5 5px,#d7dbe5 7px,transparent 7px,transparent 100%)}
.debao-law-movebar:hover{background:linear-gradient(90deg,transparent 0,transparent 4px,#9fb3d9 4px,#9fb3d9 8px,transparent 8px,transparent 100%)}
.debao-law-right{width:100%;height:100%;line-height:22px;white-space:pre-wrap;user-select:text;overflow-y:auto;background:#fff;color:#404040}
.debao-law-section{padding:20px 25px;font-family:"Songti SC","STSong",serif;line-height:28px;font-size:14px;color:#404040}
.debao-law-section h4{text-align:center;font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-weight:800}
.debao-law-placeholder{padding:0!important;display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#fff;font-size:46px;font-family:"Songti SC","STSong",serif;font-weight:700;text-align:left;color:#454545;line-height:46px}
@media (max-width:1240px){.debao-law-outer:not(.embedded){padding:8px}.debao-law-outer:not(.embedded) .debao-law-box{width:calc(100vw - 16px);height:calc(100vh - 16px);margin-top:8px;margin-bottom:8px}}
@media (max-width:768px){.debao-law-outer{padding:0}.debao-law-box,.debao-law-box.fullscreen{position:relative!important;inset:auto!important;width:100%!important;height:100vh!important;min-height:0!important;margin:0!important;border-radius:0!important;box-shadow:none!important;z-index:auto}.debao-law-top{height:48px;line-height:48px;padding:0 14px;font-size:15px}.debao-law-top-actions{height:48px}.debao-law-fullscreen{display:none}.debao-law-body{flex-direction:column;height:calc(100% - 48px)}.debao-law-left{width:100%!important;height:min(42vh,360px)!important;border-right:0;border-bottom:1px solid #dfdfdf}.debao-law-movebar,.debao-law-left-collapsed{display:none}.debao-law-searchbar{flex-wrap:wrap;gap:10px;height:auto;padding:10px 12px}.debao-law-searchbox{flex:1 1 100%;min-width:0;margin:0}.debao-law-searchbox input{width:100%}.debao-law-search-button{margin-left:12px}.debao-law-search-right{margin-left:0;width:auto;height:auto;padding-right:0;gap:8px}.debao-law-list-area{height:calc(100% - 86px);padding:8px}.debao-law-right{flex:1;min-height:0}.debao-law-section{padding:16px 14px;line-height:26px;font-size:15px}.debao-law-placeholder{padding:24px!important;font-size:32px;line-height:38px}}
`;

const cloneTree = (nodes: LawTreeNode[], parentId = ""): LawTreeStateNode[] =>
  nodes.map((node, index) => ({
    ...node,
    parentId,
    isOpen: index === 0 || node.id === parentId,
    children: node.children ? cloneTree(node.children, node.id) : [],
  }));

const buildNodeMap = (nodes: LawTreeStateNode[]) => {
  const map = new Map<string, LawTreeStateNode>();
  const walk = (items: LawTreeStateNode[]) => {
    items.forEach((item) => {
      map.set(item.id, item);
      if (item.children?.length) walk(item.children);
    });
  };
  walk(nodes);
  return map;
};

const hasChildren = (node: LawTreeStateNode) => Boolean(node.children?.length);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getLawNodeIconClass = (node: LawTreeStateNode, index: number, total: number) => {
  const first = index === 0 && !node.parentId;
  const last = index === total - 1;
  if (hasChildren(node)) {
    if (node.isOpen) return first ? "debao-law-icon-folder-open-first" : last ? "debao-law-icon-folder-open-last" : "debao-law-icon-folder-open";
    return first ? "debao-law-icon-folder-closed-first" : last ? "debao-law-icon-folder-closed-last" : "debao-law-icon-folder-closed";
  }
  return first ? "debao-law-icon-file-first" : last ? "debao-law-icon-file-last" : "debao-law-icon-file";
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg className="debao-law-inline-icon" viewBox="0 0 1024 1024" aria-hidden="true">
      {direction === "left" ? (
        <path d="M650.667 213.333a42.667 42.667 0 0 1 0 60.334L412.587 512l238.08 238.08a42.667 42.667 0 1 1-60.334 60.334l-268.245-268.16a42.667 42.667 0 0 1 0-60.334l268.245-268.16a42.667 42.667 0 0 1 60.334 0Z" />
      ) : (
        <path d="M373.333 810.667a42.667 42.667 0 0 1 0-60.334L611.413 512 373.333 273.92a42.667 42.667 0 1 1 60.334-60.334l268.245 268.16a42.667 42.667 0 0 1 0 60.334l-268.245 268.16a42.667 42.667 0 0 1-60.334 0Z" />
      )}
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="debao-law-inline-icon" viewBox="0 0 1024 1024" aria-hidden="true">
      <path d="M448 128a320 320 0 0 1 251.3 518.1l151.3 151.3a42.7 42.7 0 0 1-60.3 60.3L639 706.4A320 320 0 1 1 448 128Zm0 85.3a234.7 234.7 0 1 0 0 469.4 234.7 234.7 0 0 0 0-469.4Z" />
    </svg>
  );
}

function LawTreeRows({
  nodes,
  activeNodeId,
  onSelect,
  onToggle,
}: {
  nodes: LawTreeStateNode[];
  activeNodeId: string;
  onSelect: (node: LawTreeStateNode, loadContent?: boolean) => void;
  onToggle: (node: LawTreeStateNode) => void;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const childNodes = node.children ?? [];
        const folder = hasChildren(node);
        const active = node.id === activeNodeId;
        const iconClass = getLawNodeIconClass(node, index, nodes.length);
        return (
          <div key={node.id}>
            <div
              className={`debao-law-row ${folder && active ? "debao-law-selected-folder" : ""}`}
              title={node.title}
              data-law-node-id={node.id}
              onClick={() => onSelect(node, true)}
              onDoubleClick={() => {
                if (folder) onToggle(node);
                onSelect(node, true);
              }}
            >
              <div className="debao-law-row-inner">
                <div
                  className={`debao-law-icon ${iconClass}`}
                  onClick={(event) => {
                    if (!folder) return;
                    event.stopPropagation();
                    onToggle(node);
                  }}
                />
                <div className={!folder && active ? "debao-law-selected-file" : ""}>{node.title}</div>
              </div>
            </div>
            {folder && node.isOpen ? (
              <div className="debao-law-children">
                <LawTreeRows nodes={childNodes} activeNodeId={activeNodeId} onSelect={onSelect} onToggle={onToggle} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function LawContent({ item }: { item: LawContentItem }) {
  return (
    <div
      className="debao-law-section"
      id={`law-section-${item.id}`}
      dangerouslySetInnerHTML={{ __html: item.content || "暂无正文内容" }}
    />
  );
}

export function DebaoLawSearchPage({ setPage, embedded = false, onClose, fullscreenBridge }: DebaoLawSearchPageProps) {
  const [overview, setOverview] = useState<LawOverview | null>(null);
  const [tree, setTree] = useState<LawTreeStateNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState("");
  const [contentNodeId, setContentNodeId] = useState("");
  const [content, setContent] = useState<LawContentPayload | null>(null);
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState("");
  const [leftWidth, setLeftWidth] = useState(390);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const dragRef = useRef<{ x: number; width: number } | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const matchIndexRef = useRef(0);
  const contentCacheRef = useRef<Map<string, LawContentPayload>>(new Map());

  const nodeMap = useMemo(() => buildNodeMap(tree), [tree]);
  const displayItems = content?.items ?? [];
  const isFullscreen = fullscreenBridge ? Boolean(fullscreenBridge.isFullscreen) : internalFullscreen;
  const canToggleFullscreen = true;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadingOverview(true);
      setError("");
      try {
        const data = await lawService.getOverview();
        if (!active) return;
        const nextTree = cloneTree(data.tree);
        setOverview(data);
        setTree(nextTree);
        const initialId = data.initialNodeId || nextTree[0]?.id || "";
        setActiveNodeId(initialId);
        setContentNodeId(initialId);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "法条目录加载失败");
      } finally {
        if (active) setLoadingOverview(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!embedded || !isFullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [embedded, isFullscreen, fullscreenBridge]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncMobileLayoutState = () => {
      if (window.matchMedia("(max-width: 768px)").matches) {
        setLeftCollapsed(false);
        setInternalFullscreen(false);
      }
    };
    syncMobileLayoutState();
    window.addEventListener("resize", syncMobileLayoutState);
    return () => window.removeEventListener("resize", syncMobileLayoutState);
  }, []);

  useEffect(() => {
    if (!contentNodeId) {
      setContent(null);
      return;
    }

    let active = true;

    const loadContent = async () => {
      setLoadingContent(true);
      setError("");
      try {
        const cached = contentCacheRef.current.get(contentNodeId);
        const data = cached ?? (await lawService.getContent(contentNodeId));
        if (!cached) contentCacheRef.current.set(contentNodeId, data);
        if (active) setContent(data);
      } catch (err) {
        if (active) {
          setContent(null);
          setError(err instanceof Error ? err.message : "法条内容加载失败");
        }
      } finally {
        if (active) setLoadingContent(false);
      }
    };

    void loadContent();
    return () => {
      active = false;
    };
  }, [contentNodeId]);

  useEffect(() => {
    rightRef.current?.scrollTo({ top: 0 });
  }, [contentNodeId]);

  useEffect(() => {
    matchIndexRef.current = matchIndex;
  }, [matchIndex]);

  useEffect(() => {
    const stopDrag = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const handleMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const nextWidth = drag.width + event.pageX - drag.x;
      if (nextWidth <= LEFT_COLLAPSE_THRESHOLD) {
        setLeftCollapsed(true);
      } else {
        setLeftCollapsed(false);
        setLeftWidth(clamp(nextWidth, LEFT_WIDTH_MIN, LEFT_WIDTH_MAX));
      }
      event.stopPropagation();
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("blur", stopDrag);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("blur", stopDrag);
      stopDrag();
    };
  }, []);

  const updateNode = (nodeId: string, updater: (node: LawTreeStateNode) => LawTreeStateNode) => {
    const walk = (nodes: LawTreeStateNode[]): LawTreeStateNode[] =>
      nodes.map((node) => {
        const nextNode = node.id === nodeId ? updater(node) : node;
        return {
          ...nextNode,
          children: nextNode.children ? walk(nextNode.children) : [],
        };
      });
    setTree((current) => walk(current));
  };

  const expandAncestors = (node: LawTreeStateNode) => {
    const ancestorIds = new Set<string>();
    let current: LawTreeStateNode | null = node;
    while (current) {
      ancestorIds.add(current.id);
      current = current.parentId ? nodeMap.get(current.parentId) : null;
    }
    if (ancestorIds.size === 0) return;

    const walk = (nodes: LawTreeStateNode[]): LawTreeStateNode[] =>
      nodes.map((item) => ({
        ...item,
        isOpen: ancestorIds.has(item.id) ? true : item.isOpen,
        children: item.children ? walk(item.children) : [],
      }));
    setTree((current) => walk(current));
  };

  const selectNode = (node: LawTreeStateNode, loadContent = true) => {
    setActiveNodeId(node.id);
    if (loadContent) setContentNodeId(node.id);
  };

  const toggleNode = (node: LawTreeStateNode) => {
    updateNode(node.id, (current) => ({ ...current, isOpen: !current.isOpen }));
  };

  const findMatches = (rawKeyword: string) => {
    const query = rawKeyword.trim();
    setKeyword(query);
    if (!query) {
      setMatches([]);
      matchIndexRef.current = 0;
      setMatchIndex(0);
      return;
    }

    const nextMatches: SearchMatch[] = [];
    const seenIds = new Set<string>();
    const terms = query.split(/\s+/).filter(Boolean);
    const matchedAncestorIds = new Set<string>();

    const searchNodes = (nodes: LawTreeStateNode[]) => {
      nodes.forEach((node) => {
        const compactTitle = node.title.replace(/\s*/g, "");
        if (terms.some((term) => compactTitle.includes(term)) && !seenIds.has(node.id)) {
          seenIds.add(node.id);
          nextMatches.push({ id: node.id });
          let current = node.parentId ? nodeMap.get(node.parentId) : null;
          while (current) {
            matchedAncestorIds.add(current.id);
            current = current.parentId ? nodeMap.get(current.parentId) : null;
          }
        }
        if (node.children?.length) searchNodes(node.children);
      });
    };
    searchNodes(tree);

    const walk = (nodes: LawTreeStateNode[]): LawTreeStateNode[] =>
      nodes.map((node) => ({
        ...node,
        isOpen: matchedAncestorIds.has(node.id) ? true : node.isOpen,
        children: node.children ? walk(node.children) : [],
      }));
    setTree((current) => walk(current));
    setMatches(nextMatches);
    matchIndexRef.current = 0;
    setMatchIndex(0);
    if (nextMatches[0]) {
      const first = nodeMap.get(nextMatches[0].id);
      if (first) {
        expandAncestors(first);
        setActiveNodeId(first.id);
        setContentNodeId(first.id);
        requestAnimationFrame(() => {
          treeRef.current?.querySelector(`[data-law-node-id="${CSS.escape(first.id)}"]`)?.scrollIntoView({ block: "nearest" });
        });
      }
    }
  };

  const jumpMatch = (step: number) => {
    if (matches.length === 0) return;
    const currentIndex = matchIndexRef.current;
    const nextIndex = step < 0 ? (currentIndex - 1 + matches.length) % matches.length : (currentIndex + 1) % matches.length;
    matchIndexRef.current = nextIndex;
    setMatchIndex(nextIndex);
    const match = matches[nextIndex];
    const node = nodeMap.get(match.id);
    if (!node) return;
    expandAncestors(node);
    setActiveNodeId(node.id);
    setContentNodeId(node.id);
    requestAnimationFrame(() => {
      treeRef.current?.querySelector(`[data-law-node-id="${CSS.escape(node.id)}"]`)?.scrollIntoView({ block: "nearest" });
    });
  };

  const toggleFullscreen = () => {
    if (fullscreenBridge) {
      fullscreenBridge.toggleFullscreen();
      return;
    }
    setInternalFullscreen((current) => !current);
  };

  const startDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    dragRef.current = { x: event.pageX, width: leftCollapsed ? 0 : leftWidth };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
    event.stopPropagation();
  };

  const handleExit = () => {
    if (onClose) {
      onClose();
      return;
    }
    setPage("home");
  };

  return (
    <div className="debao-law-page">
      <style>{lawStyles}</style>
      <div className={`debao-law-outer${embedded ? " embedded" : ""}`}>
        <div className={`debao-law-box${isFullscreen ? " fullscreen" : ""}`}>
          <div className="debao-law-top">
            <div className="debao-law-title" title="法律法规汇编">
              法律法规汇编
            </div>
            <div className="debao-law-top-actions">
              {canToggleFullscreen ? (
                <button type="button" className="debao-law-fullscreen" aria-label={isFullscreen ? "还原" : "放大"} onClick={toggleFullscreen}>
                  <img src={isFullscreen ? RESTORE_ICON_URL : MAX_ICON_URL} alt="" />
                </button>
              ) : null}
              {!embedded ? (
                <button type="button" className="debao-law-close" onClick={handleExit}>
                  返回主页
                </button>
              ) : null}
            </div>
          </div>
          <div className="debao-law-body">
            {!leftCollapsed ? (
              <>
                <div className="debao-law-left" style={{ width: embedded ? Math.min(leftWidth, 320) : leftWidth }}>
                  <div className="debao-law-nav">
                    <div>章节导航</div>
                    <button type="button" className="debao-law-nav-button" aria-label="收起导航" onClick={() => setLeftCollapsed(true)}>
                      <ChevronIcon direction="left" />
                    </button>
                  </div>
                  <div className="debao-law-searchbar">
                    <div className="debao-law-searchbox">
                      <input
                        type="text"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") findMatches(keyword);
                        }}
                        onPaste={(event) => event.preventDefault()}
                      />
                      <button type="button" className="debao-law-search-button" aria-label="搜索" onClick={() => findMatches(keyword)}>
                        <SearchIcon />
                      </button>
                    </div>
                    <div className="debao-law-search-right">
                      <button type="button" className="debao-law-search-nav" aria-label="上一个" onClick={() => jumpMatch(-1)}>
                        <ChevronIcon direction="left" />
                      </button>
                      <button type="button" className="debao-law-search-nav" aria-label="下一个" onClick={() => jumpMatch(1)}>
                        <ChevronIcon direction="right" />
                      </button>
                    </div>
                  </div>
                  <div className="debao-law-list-area" ref={treeRef}>
                    <div className="debao-law-tree">
                      {loadingOverview ? (
                        <div className="debao-law-row">加载中</div>
                      ) : error && tree.length === 0 ? (
                        <div className="debao-law-row">{error}</div>
                      ) : tree.length > 0 ? (
                        <LawTreeRows nodes={tree} activeNodeId={activeNodeId} onSelect={selectNode} onToggle={toggleNode} />
                      ) : (
                        <div className="debao-law-row">暂无法条目录</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="debao-law-movebar" onMouseDown={startDrag} />
              </>
            ) : (
              <div
                className="debao-law-left-collapsed"
                onMouseDown={startDrag}
                onClick={() => {
                  setLeftCollapsed(false);
                  setLeftWidth((current) => Math.max(current, LEFT_REOPEN_DEFAULT_WIDTH));
                }}
              >
                <div className="debao-law-nav" style={{ padding: 0, justifyContent: "center", height: "100%", background: "transparent", borderBottom: 0 }}>
                  <button type="button" className="debao-law-nav-button" aria-label="展开导航">
                    <ChevronIcon direction="right" />
                  </button>
                </div>
              </div>
            )}

            <div className="debao-law-right" ref={rightRef}>
              {loadingContent ? (
                <div className="debao-law-placeholder">加载中</div>
              ) : displayItems.length > 0 ? (
                displayItems.map((item) => <LawContent key={item.id} item={item} />)
              ) : (
                <div className="debao-law-placeholder">{error || overview ? "法律法规汇编" : "法律法规汇编"}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
