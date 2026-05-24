import { buildFhgrDirectLoginUrl } from './fhgrLogin';

export function buildMoodleBrowserSSOLaunchUrl(input: {
    readonly siteUrl: string;
    readonly launchUrl: string;
    readonly service: string;
    readonly passport: string;
    readonly urlScheme: string;
}): string {
    const launchUrl = new URL(input.launchUrl);
    launchUrl.searchParams.set('service', input.service);
    launchUrl.searchParams.set('passport', input.passport);
    launchUrl.searchParams.set('urlscheme', input.urlScheme);

    return buildFhgrDirectLoginUrl(input.siteUrl, launchUrl.toString());
}
