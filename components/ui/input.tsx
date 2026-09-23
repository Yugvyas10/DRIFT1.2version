import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, icon, ...props }, ref) => {
    if (icon || error) {
      return (
        <div className="relative w-full">
          {icon && (
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
              icon && 'pl-10',
              error && 'border-destructive focus:ring-destructive/20',
              className
            )}
            ref={ref}
            {...props}
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 transition-colors',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
