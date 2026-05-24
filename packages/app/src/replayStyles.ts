import { StyleSheet } from 'react-native';

import { palette } from './styles';

export const replayStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: palette.background,
    },
    content: {
        gap: 22,
        paddingBottom: 28,
    },
    hero: {
        minHeight: 360,
        justifyContent: 'flex-end',
        overflow: 'hidden',
        paddingHorizontal: 22,
        paddingBottom: 26,
    },
    heroFallback: {
        backgroundColor: palette.surfaceRaised,
    },
    heroArtwork: {
        ...StyleSheet.absoluteFillObject,
    },
    heroImage: {
        opacity: 0.72,
    },
    heroFallbackText: {
        color: 'rgba(248,250,252,0.28)',
        fontSize: 54,
        letterSpacing: 0,
    },
    heroShade: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.38)',
    },
    heroBottomShade: {
        bottom: 0,
        height: 190,
        left: 0,
        position: 'absolute',
        right: 0,
        backgroundColor: 'rgba(11,15,20,0.68)',
    },
    brand: {
        color: '#ff5964',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 4,
        marginBottom: 44,
        textTransform: 'uppercase',
    },
    kicker: {
        color: '#ff7b83',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    heroTitle: {
        color: palette.text,
        fontSize: 42,
        fontWeight: '900',
        lineHeight: 47,
        marginTop: 10,
        maxWidth: 620,
    },
    heroMeta: {
        color: 'rgba(248,250,252,0.82)',
        fontSize: 15,
        fontWeight: '700',
        marginTop: 14,
    },
    heroActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 20,
    },
    heroButton: {
        alignItems: 'center',
        backgroundColor: palette.text,
        borderRadius: 9999,
        flexDirection: 'row',
        gap: 8,
        minHeight: 48,
        paddingHorizontal: 20,
    },
    heroButtonText: {
        color: palette.ink,
        fontSize: 15,
        fontWeight: '900',
    },
    section: {
        gap: 12,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        color: palette.text,
        fontSize: 23,
        fontWeight: '900',
    },
    stripContent: {
        gap: 14,
        paddingRight: 20,
    },
    courseTile: {
        backgroundColor: '#070a0f',
        minHeight: 214,
        overflow: 'hidden',
        width: 270,
    },
    courseBanner: {
        backgroundColor: palette.surfaceRaised,
        height: 118,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    courseBannerImage: {
        height: '100%',
        width: '100%',
    },
    courseBannerFallback: {
        color: palette.subtle,
        fontSize: 28,
        fontWeight: '900',
    },
    courseBody: {
        gap: 9,
        padding: 14,
    },
    courseTitle: {
        color: palette.text,
        fontSize: 20,
        fontWeight: '900',
        lineHeight: 24,
    },
    courseMeta: {
        color: palette.muted,
        fontSize: 13,
        fontWeight: '800',
    },
    courseError: {
        color: palette.red,
    },
    detailHeader: {
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 8,
    },
    detailTopRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
    },
    detailTitle: {
        color: palette.text,
        flex: 1,
        fontSize: 28,
        fontWeight: '900',
        lineHeight: 33,
    },
    roundButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 9999,
        height: 44,
        justifyContent: 'center',
        width: 44,
    },
    episodeList: {
        gap: 16,
        padding: 20,
        paddingBottom: 24,
    },
    episodeListFooter: {
        height: 116,
    },
    episode: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 14,
        minHeight: 96,
    },
    episodeThumb: {
        aspectRatio: 16 / 9,
        backgroundColor: palette.surfaceRaised,
        borderRadius: 12,
        overflow: 'hidden',
        width: 126,
    },
    episodeThumbMedia: {
        height: '100%',
        width: '100%',
    },
    episodeThumbFallback: {
        alignItems: 'center',
        backgroundColor: 'rgba(140,199,255,0.08)',
        flex: 1,
        justifyContent: 'center',
    },
    episodeBody: {
        flex: 1,
        gap: 8,
        justifyContent: 'center',
    },
    episodeTitle: {
        color: palette.text,
        fontSize: 17,
        fontWeight: '900',
        lineHeight: 22,
    },
    episodeMeta: {
        color: palette.muted,
        fontSize: 13,
        fontWeight: '700',
        lineHeight: 18,
    },
    playText: {
        color: palette.ink,
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    playPill: {
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: palette.text,
        borderRadius: 9999,
        flexDirection: 'row',
        gap: 5,
        minHeight: 28,
        paddingHorizontal: 10,
    },
    modal: {
        backgroundColor: '#000',
        flex: 1,
    },
    playerHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 12,
    },
    playerTitleWrap: {
        flex: 1,
    },
    playerTitle: {
        color: palette.text,
        fontSize: 18,
        fontWeight: '900',
    },
    playerSubtitle: {
        color: palette.muted,
        fontSize: 13,
        fontWeight: '700',
        marginTop: 3,
    },
    playerVideo: {
        flex: 1,
    },
    bridgeModal: {
        backgroundColor: palette.background,
        flex: 1,
    },
    bridgeHeader: {
        gap: 8,
        padding: 18,
        paddingTop: 58,
    },
    bridgeRuntime: {
        flex: 1,
    },
    bridgeAutomationPanel: {
        alignItems: 'center',
        flex: 1,
        gap: 12,
        justifyContent: 'center',
        padding: 24,
    },
    bridgeAutomationTitle: {
        color: palette.text,
        fontSize: 20,
        fontWeight: '900',
        textAlign: 'center',
    },
    bridgeLoginWrap: {
        flex: 1,
    },
    bridgeLoginContent: {
        flexGrow: 1,
        gap: 16,
        justifyContent: 'center',
        padding: 22,
    },
    bridgeLoginIcon: {
        alignItems: 'center',
        backgroundColor: 'rgba(140,199,255,0.12)',
        borderRadius: 22,
        height: 56,
        justifyContent: 'center',
        width: 56,
    },
    bridgeTitle: {
        color: palette.text,
        fontSize: 22,
        fontWeight: '900',
    },
    bridgeCopy: {
        color: palette.muted,
        fontSize: 14,
        lineHeight: 21,
    },
    bridgeForm: {
        gap: 12,
        paddingTop: 8,
    },
    bridgeActions: {
        alignItems: 'stretch',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    bridgeStatus: {
        color: palette.blue,
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 18,
    },
    bridgeError: {
        color: palette.red,
        fontSize: 13,
        fontWeight: '800',
        lineHeight: 18,
    },
    rememberRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        minHeight: 52,
    },
    checkbox: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 9,
        height: 28,
        justifyContent: 'center',
        width: 28,
    },
    checkboxChecked: {
        backgroundColor: palette.text,
    },
    rememberCopy: {
        flex: 1,
        gap: 2,
    },
    rememberTitle: {
        color: palette.text,
        fontSize: 14,
        fontWeight: '900',
    },
    rememberHint: {
        color: palette.subtle,
        fontSize: 12,
        fontWeight: '700',
    },
    webView: {
        flex: 1,
    },
    bridgeHiddenWebView: {
        height: 1,
        left: -1000,
        opacity: 0.01,
        position: 'absolute',
        top: -1000,
        width: 1,
    },
});
