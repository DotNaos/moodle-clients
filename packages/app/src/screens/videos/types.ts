import type { MoodleConnection, MoodleCourse } from '../../moodle';
import type {
    ReplayRecording,
    WebexBridgeRequest,
    WebexBridgeResult,
} from '../../replay';

export type VideosScreenProps = {
    readonly connection: MoodleConnection | null;
    readonly courses: MoodleCourse[];
    readonly loadingCourses: boolean;
    readonly onOpenConnect: () => void;
};

export type CourseRecordingState = {
    readonly loading: boolean;
    readonly recordings: ReplayRecording[];
    readonly error: string;
};

export type ActiveWebexBridgeRequest = WebexBridgeRequest & {
    readonly loadId: number;
};

export type ActiveWebexBridgeResult = WebexBridgeResult & {
    readonly loadId?: number;
};
