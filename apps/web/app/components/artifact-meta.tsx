import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/lib/utils";

type ArtifactMetaProps = {
  className?: string;
  emptyLabel?: string;
  label?: string;
  path: string | null | undefined;
  sizeLabel?: string | null;
};

function getArtifactFileName(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").filter(Boolean).pop();
  return fileName?.trim() || path;
}

export function ArtifactMeta({
  className,
  emptyLabel = "Artefakt oczekuje",
  label = "EPUB",
  path,
  sizeLabel,
}: ArtifactMetaProps) {
  const classNames = cn("artifact-meta", !path && "artifact-meta-empty", className);

  if (!path) {
    return (
      <Badge className={classNames} variant="secondary">
        {emptyLabel}
      </Badge>
    );
  }

  return (
    <Badge className={classNames} title={path} variant="outline">
      <span className="artifact-meta-label">{label}</span>
      <span className="artifact-meta-name">{getArtifactFileName(path)}</span>
      {sizeLabel ? <span className="artifact-meta-size">{sizeLabel}</span> : null}
    </Badge>
  );
}
