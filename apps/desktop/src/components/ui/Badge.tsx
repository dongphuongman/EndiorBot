/**
 * Badge Component - Small status indicator or label
 */

import { HTMLAttributes, ReactNode } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}

export function Badge({
  variant = "default",
  className = "",
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-gray-700 text-gray-300",
    success: "bg-green-900/30 text-green-400 border border-green-700",
    warning: "bg-yellow-900/30 text-yellow-400 border border-yellow-700",
    danger: "bg-red-900/30 text-red-400 border border-red-700",
    info: "bg-blue-900/30 text-blue-400 border border-blue-700",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
