import { Badge } from '@/components/ui/badge'
import { type GroupedCourseBucket } from '@/domain/group-courses'
import { CourseCard } from './course-card'

type BucketSectionProps = {
  bucket: GroupedCourseBucket
}

export function BucketSection({ bucket }: BucketSectionProps) {
  if (bucket.groups.length === 0) {
    return null
  }

  return (
    <div className="space-y-8">
      {bucket.groups.map((group) => (
        <div key={group.id} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground tracking-tight">
              {group.label}
            </h3>
            <Badge variant="secondary" className="font-medium text-xs">
              {group.courses.length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
