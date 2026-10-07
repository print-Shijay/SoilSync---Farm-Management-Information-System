// components/Icons.tsx
import { cssInterop } from 'nativewind';
import {
  CalendarDays,
  Leaf,
  Plus,
  Settings,
  Home,
  Box,
  ArrowLeft,
  Pencil,
  Trash2,
  Check,
  Save,
  Copy,
  FlaskConical,
  Cpu,
  Radio,
  Wifi,
  RefreshCw,
  Bluetooth,
  Zap,
  Activity,
  Users,
  History,
  Sparkles,
  Calendar,
  Layers,
  FileText,
  ChevronDown,
  Building2,
  Sprout,
  ShieldAlert,
  Stethoscope,
  ChevronRight,
  AlertTriangle,
  Info,
  X,
  Droplets,
  Send,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

// Create a reusable helper function to apply the interop
function interopIcon(IconComponent: any) {
  cssInterop(IconComponent, {
    className: {
      target: 'style',
      nativeStyleToProp: {
        color: true,
        opacity: true,
      },
    },
  });
}

// Apply it to the icons you plan to use
interopIcon(Leaf);
interopIcon(CalendarDays);
interopIcon(Plus);
interopIcon(Settings);
interopIcon(Home);
interopIcon(Box);
interopIcon(ArrowLeft);
interopIcon(Pencil);
interopIcon(Trash2);
interopIcon(Check);
interopIcon(Save);
interopIcon(Copy);
interopIcon(FlaskConical);
interopIcon(Cpu);
interopIcon(Radio);
interopIcon(Wifi);
interopIcon(RefreshCw);
interopIcon(Bluetooth);
interopIcon(Zap);
interopIcon(Activity);
interopIcon(Users);
interopIcon(History);
interopIcon(Sparkles);
interopIcon(Calendar);
interopIcon(Layers);
interopIcon(FileText);
interopIcon(ChevronDown);
interopIcon(Building2);
interopIcon(Sprout);
interopIcon(ShieldAlert);
interopIcon(Stethoscope);
interopIcon(ChevronRight);
interopIcon(AlertTriangle);
interopIcon(Info);
interopIcon(X);
interopIcon(Droplets);
interopIcon(Send);

export function MessageSquare({
  size = 20,
  color = '#8C4522',
  strokeWidth = 2,
  style,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: any;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}>
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

export function SlidersHorizontal({
  size = 20,
  color = '#8C4522',
  strokeWidth = 2,
  style,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: any;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}>
      <Path d="M21 4h-7" />
      <Path d="M10 4H3" />
      <Path d="M21 12h-9" />
      <Path d="M8 12H3" />
      <Path d="M21 20h-5" />
      <Path d="M12 20H3" />
      <Path d="M14 2v4" />
      <Path d="M8 10v4" />
      <Path d="M16 18v4" />
    </Svg>
  );
}

export function ExternalLink({
  size = 16,
  color = '#8C4522',
  style,
}: {
  size?: number;
  color?: string;
  style?: any;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}>
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <Path d="M15 3h6v6" />
      <Path d="M10 14 21 3" />
    </Svg>
  );
}

// Export the newly configured icons
export {
  Leaf,
  CalendarDays,
  Plus,
  Settings,
  Home,
  Box,
  ArrowLeft,
  Pencil,
  Trash2,
  Check,
  Save,
  Copy,
  FlaskConical,
  Cpu,
  Radio,
  Wifi,
  RefreshCw,
  Bluetooth,
  Zap,
  Activity,
  Users,
  History,
  Sparkles,
  Calendar,
  Layers,
  FileText,
  ChevronDown,
  Building2,
  Sprout,
  ShieldAlert,
  Stethoscope,
  ChevronRight,
  AlertTriangle,
  Info,
  X,
  Droplets,
  Send,
};


