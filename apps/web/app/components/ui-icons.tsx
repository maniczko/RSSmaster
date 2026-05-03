import type { ReactNode, SVGProps } from "react";

export type AppIconProps = SVGProps<SVGSVGElement>;

type BaseIconProps = AppIconProps & {
  children: ReactNode;
  viewBox?: string;
};

function BaseIcon({
  children,
  className,
  viewBox = "0 0 20 20",
  ...props
}: BaseIconProps) {
  return (
    <svg
      aria-hidden={props["aria-label"] ? undefined : true}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox={viewBox}
      {...props}
    >
      {children}
    </svg>
  );
}

export function SearchIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="9" cy="9" r="4.75" />
      <path d="M12.8 12.8 15.8 15.8" />
    </BaseIcon>
  );
}

export function MenuIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 6.5h12" />
      <path d="M4 10h12" />
      <path d="M4 13.5h12" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m8 5.5 4.5 4.5L8 14.5" />
    </BaseIcon>
  );
}

export function DismissIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 6 14 14" />
      <path d="M14 6 6 14" />
    </BaseIcon>
  );
}

export function ReaderIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 5.25A2.25 2.25 0 0 1 6.75 3h7A1.75 1.75 0 0 1 15.5 4.75v10.5A1.75 1.75 0 0 0 13.75 13.5h-7A2.25 2.25 0 0 0 4.5 15.75V5.25Z" />
      <path d="M15.5 15.25c0 .97-.78 1.75-1.75 1.75h-7a2.25 2.25 0 0 1 0-4.5h7c.97 0 1.75.78 1.75 1.75Z" />
      <path d="M7.5 6.5h5" />
      <path d="M7.5 9h4.25" />
    </BaseIcon>
  );
}

export function DiscoverIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="6.25" />
      <path d="m12.8 7.2-1.7 4.2-4.2 1.7 1.7-4.2 4.2-1.7Z" />
    </BaseIcon>
  );
}

export function SourcesIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.75 14.75a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" fill="currentColor" stroke="none" />
      <path d="M4.5 9a6.5 6.5 0 0 1 6.5 6.5" />
      <path d="M4.5 5a10.5 10.5 0 0 1 10.5 10.5" />
    </BaseIcon>
  );
}

export function DigestIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 3.75h5.2l3.3 3.3v8.95A1.5 1.5 0 0 1 13 17.5H6A1.5 1.5 0 0 1 4.5 16V5.25A1.5 1.5 0 0 1 6 3.75Z" />
      <path d="M11 3.75v3.5h3.5" />
      <path d="m8.2 11.6 1.25-2.5 1.2 1.6 1.15-2.2" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="2.3" />
      <path d="M10 4.2v1.3M10 14.5v1.3M15.8 10h-1.3M5.5 10H4.2M14.1 5.9l-.95.95M6.85 13.15l-.95.95M14.1 14.1l-.95-.95M6.85 6.85l-.95-.95" />
    </BaseIcon>
  );
}

export function WebsiteIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="6.25" />
      <path d="M3.75 10h12.5" />
      <path d="M10 3.75c1.65 1.45 2.5 3.53 2.5 6.25 0 2.72-.85 4.8-2.5 6.25M10 3.75c-1.65 1.45-2.5 3.53-2.5 6.25 0 2.72.85 4.8 2.5 6.25" />
    </BaseIcon>
  );
}

export function FeedIcon(props: AppIconProps) {
  return <SourcesIcon {...props} />;
}

export function ImportIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 4.25v7" />
      <path d="m7.25 8.75 2.75 2.75 2.75-2.75" />
      <path d="M4.75 13.5v1.25A1.5 1.5 0 0 0 6.25 16.25h7.5a1.5 1.5 0 0 0 1.5-1.5V13.5" />
    </BaseIcon>
  );
}

export function CaptureIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m8.3 11.7-1.55 1.55a2.5 2.5 0 1 1-3.55-3.55l2.35-2.35a2.5 2.5 0 0 1 3.55 0" />
      <path d="m11.7 8.3 1.55-1.55a2.5 2.5 0 0 1 3.55 3.55l-2.35 2.35a2.5 2.5 0 0 1-3.55 0" />
      <path d="m7.8 12.2 4.4-4.4" />
    </BaseIcon>
  );
}

export function SyncIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M15.25 8.25A5.75 5.75 0 0 0 5.2 6.3" />
      <path d="M5.2 6.3V4.1M5.2 6.3h2.15" />
      <path d="M4.75 11.75a5.75 5.75 0 0 0 10.05 1.95" />
      <path d="M14.8 13.7v2.2M14.8 13.7h-2.15" />
    </BaseIcon>
  );
}

export function BackofficeIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.25 6.25h9.5" />
      <path d="M5.25 10h9.5" />
      <path d="M5.25 13.75h9.5" />
      <circle cx="7.2" cy="6.25" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9.4" cy="13.75" r="1.1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function TopicIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 3.75 4.75 6.5v7l5.25 2.75 5.25-2.75v-7L10 3.75Z" />
      <path d="M10 3.75v12.5" />
      <path d="m4.75 6.5 5.25 2.75 5.25-2.75" />
    </BaseIcon>
  );
}

export function StatusIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.75 13.5V10.5" />
      <path d="M8.25 13.5V7.25" />
      <path d="M11.75 13.5v-4" />
      <path d="M15.25 13.5V5.5" />
    </BaseIcon>
  );
}

export function BookmarkIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 4.25h8A1.25 1.25 0 0 1 15.25 5.5v10l-5.25-2.75-5.25 2.75v-10A1.25 1.25 0 0 1 6 4.25Z" />
    </BaseIcon>
  );
}

export function ArchiveIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 6.25h11" />
      <path d="M5.75 6.25v8.25A1.5 1.5 0 0 0 7.25 16h5.5a1.5 1.5 0 0 0 1.5-1.5V6.25" />
      <path d="M4.25 4.5h11.5V6.5H4.25z" />
      <path d="M8 9.25h4" />
    </BaseIcon>
  );
}

export function SparkIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m10 3.75 1.2 3.1 3.05 1.2-3.05 1.2L10 12.35l-1.2-3.1-3.05-1.2 3.05-1.2Z" />
      <path d="m14.5 11.5.7 1.75 1.8.7-1.8.7-.7 1.75-.7-1.75-1.75-.7 1.75-.7Z" />
      <path d="m5.35 11.9.55 1.3 1.35.55-1.35.5-.55 1.35-.5-1.35-1.35-.5 1.35-.55Z" />
    </BaseIcon>
  );
}

export function DeliveryIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m4.5 10 10.75-5-2.5 10-2.75-3-2.5 2.25" />
      <path d="m9.95 12.05-1.9-2.05" />
    </BaseIcon>
  );
}

export function KindleIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="4.5" y="2.75" width="8.4" height="14.5" rx="1.75" />
      <path d="M6.75 5.6h3.9" />
      <path d="M6.75 8.05h3.2" />
      <path d="M8.7 14.55h.01" />
      <path d="M12.2 6.35h3.25v3.25" />
      <path d="m9.8 11.95 5.45-5.45" />
    </BaseIcon>
  );
}

export function KeyboardIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.75" y="5.5" width="12.5" height="9" rx="1.75" />
      <path d="M6.2 8.2h.01M8.6 8.2h.01M11 8.2h.01M13.4 8.2h.01M6.2 10.6h.01M8.6 10.6h.01M11 10.6h.01M13.4 10.6h.01" />
      <path d="M6.2 13h7.6" />
    </BaseIcon>
  );
}

export function NoteIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 3.75h5.2l3.3 3.3v8.95A1.5 1.5 0 0 1 13 17.5H6A1.5 1.5 0 0 1 4.5 16V5.25A1.5 1.5 0 0 1 6 3.75Z" />
      <path d="M11 3.75v3.5h3.5" />
      <path d="M7.5 10h5" />
      <path d="M7.5 12.75h4" />
    </BaseIcon>
  );
}

export function HighlightIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6.2 13.8 4.9-4.9 2.7 2.7-4.9 4.9H6.2Z" />
      <path d="m10.2 7.8 1.35-1.35a1.9 1.9 0 1 1 2.7 2.7L12.9 10.5" />
      <path d="M5.2 15.8h9.6" />
    </BaseIcon>
  );
}

export function LibraryIcon(props: AppIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.25 4.75h3.25v10.5H5.25z" />
      <path d="M9.25 4.75h3.25v10.5H9.25z" />
      <path d="M13.25 4.75h1.5v10.5h-1.5z" />
      <path d="M4.5 15.75h11" />
    </BaseIcon>
  );
}
