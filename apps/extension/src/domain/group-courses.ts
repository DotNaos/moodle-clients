import { type Course } from './course'
import { compareSemesters, type Semester } from './semester'

export type CourseBucketKey =
  | 'current'
  | 'previous'
  | 'future'
  | 'uncategorized'

export type CourseSemesterGroup = {
  id: string
  label: string
  semester: Semester | null
  courses: Course[]
}

export type GroupedCourseBucket = {
  key: CourseBucketKey
  label: string
  groups: CourseSemesterGroup[]
}

const BUCKET_ORDER: CourseBucketKey[] = [
  'current',
  'previous',
  'future',
  'uncategorized',
]

const BUCKET_LABELS: Record<CourseBucketKey, string> = {
  current: 'Aktuelles Semester',
  previous: 'Frühere Semester',
  future: 'Künftige Semester',
  uncategorized: 'Sonstiges',
}

function compareCourses(a: Course, b: Course): number {
  if (a.isFavorite !== b.isFavorite) {
    return a.isFavorite ? -1 : 1
  }

  return a.title.localeCompare(b.title, 'de-CH', { sensitivity: 'base' })
}

function getBucketKey(
  semester: Semester | null,
  currentSemester: Semester,
): CourseBucketKey {
  if (!semester) {
    return 'uncategorized'
  }

  if (semester.sortKey === currentSemester.sortKey) {
    return 'current'
  }

  return semester.sortKey < currentSemester.sortKey ? 'previous' : 'future'
}

function compareGroups(
  bucketKey: CourseBucketKey,
  leftGroup: CourseSemesterGroup,
  rightGroup: CourseSemesterGroup,
): number {
  if (!leftGroup.semester || !rightGroup.semester) {
    return leftGroup.label.localeCompare(rightGroup.label, 'de-CH', {
      sensitivity: 'base',
    })
  }

  if (bucketKey === 'previous') {
    return compareSemesters(rightGroup.semester, leftGroup.semester)
  }

  return compareSemesters(leftGroup.semester, rightGroup.semester)
}

export function groupCourses(
  courses: Course[],
  currentSemester: Semester,
): GroupedCourseBucket[] {
  const groupsByBucket = new Map<CourseBucketKey, Map<string, CourseSemesterGroup>>(
    BUCKET_ORDER.map((bucketKey) => [bucketKey, new Map()]),
  )

  for (const course of courses) {
    const bucketKey = getBucketKey(course.semester, currentSemester)
    const groupKey = course.semester?.label ?? 'Sonstiges'
    const bucketGroups = groupsByBucket.get(bucketKey)

    if (!bucketGroups) {
      continue
    }

    const existingGroup = bucketGroups.get(groupKey)

    if (existingGroup) {
      existingGroup.courses.push(course)
      continue
    }

    bucketGroups.set(groupKey, {
      id: `${bucketKey}-${groupKey.toLowerCase()}`,
      label: course.semester?.label ?? 'Sonstiges',
      semester: course.semester,
      courses: [course],
    })
  }

  return BUCKET_ORDER.map((bucketKey) => {
    const groups = Array.from(groupsByBucket.get(bucketKey)?.values() ?? [])
      .map((group) => ({
        ...group,
        courses: [...group.courses].sort(compareCourses),
      }))
      .sort((leftGroup, rightGroup) =>
        compareGroups(bucketKey, leftGroup, rightGroup),
      )

    return {
      key: bucketKey,
      label: BUCKET_LABELS[bucketKey],
      groups,
    }
  })
}
