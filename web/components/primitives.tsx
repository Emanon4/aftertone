import type { ReactNode } from "react";
import { Dialog as D, Slider as S, Popover as P } from "radix-ui";
import { X } from "lucide-react";

/** Accessible modal built on Radix; styled by .sheet* classes in styles.css. */
export function Sheet({ trigger, title, description, children, open, onOpenChange, className = "", closeLabel }: {
 trigger?: ReactNode; title: ReactNode; description?: ReactNode; children: ReactNode; open?: boolean;
 onOpenChange?: (open: boolean) => void; className?: string; closeLabel: string;
}) {
 return <D.Root open={open} onOpenChange={onOpenChange}>
  {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
  <D.Portal>
   <D.Overlay className="sheet-overlay" />
   <D.Content className={`sheet ${className}`}>
    <div className="sheet-head">
     <div><D.Title className="sheet-title">{title}</D.Title>{description && <D.Description className="sheet-desc">{description}</D.Description>}</div>
     <D.Close className="icon-btn" aria-label={closeLabel}><X size={18} /></D.Close>
    </div>
    {children}
   </D.Content>
  </D.Portal>
 </D.Root>;
}
export const SheetClose = D.Close;

export function Range({ value, max, min = 0, step, onChange, label, className = "" }: {
 value: number; max: number; min?: number; step: number; onChange: (value: number) => void; label: string; className?: string;
}) {
 return <S.Root className={`range ${className}`} value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} aria-label={label}>
  <S.Track className="range-track"><S.Range className="range-fill" /></S.Track>
  <S.Thumb className="range-thumb" aria-label={label} />
 </S.Root>;
}

export function Pop({ trigger, children, label, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; label: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
 return <P.Root open={open} onOpenChange={onOpenChange}>
  <P.Trigger asChild>{trigger}</P.Trigger>
  <P.Portal><P.Content className="pop" sideOffset={10} align="start" collisionPadding={16} aria-label={label}>{children}</P.Content></P.Portal>
 </P.Root>;
}
