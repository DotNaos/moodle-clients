import { useState, useRef, useEffect } from 'react'
import { Bell, LogOut, Search, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { type NavbarData } from '@/moodle/extract-navbar'

export function CustomNavbar({ data }: { data: NavbarData }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="moodle-ui fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-border/80 bg-slate-50/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-slate-50/80 sm:px-6 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/80">
      <div className="flex items-center gap-8">
        <a href="/my/courses.php" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <img src={chrome.runtime.getURL('fhgr-logo.png')} alt="FHGR Logo" className="h-10 w-auto" />
        </a>
      </div>

      <div className="flex items-center gap-3 sm:gap-5">
        <div className="flex items-center gap-1.5 mr-1">
          <a
            href="/search/index.php"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground border-none outline-none ring-0 focus-visible:ring-2 focus-visible:ring-ring bg-transparent"
          >
             <Search className="size-5" />
          </a>
          <a
            href="/message/index.php"
            className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground border-none outline-none ring-0 focus-visible:ring-2 focus-visible:ring-ring bg-transparent"
          >
             <Bell className="size-5" />
             {data.notificationCount > 0 ? (
               <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                 {data.notificationCount > 9 ? '9+' : data.notificationCount}
               </span>
             ) : null}
          </a>
        </div>
        
        <div className="h-8 w-px bg-border hidden sm:block" />

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-3 rounded-full pl-2.5 pr-1.5 py-1.5 transition-colors hover:bg-accent focus:bg-accent border-none outline-none ring-0 focus-visible:ring-2 focus-visible:ring-ring bg-transparent"
            onClick={() => setIsOpen(!isOpen)}
          >
            <span className="text-base font-medium hidden sm:block mr-0.5 text-foreground">
              {data.userName}
            </span>
            <Avatar className="size-10 ring-1 ring-border/50">
              {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt={data.userName} /> : null}
              <AvatarFallback>
                <User className="size-5" />
              </AvatarFallback>
            </Avatar>
          </button>

          {isOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
              <div className="px-2 py-2 text-sm font-medium sm:hidden">{data.userName}</div>
              <div className="h-px bg-border my-1 sm:hidden" />
              <a
                href={data.profileUrl}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <User className="size-4" />
                Profil
              </a>
              <a
                href={data.logoutUrl}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" />
                Logout
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
