// @ts-ignore
/// <reference types="nativewind/types" />

declare module '*.css';
declare module '*.glb';
declare module '*.gltf';

declare module 'lucide-react-native' {
  import * as React from 'react';
  import { SvgProps } from 'react-native-svg';

  export interface LucideProps extends SvgProps {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    absoluteStrokeWidth?: boolean;
    className?: string;
  }

  export type LucideIcon = React.FC<LucideProps>;

  export const icons: Record<string, LucideIcon>;

  // Icon exports
  export const Activity: LucideIcon;
  export const AlertCircle: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const Bell: LucideIcon;
  export const Bluetooth: LucideIcon;
  export const BookOpen: LucideIcon;
  export const Box: LucideIcon;
  export const Building2: LucideIcon;
  export const Calendar: LucideIcon;
  export const CalendarDays: LucideIcon;
  export const Camera: LucideIcon;
  export const Check: LucideIcon;
  export const CheckCircle: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const ChevronDown: LucideIcon;
  export const ChevronLeft: LucideIcon;
  export const ChevronRight: LucideIcon;
  export const CircleAlert: LucideIcon;
  export const Clock: LucideIcon;
  export const CloudRain: LucideIcon;
  export const CloudSun: LucideIcon;
  export const CloudUpload: LucideIcon;
  export const Compass: LucideIcon;
  export const Copy: LucideIcon;
  export const Cpu: LucideIcon;
  export const Crown: LucideIcon;
  export const Database: LucideIcon;
  export const Delete: LucideIcon;
  export const Download: LucideIcon;
  export const Droplets: LucideIcon;
  export const Egg: LucideIcon;
  export const Eye: LucideIcon;
  export const EyeOff: LucideIcon;
  export const FileEdit: LucideIcon;
  export const FileText: LucideIcon;
  export const Fingerprint: LucideIcon;
  export const FlaskConical: LucideIcon;
  export const Flower: LucideIcon;
  export const Hand: LucideIcon;
  export const HardDrive: LucideIcon;
  export const HelpCircle: LucideIcon;
  export const History: LucideIcon;
  export const Home: LucideIcon;
  export const Inbox: LucideIcon;
  export const Info: LucideIcon;
  export const KeyRound: LucideIcon;
  export const Layers: LucideIcon;
  export const LayoutGrid: LucideIcon;
  export const Leaf: LucideIcon;
  export const List: LucideIcon;
  export const Lock: LucideIcon;
  export const LockOpen: LucideIcon;
  export const LogOut: LucideIcon;
  export const Mail: LucideIcon;
  export const MapPin: LucideIcon;
  export const Maximize2: LucideIcon;
  export const MessageSquareWarning: LucideIcon;
  export const Minus: LucideIcon;
  export const Moon: LucideIcon;
  export const MousePointer2: LucideIcon;
  export const Navigation: LucideIcon;
  export const Package: LucideIcon;
  export const Palette: LucideIcon;
  export const Pencil: LucideIcon;
  export const Phone: LucideIcon;
  export const Plus: LucideIcon;
  export const QrCode: LucideIcon;
  export const Radio: LucideIcon;
  export const Recycle: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCcw: LucideIcon;
  export const Save: LucideIcon;
  export const Search: LucideIcon;
  export const Send: LucideIcon;
  export const Settings: LucideIcon;
  export const Shield: LucideIcon;
  export const ShieldAlert: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const Smartphone: LucideIcon;
  export const Sparkles: LucideIcon;
  export const Sprout: LucideIcon;
  export const Stethoscope: LucideIcon;
  export const Sun: LucideIcon;
  export const Tag: LucideIcon;
  export const Trash2: LucideIcon;
  export const Trees: LucideIcon;
  export const Type: LucideIcon;
  export const User: LucideIcon;
  export const UserCheck: LucideIcon;
  export const UserMinus: LucideIcon;
  export const UserPlus: LucideIcon;
  export const Users: LucideIcon;
  export const UserX: LucideIcon;
  export const Wifi: LucideIcon;
  export const WifiOff: LucideIcon;
  export const Wind: LucideIcon;
  export const Wrench: LucideIcon;
  export const X: LucideIcon;
  export const XCircle: LucideIcon;
  export const Zap: LucideIcon;
  export const ZoomIn: LucideIcon;
  export const ZoomOut: LucideIcon;

  const defaultIcon: LucideIcon;
  export default defaultIcon;
}

