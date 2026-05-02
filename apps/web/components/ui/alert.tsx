import * as React from "react";

import { cn } from "@/lib/utils";

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn("rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive", className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

export { Alert };
