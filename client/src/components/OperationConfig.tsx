import { cn } from "@/lib/utils";

interface OperationConfigProps {
  operation: string;
  config: {
    angle?: number;
    width?: number;
    height?: number;
    strength?: number;
    quality?: number;
    maxDimension?: number;
    outputFormat?: string;
    page?: number;
    allPages?: boolean;
    onChange: (key: string, value: unknown) => void;
  };
}

export function OperationConfig({ operation, config }: OperationConfigProps) {
  if (!["rotate", "resize", "enhance", "reduce_size", "convert", "from_pdf", "to_pdf"].includes(operation)) {
    return null;
  }

  return (
    <div className="animate-slide-in glass-control rounded-xl p-4 space-y-4">
      {operation === "rotate" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">Rotation Angle</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="glass-control flex-1 h-9 px-3 text-sm"
              min="-360"
              max="360"
              value={config.angle ?? 90}
              onChange={(e) => config.onChange("angle", Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">degrees</span>
          </div>
          <div className="flex gap-2">
            {[90, 180, 270, -90].map((angle) => (
              <button
                key={angle}
                type="button"
                onClick={() => config.onChange("angle", angle)}
                className={cn(
                  "flex-1 glass-highlight rounded-lg py-2 text-sm font-medium transition-all",
                  config.angle === angle
                    ? "bg-primary text-white shadow"
                    : "text-foreground hover:bg-white/30",
                )}
              >
                {angle > 0 ? angle : 360 + angle}°
              </button>
            ))}
          </div>
        </div>
      )}

      {operation === "resize" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Width</label>
              <input
                type="number"
                className="glass-control h-9 px-3 text-sm"
                min="1"
                max="4000"
                value={config.width ?? 600}
                onChange={(e) => config.onChange("width", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Height</label>
              <input
                type="number"
                className="glass-control h-9 px-3 text-sm"
                min="1"
                max="4000"
                value={config.height ?? 400}
                onChange={(e) => config.onChange("height", Number(e.target.value))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={false}
              onChange={() => {}}
            />
            <span className="text-sm text-foreground">Maintain aspect ratio</span>
          </label>
        </div>
      )}

      {operation === "enhance" && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            Strength: <span className="font-mono text-primary">{(config.strength ?? 1.25).toFixed(2)}x</span>
          </label>
          <input
            type="range"
            className="w-full accent-primary"
            min="1"
            max="3"
            step="0.05"
            value={config.strength ?? 1.25}
            onChange={(e) => config.onChange("strength", Number(e.target.value))}
          />
        </div>
      )}

      {operation === "reduce_size" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              JPEG Quality: <span className="font-mono text-primary">{config.quality ?? 75}%</span>
            </label>
            <input
              type="range"
              className="w-full accent-primary"
              min="10"
              max="95"
              step="1"
              value={config.quality ?? 75}
              onChange={(e) => config.onChange("quality", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Max Dimension</label>
            <input
              type="number"
              className="glass-control h-9 px-3 text-sm"
              min="100"
              max="4000"
              step="50"
              value={config.maxDimension ?? 1600}
              onChange={(e) => config.onChange("maxDimension", Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {operation === "convert" || operation === "from_pdf" && !config.allPages ? (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">Output Format</label>
          <select
            className="glass-control h-9 px-3 text-sm w-full"
            value={config.outputFormat ?? "png"}
            onChange={(e) => config.onChange("outputFormat", e.target.value)}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </div>
      ) : null}

      {operation === "from_pdf" && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={config.allPages ?? false}
              onChange={(e) => config.onChange("allPages", e.target.checked)}
            />
            <span className="text-sm text-foreground">All pages (ZIP)</span>
          </label>
          {!config.allPages && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Page Number</label>
              <input
                type="number"
                className="glass-control h-9 px-3 text-sm"
                min="1"
                value={config.page ?? 1}
                onChange={(e) => config.onChange("page", Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
        </div>
      )}

      {operation === "to_pdf" && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="grid size-5 place-items-center rounded bg-primary/20 text-primary">
            <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </span>
          Images are combined into one PDF, one image per page.
        </p>
      )}
    </div>
  );
}