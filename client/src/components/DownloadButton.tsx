import { IconDownload, IconCheck } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DownloadButtonProps {
  url: string | null;
  filename?: string;
  type?: string;
  onDownload?: () => void;
  className?: string;
}

export function DownloadButton({ url, filename, type, onDownload, className }: DownloadButtonProps) {
  const [justDownloaded, setJustDownloaded] = useState(false);

  const handleDownload = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `processed.${type?.split("/")[1] || "bin"}`;
    a.click();
    setJustDownloaded(true);
    setTimeout(() => setJustDownloaded(false), 2000);
    onDownload?.();
  };

  if (!url) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      className={cn("gap-2 transition-all", className)}
      aria-label={`Download ${filename || "processed file"}`}
    >
      {justDownloaded ? (
        <>
          <IconCheck className="size-4 text-green-500" aria-hidden="true" />
          <span>Downloaded</span>
        </>
      ) : (
        <>
          <IconDownload className="size-4" aria-hidden="true" />
          <span>Download</span>
        </>
      )}
    </Button>
  );
}