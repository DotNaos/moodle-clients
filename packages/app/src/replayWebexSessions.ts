import {
    deriveRecordingDate,
    firstNonEmpty,
    stringFromAny,
} from './replayHelpers';
import type { ReplayCourse, ReplayRecording } from './replayTypes';

export function describeWebexSession(session: Record<string, unknown>): Record<string, unknown> {
    return {
        id: stringFromAny(session.id, session.meetingSessionId) ? '[present]' : '',
        title: stringFromAny(session.title, session.name).slice(0, 120),
        courseId: stringFromAny(session.courseId, session.contextId, session.context_id),
        courseName: stringFromAny(session.courseName, session.contextTitle, session.context_title).slice(0, 120),
        startsAt: stringFromAny(
            session.start_date,
            session.startDate,
            session.startTime,
            session.start_time,
            session.startedAt,
            session.started_at,
            session.scheduledStartTime,
            session.scheduled_start_time,
        ),
        endsAt: stringFromAny(session.end_date, session.endDate),
        createdAt: stringFromAny(session.created_at, session.createTime, session.gmtCreateTime),
        keys: Object.keys(session).sort().slice(0, 40).join(','),
    };
}

export function recordingProbeFromWebexSession(
    course: ReplayCourse,
    session: Record<string, unknown>,
    fallbackTitle: string,
): ReplayRecording {
    const sessionTitle = firstNonEmpty(stringFromAny(session.title, session.name), fallbackTitle, 'Webex');
    const startsAt = firstNonEmpty(
        stringFromAny(session.start_date, session.startDate),
        stringFromAny(
            session.startTime,
            session.start_time,
            session.startedAt,
            session.started_at,
            session.scheduledStartTime,
            session.scheduled_start_time,
        ),
    );
    const dateHint = dateTimeHintForCourseFilter(startsAt);
    const sourceCourseId = stringFromAny(
        session.courseId,
        session.course_id,
        session.contextId,
        session.context_id,
        session.lmsCourseId,
        session.lms_course_id,
    );
    const sourceCourseName = stringFromAny(
        session.courseName,
        session.course_name,
        session.contextTitle,
        session.context_title,
        session.contextName,
        session.context_name,
    );

    return {
        recordingDate: dateHint.date,
        recordingName: firstNonEmpty(`${sessionTitle} ${dateHint.compact}`.trim(), sessionTitle),
        streamUrl: 'webex-session-probe',
        sourceUrl: null,
        recordingUuid: firstNonEmpty(
            stringFromAny(session.id, session.meetingSessionId),
            `${sessionTitle}-${dateHint.compact || dateHint.date}`,
        ),
        coverUrl: null,
        sessionTitle,
        durationSeconds: null,
        courseId: course.id,
        courseName: course.title,
        term: course.term,
        sourceCourseId: sourceCourseId || undefined,
        sourceCourseName: sourceCourseName || undefined,
    };
}

function dateTimeHintForCourseFilter(value: string): { readonly date: string; readonly compact: string } {
    const parsed = new Date(value);
    if (!value || Number.isNaN(parsed.getTime())) {
        return {
            date: deriveRecordingDate(value),
            compact: '',
        };
    }

    const year = parsed.getFullYear().toString().padStart(4, '0');
    const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const day = parsed.getDate().toString().padStart(2, '0');
    const hour = parsed.getHours().toString().padStart(2, '0');
    const minute = parsed.getMinutes().toString().padStart(2, '0');
    return {
        date: `${year}-${month}-${day}`,
        compact: `${year}${month}${day} ${hour}${minute}`,
    };
}
