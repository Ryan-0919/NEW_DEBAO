import { useEffect, useState } from "react";
import { mockApi } from "../../lib/mockData";
import { cn } from "../ui/utils";

type AppLogoProps = {
  compact?: boolean;
  className?: string;
  logoUrlOverride?: string;
};

export function AppLogo({ compact = false, className, logoUrlOverride = "" }: AppLogoProps) {
  const [logoUrl, setLogoUrl] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await mockApi.getBrandingConfig();
        if (active) {
          setLogoUrl(data.brandLogoUrl ?? "");
          setImageFailed(false);
        }
      } catch {
        if (active) {
          setLogoUrl("");
          setImageFailed(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const resolvedLogoUrl = logoUrlOverride || logoUrl;
  const showImage = Boolean(resolvedLogoUrl) && !imageFailed;

  return (
    <div className={cn("flex items-center", showImage ? "gap-0" : "gap-2", className)}>
      {showImage ? (
        <div
          className={cn(
            "flex shrink-0 items-center justify-start overflow-hidden",
            compact ? "h-9 w-[172px]" : "h-11 w-[224px]",
          )}
        >
          <img
            src={resolvedLogoUrl}
            alt="得恩法考 logo"
            className="block max-h-full max-w-full object-contain object-left"
            onError={() => setImageFailed(true)}
          />
        </div>
      ) : (
        <>
          <div className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
            <div className="absolute inset-[5px] rounded-xl bg-blue-50" />
            <span className="relative pl-[0.18em] text-[10px] font-semibold tracking-[0.18em] text-blue-700">DEN</span>
          </div>

          {!compact && (
            <div className="min-w-0 leading-none">
              <p className="truncate text-sm font-semibold text-slate-900">得恩法考</p>
              <p className="mt-1 truncate text-[11px] text-slate-400"></p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
