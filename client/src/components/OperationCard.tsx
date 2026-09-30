import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface Operation {
  value: string;
  label: string;
  category: "basic" | "transform" | "optimize" | "documents";
  icon?: React.ReactNode;
}

interface OperationCardProps {
  operation: Operation;
  isSelected: boolean;
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function OperationCard({ operation, isSelected, onSelect, disabled = false }: OperationCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(operation.value)}
      disabled={disabled}
      className={cn(
        "glass-highlight flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-200",
        "border",
        disabled && "opacity-50 cursor-not-allowed",
        isSelected
          ? "bg-gradient-to-r from-primary to-primary/80 text-white shadow-lg border-primary/30"
          : "text-foreground bg-white/20 border-white/30 hover:bg-white/30 hover:border-white/50 hover:shadow-md",
      )}
      aria-pressed={isSelected}
    >
      {operation.icon && (
        <span className={cn("transition-colors", isSelected ? "text-white/90" : "text-muted-foreground")}>
          {operation.icon}
        </span>
      )}
      <span className="font-medium">{operation.label}</span>
      {isSelected && (
        <span className="ml-auto flex items-center justify-center size-5 rounded-full bg-white/20">
          <IconCheck className="size-3" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

export interface OperationCategory {
  id: string;
  name: string;
  operations: Operation[];
}

export const OPERATIONS: OperationCategory[] = [
  {
    id: "basic",
    name: "Basic",
    operations: [
      { value: "grayscale", label: "Grayscale", category: "basic" },
      { value: "blur", label: "Blur", category: "basic" },
      { value: "sharpen", label: "Sharpen", category: "basic" },
      { value: "enhance", label: "Enhance", category: "basic" },
    ],
  },
  {
    id: "transform",
    name: "Transform",
    operations: [
      { value: "rotate", label: "Rotate", category: "transform" },
      { value: "resize", label: "Resize", category: "transform" },
    ],
  },
  {
    id: "optimize",
    name: "Optimize",
    operations: [
      { value: "reduce_size", label: "Reduce Size", category: "optimize" },
      { value: "convert", label: "Convert Format", category: "optimize" },
    ],
  },
  {
    id: "documents",
    name: "Documents",
    operations: [
      { value: "from_pdf", label: "PDF → Image", category: "documents" },
      { value: "to_pdf", label: "Image → PDF", category: "documents" },
    ],
  },
];