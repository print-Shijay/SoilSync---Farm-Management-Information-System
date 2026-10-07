import React from 'react';
import { View, Text } from 'react-native';
import { Check, ChevronDown, AlertTriangle, ShieldAlert, Info } from 'lucide-react-native';
import { useAccessibility } from '../../../lib/accessibility';

const ChevronUpIcon = (props: any) => (
  <View style={{ transform: [{ rotate: '180deg' }] }}>
    <ChevronDown {...props} />
  </View>
);

export type MetricStatusType = 'optimal' | 'low' | 'high' | 'warning' | 'critical' | 'info';

export interface StatusIndicatorProps {
  status: MetricStatusType;
  label: string;
  sublabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  label,
  sublabel,
  size = 'md',
  className = '',
}) => {
  const { isColorblindSafe, isHighContrast, fontScale } = useAccessibility();

  // Status mapping for standard mode vs colorblind-safe mode
  const getStatusConfig = () => {
    switch (status) {
      case 'optimal':
        return {
          icon: Check,
          iconColor: isColorblindSafe ? '#0D5F52' : '#047857',
          bgClass: isColorblindSafe
            ? 'bg-teal-50 border-teal-500'
            : isHighContrast
            ? 'bg-emerald-50 border-emerald-600'
            : 'bg-emerald-100 border-emerald-300',
          textClass: isColorblindSafe
            ? 'text-teal-950 font-black'
            : isHighContrast
            ? 'text-emerald-950 font-black'
            : 'text-emerald-800 font-bold',
          symbol: '✓',
        };

      case 'low':
        return {
          icon: ChevronDown,
          iconColor: isColorblindSafe ? '#7C2D12' : '#B45309',
          bgClass: isColorblindSafe
            ? 'bg-amber-50 border-amber-600'
            : isHighContrast
            ? 'bg-amber-50 border-amber-600'
            : 'bg-amber-100 border-amber-300',
          textClass: isColorblindSafe
            ? 'text-amber-950 font-black'
            : isHighContrast
            ? 'text-amber-950 font-black'
            : 'text-amber-800 font-bold',
          symbol: '▼',
        };

      case 'high':
        return {
          icon: ChevronUpIcon,
          iconColor: isColorblindSafe ? '#6B21A8' : '#BE123C',
          bgClass: isColorblindSafe
            ? 'bg-purple-50 border-purple-500'
            : isHighContrast
            ? 'bg-rose-50 border-rose-600'
            : 'bg-rose-100 border-rose-300',
          textClass: isColorblindSafe
            ? 'text-purple-950 font-black'
            : isHighContrast
            ? 'text-rose-950 font-black'
            : 'text-rose-800 font-bold',
          symbol: '▲',
        };

      case 'warning':
        return {
          icon: AlertTriangle,
          iconColor: isColorblindSafe ? '#9A3412' : '#D97706',
          bgClass: isColorblindSafe
            ? 'bg-orange-50 border-orange-500'
            : isHighContrast
            ? 'bg-amber-50 border-amber-600'
            : 'bg-amber-100 border-amber-300',
          textClass: isColorblindSafe
            ? 'text-orange-950 font-black'
            : isHighContrast
            ? 'text-amber-950 font-black'
            : 'text-amber-800 font-bold',
          symbol: '⚠',
        };

      case 'critical':
        return {
          icon: ShieldAlert,
          iconColor: isColorblindSafe ? '#881337' : '#BE123C',
          bgClass: isColorblindSafe
            ? 'bg-rose-100 border-rose-600'
            : isHighContrast
            ? 'bg-rose-100 border-rose-700'
            : 'bg-rose-100 border-rose-300',
          textClass: isColorblindSafe
            ? 'text-rose-950 font-black'
            : isHighContrast
            ? 'text-rose-950 font-black'
            : 'text-rose-800 font-bold',
          symbol: '✖',
        };

      case 'info':
      default:
        return {
          icon: Info,
          iconColor: '#3B82F6',
          bgClass: 'bg-sky-100 border-sky-300',
          textClass: 'text-sky-800 font-bold',
          symbol: 'ℹ',
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  const iconSizes = {
    sm: 11,
    md: 13,
    lg: 15,
  };

  const borderThickness = isHighContrast || isColorblindSafe ? 'border-[1.5px]' : 'border';

  return (
    <View
      className={`flex-row items-center rounded-full ${borderThickness} ${config.bgClass} ${sizeClasses[size]} ${className}`}>
      {/* If Colorblind-Safe mode is active, display the geometric icon symbol */}
      {isColorblindSafe && (
        <View className="mr-1.5">
          <IconComponent size={iconSizes[size]} color={config.iconColor} strokeWidth={2.8} />
        </View>
      )}

      <Text
        style={{ fontSize: (size === 'sm' ? 11 : size === 'lg' ? 14 : 12) * fontScale }}
        className={`${config.textClass}`}>
        {label}
      </Text>

      {sublabel && (
        <Text
          style={{ fontSize: 10 * fontScale }}
          className="ml-1 text-taupe font-medium">
          {sublabel}
        </Text>
      )}
    </View>
  );
};
