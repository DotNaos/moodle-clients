import { ArrowUpRight, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { type Course } from '@/domain/course'
import { cn } from '@/lib/utils'

type CourseCardProps = {
  course: Course
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <a
      href={course.url}
      className="group block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col overflow-hidden border-border/80 bg-card/90 shadow-none transition-colors hover:border-border hover:bg-accent/30">
        <div className="relative aspect-[21/9] w-full bg-muted overflow-hidden">
          {course.imageUrl ? (
            <img 
              src={course.imageUrl} 
              alt="" 
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" 
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-primary/5 text-muted-foreground">
              <span className="text-xs uppercase tracking-widest opacity-50">Kein Bild</span>
            </div>
          )}
          {course.isFavorite ? (
            <div className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 backdrop-blur-md">
              <Star className="size-4 fill-amber-400 text-amber-400" />
            </div>
          ) : null}
        </div>
        
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2 line-clamp-2 text-sm font-semibold text-foreground">
            {course.title}
          </div>
          
          <div className="mt-auto flex flex-col gap-3 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {course.area ? (
                <span className="line-clamp-1 flex-1">{course.area}</span>
              ) : null}
            </div>

            <div className="flex items-center justify-between">
              {course.progressText ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    'rounded-md px-2 py-1 text-[10px] font-medium',
                    'bg-secondary text-secondary-foreground',
                  )}
                >
                  {course.progressText}
                </Badge>
              ) : (
                <div /> // Spacer
              )}
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          </div>
        </div>
      </Card>
    </a>
  )
}
