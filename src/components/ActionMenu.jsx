import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/** A small action menu rendered at the document layer so table/card overflow cannot clip it. */
export default function ActionMenu({ label = 'More actions', items = [] }) {
  const buttonRef = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!position) return undefined;
    const close = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setPosition(null);
      if (event.type === 'resize' || event.type === 'scroll') setPosition(null);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [position]);

  const openMenu = () => {
    if (position) { setPosition(null); return; }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 208;
    const height = Math.min(items.length * 38 + 8, window.innerHeight - 24);
    const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
    const top = rect.bottom + height + 8 <= window.innerHeight
      ? rect.bottom + 6
      : Math.max(12, rect.top - height - 6);
    setPosition({ left, top });
  };

  return <>
    <button ref={buttonRef} type="button" onClick={openMenu} aria-label={label} aria-haspopup="menu" aria-expanded={Boolean(position)} className="inline-flex rounded-lg p-2 hover:text-[var(--eval-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--eval-accent)]"><MoreHorizontal className="h-4 w-4"/></button>
    {position && createPortal(<>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-[99] cursor-default" onClick={()=>setPosition(null)}/>
      <div role="menu" className="eval-action-menu fixed z-[100] py-1" style={position}>
        {items.map((item) => {
          const Icon = item.icon;
          return <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={()=>{setPosition(null);item.onSelect?.()}} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-[var(--eval-surface-muted)] disabled:cursor-wait disabled:opacity-60 ${item.danger?'text-red-700':''}`}>
            {Icon && <Icon className={`h-3.5 w-3.5 shrink-0 ${item.loading?'animate-spin':''}`}/>}<span>{item.label}</span>
          </button>;
        })}
      </div>
    </>, document.body)}
  </>;
}
