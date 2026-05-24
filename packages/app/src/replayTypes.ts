import type { MoodleCourse } from './moodle';

export type ReplayCourse = {
    readonly id: number;
    readonly term: string;
    readonly title: string;
    readonly subtitle: string;
    readonly imageUrl: string | null;
    readonly source: MoodleCourse;
};

export type ReplayRecording = {
    readonly recordingDate: string;
    readonly recordingName: string;
    readonly streamUrl: string | null;
    readonly sourceUrl: string | null;
    readonly recordingUuid: string;
    readonly coverUrl: string | null;
    readonly sessionTitle: string;
    readonly durationSeconds: number | null;
    readonly courseId: number;
    readonly courseName: string;
    readonly term: string;
    readonly sourceCourseId?: string;
    readonly sourceCourseName?: string;
};

export type WebexBridgeRequest = {
    readonly courseId: number;
    readonly courseTitle?: string;
    readonly courseFullName?: string;
    readonly courseShortName?: string;
    readonly url?: string;
    readonly loginUrl?: string;
    readonly html?: string;
    readonly usesMoodleAutoLogin?: boolean;
    readonly usesMoodleBrowserLogin?: boolean;
    readonly requiresMoodleReconnect?: boolean;
};

export type WebexBridgeRecording = {
    readonly recordingDate: string;
    readonly recordingName: string;
    readonly streamUrl: string;
    readonly sourceUrl: string | null;
    readonly recordingUuid: string;
    readonly coverUrl: string | null;
    readonly sessionTitle: string;
    readonly durationSeconds: number | null;
    readonly sourceCourseId?: string;
    readonly sourceCourseName?: string;
};

export type WebexBridgeResult = {
    readonly courseId: number;
    readonly recordings: WebexBridgeRecording[];
};

export class WebexBridgeRequiredError extends Error {
    readonly bridgeRequest: WebexBridgeRequest;

    constructor(bridgeRequest: WebexBridgeRequest) {
        super('Webex needs an in-app session bridge before recordings can load.');
        this.name = 'WebexBridgeRequiredError';
        this.bridgeRequest = bridgeRequest;
    }
}
