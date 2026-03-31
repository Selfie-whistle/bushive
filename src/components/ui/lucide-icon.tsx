
'use client';

import { icons } from 'lucide-react';
import type { SVGProps } from 'react';

// This is a workaround for the fact that lucide-react doesn't export the Icon type
type IconName = keyof typeof icons;

interface LucideIconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function LucideIcon({ name, ...props }: LucideIconProps) {
  const IconComponent = icons[name];

  if (!IconComponent) {
    // You can return a default icon or null
    return null;
  }

  return <IconComponent {...props} />;
}
