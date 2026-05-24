const FHGR_MOODLE_HOST = 'moodle.fhgr.ch';
const FHGR_IDP_ENTITY_ID = 'https://aai-login.fhgr.ch/idp/shibboleth';

export function buildFhgrDirectLoginUrl(siteRoot: string, targetUrl: string): string {
    try {
        if (new URL(siteRoot).hostname !== FHGR_MOODLE_HOST) {
            return `${siteRoot}/login/index.php?wantsurl=${encodeURIComponent(targetUrl)}`;
        }
    } catch {
        return `${siteRoot}/login/index.php?wantsurl=${encodeURIComponent(targetUrl)}`;
    }

    const loginUrl = new URL('/Shibboleth.sso/Login', siteRoot);
    const moodleCallback = new URL('/auth/shibboleth/index.php', siteRoot);
    moodleCallback.searchParams.set('wantsurl', targetUrl);
    loginUrl.searchParams.set('entityID', FHGR_IDP_ENTITY_ID);
    // FHGR/Shibboleth must land in Moodle's auth callback first; targeting an LTI page directly can leave Moodle auth.php in a not-logged-in state.
    loginUrl.searchParams.set('target', moodleCallback.toString());
    return loginUrl.toString();
}
