import { ReactNode } from 'react';
import { View, Text } from 'react-native';

type DashboardSectionCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function DashboardSectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
}: DashboardSectionCardProps) {
  return (
    <View className="mt-5 rounded-[28px] border border-white/90 bg-white/85 p-5 shadow-sm shadow-espresso/5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          {eyebrow ? (
            <Text className="text-[11px] font-bold uppercase tracking-[0.25em] text-cognac">
              {eyebrow}
            </Text>
          ) : null}
          <Text className={`${eyebrow ? 'mt-1' : ''} text-2xl font-black tracking-tight text-espresso`}>
            {title}
          </Text>
          {description ? (
            <Text className="mt-1.5 text-sm leading-5 text-taupe">{description}</Text>
          ) : null}
        </View>

        {action ? <View>{action}</View> : null}
      </View>

      {children ? (
        <View className={eyebrow || description || action ? 'mt-4' : ''}>{children}</View>
      ) : null}
    </View>
  );
}
