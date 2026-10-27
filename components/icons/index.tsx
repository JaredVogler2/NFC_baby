import type { SVGProps } from 'react'

/**
 * Hand-drawn 24×24 line icons (no icon dependency). Decorative by default (`aria-hidden`); give
 * the surrounding control an accessible name instead.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const WetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2c2.4 3 6 7.3 6 11a6 6 0 0 1-12 0c0-3.7 3.6-8 6-11z" />
    <path d="M9.2 15.2a2.9 2.9 0 0 0 2.4 2.6" />
  </Svg>
)

export const PoopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.75" y="15" width="16.5" height="5.25" rx="2.6" />
    <rect x="6.25" y="10.25" width="11.5" height="4.75" rx="2.35" />
    <path d="M9 10.25c0-1.9 1.3-3.25 3.2-3.25 1.3 0 1.8-.9 1.6-2.6 1.6.7 2.7 2.1 2.7 3.6 0 1.2-.6 2.25-1.6 2.25" />
  </Svg>
)

export const BothIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3.5c1.4 1.8 3.6 4.3 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2.1 2.2-4.6 3.6-6.4z" />
    <rect x="10.5" y="16.25" width="11" height="4" rx="2" />
    <rect x="12.25" y="12.5" width="7.5" height="3.75" rx="1.85" />
    <path d="M14 12.5c0-1.2.8-2 2-2 .9 0 1.2-.6 1.1-1.7 1.1.5 1.8 1.4 1.8 2.4 0 .8-.4 1.3-1 1.3" />
  </Svg>
)

export const BottleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.25 2.75h3.5" />
    <path d="M9.5 5.25c0-1.1.7-2 1.6-2.5h1.8c.9.5 1.6 1.4 1.6 2.5" />
    <path d="M9 5.25h6v2.25H9z" />
    <path d="M8.5 9a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 9v10.25a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" />
    <path d="M8.5 12h3M8.5 15h3M8.5 18h3" />
  </Svg>
)

export const NursingIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20s-7.5-4.4-7.5-10A4.25 4.25 0 0 1 12 7.4 4.25 4.25 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" />
  </Svg>
)

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9v10.25c0 .4.35.75.75.75H10v-5.5h4V20h3.25c.4 0 .75-.35.75-.75V9" />
  </Svg>
)

export const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 5.5 18.5 8.5 9 18H6v-3z" />
    <path d="m13.5 7.5 3 3" />
  </Svg>
)

export const UndoIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 7.5 5 11.5l4 4" />
    <path d="M5.5 11.5H14a5 5 0 0 1 0 10h-2" />
  </Svg>
)

export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5v11M8.5 7 12 3.5 15.5 7" />
    <path d="M7.5 10.5H6.75A1.75 1.75 0 0 0 5 12.25v6.5c0 .97.78 1.75 1.75 1.75h10.5c.97 0 1.75-.78 1.75-1.75v-6.5c0-.97-.78-1.75-1.75-1.75H16.5" />
  </Svg>
)

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </Svg>
)

export const MessageIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4.5c4.7 0 8.5 3 8.5 6.75S16.7 18 12 18c-.9 0-1.8-.1-2.6-.3L5 19.75l1.2-3.4C4.5 15.1 3.5 13.3 3.5 11.25 3.5 7.5 7.3 4.5 12 4.5z" />
  </Svg>
)

export const NfcIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
    <path d="M9.5 9.5a3.5 3.5 0 0 1 0 5M12.5 8a6 6 0 0 1 0 8M15.5 6.5a8.5 8.5 0 0 1 0 11" />
  </Svg>
)

export const OfflineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 3.5l17 17" />
    <path d="M8.6 13.3a5 5 0 0 1 4.9-1.2M5.5 10.2a9.5 9.5 0 0 1 3.4-2.1M12 6.5a9.5 9.5 0 0 1 6.5 3.7" />
    <circle cx="12" cy="17.5" r="1" fill="currentColor" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 4.3 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 16.75v.01" />
  </Svg>
)

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 11v5M12 8v.01" />
  </Svg>
)

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />
  </Svg>
)

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.75" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
  </Svg>
)

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.25" />
    <path d="M3.5 19.5c.6-3 2.8-4.75 5.5-4.75s4.9 1.75 5.5 4.75" />
    <path d="M15.5 5.5a3.25 3.25 0 0 1 0 6.25M17.5 14.9c1.5.6 2.6 2.1 3 4.1" />
  </Svg>
)

export const PrinterIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9V4h10v5" />
    <rect x="4" y="9" width="16" height="7.5" rx="2" />
    <path d="M7 14h10v6H7z" />
  </Svg>
)

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Svg>
)

export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.25" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
    <path d="M5 19.5h14" />
  </Svg>
)

export const ClockIcon = HistoryIcon
