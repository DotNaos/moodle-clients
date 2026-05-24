import { useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect, useRef, useState } from 'react';
import {
    Linking,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
    checkAndApplyAppUpdate,
    getAppUpdateDiagnostics,
    getCurrentAppVersion,
    openAppDownloadPage,
    type AppUpdateDiagnostics,
    type AppUpdateCheckResult,
} from './src/appUpdates';
import { createCodexAppActions } from './src/codexAppActions';
import { AppUpdateBanner } from './src/components/AppUpdateBanner';
import { BottomNav } from './src/components/BottomNav';
import { MoodleBrowserLoginModal } from './src/components/MoodleBrowserLoginModal';
import { MoodleSSOLoginModal } from './src/components/MoodleSSOLoginModal';
import { PdfViewerModal } from './src/components/PdfViewerModal';
import { ScannerModal } from './src/components/ScannerModal';
import { StatusBanner } from './src/components/StatusBanner';
import { logDevError, logDevInfo } from './src/debug';
import { getErrorDebugDetails, getSafeMessage } from './src/format';
import { RefreshCw } from './src/icons';
import {
    completeMoodleBrowserSSO,
    createMoodleBrowserSSOLaunch,
    exchangeQRToken,
    DEFAULT_MOODLE_SITE_URL,
    getCourseContents,
    getCourses,
    getSiteInfo,
    isMoodleBrowserSSOTokenUrl,
    isQRNetworkMismatchError,
    parseMobileQRLink,
    type MoodleConnection,
    type MoodleCourse,
    type MoodleCourseSection,
    type MoodleSiteInfo,
} from './src/moodle';
import {
    completeMobilePairing,
    parseMobilePairTarget,
    type MobilePairTarget,
} from './src/pairing';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { CodexScreen } from './src/screens/CodexScreen';
import { CoursesScreen } from './src/screens/CoursesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { VideosScreen } from './src/screens/VideosScreen';
import {
    clearMoodleBrowserSSOLaunch,
    importMoodleCliConnection,
    loadMoodleBrowserSSOLaunch,
    loadStoredConnection,
    storeConnection,
    storeMoodleBrowserSSOLaunch,
} from './src/storage';
import {
    setObservabilityUser,
    wrapWithObservability,
} from './src/observability';
import { palette, styles } from './src/styles';
import { registerAppThemeVariables } from './src/themeVariables';
import type { AppView, ScannerMode } from './src/types';

declare const __DEV__: boolean;

registerAppThemeVariables();

function App() {
    const [permission, requestPermission] = useCameraPermissions();
    const [activeView, setActiveView] = useState<AppView>('courses');
    const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
    const [busy, setBusy] = useState(false);
    const [loadingDashboard, setLoadingDashboard] = useState(false);
    const [loadingCourseId, setLoadingCourseId] = useState<number | null>(null);
    const [checkingForUpdate, setCheckingForUpdate] = useState(false);
    const [appUpdateNotice, setAppUpdateNotice] = useState<{
        title: string;
        message: string;
        downloadUrl: string;
    } | null>(null);
    const [appUpdateDiagnostics, setAppUpdateDiagnostics] =
        useState<AppUpdateDiagnostics>(getAppUpdateDiagnostics);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorDebugDetails, setErrorDebugDetails] = useState<string[]>([]);
    const [infoMessage, setInfoMessage] = useState(
        'Connect Moodle to load courses, or pair a browser session when needed.',
    );
    const [moodleQrInput, setMoodleQrInput] = useState('');
    const [browserLoginVisible, setBrowserLoginVisible] = useState(false);
    const [moodleSsoLaunchUrl, setMoodleSsoLaunchUrl] = useState('');
    const [pairQrInput, setPairQrInput] = useState('');
    const [pendingPairTarget, setPendingPairTarget] =
        useState<MobilePairTarget | null>(null);
    const [connection, setConnection] = useState<MoodleConnection | null>(null);
    const [siteInfo, setSiteInfo] = useState<MoodleSiteInfo | null>(null);
    const [courses, setCourses] = useState<MoodleCourse[]>([]);
    const [selectedCourseId, setSelectedCourseId] = useState<number | null>(
        null,
    );
    const [courseContentsById, setCourseContentsById] = useState<
        Record<number, MoodleCourseSection[]>
    >({});
    const [pdfPreview, setPdfPreview] = useState<{
        title: string;
        url: string;
    } | null>(null);
    const scanLockRef = useRef(false);
    const browserLoginLockRef = useRef(false);

    useEffect(() => {
        if (!__DEV__) {
            void runAppUpdateCheck(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        void loadStoredConnection()
            .then(async (storedConnection) => {
                if (!mounted) {
                    return;
                }

                if (storedConnection) {
                    setConnection(storedConnection);
                    setInfoMessage('Restored the local Moodle session.');
                    return;
                }

                const importedConnection = await importMoodleCliConnection();
                if (!mounted || !importedConnection) {
                    return;
                }

                await storeConnection(importedConnection);
                setConnection(importedConnection);
                setInfoMessage('Imported the local Moodle CLI session.');
            })
            .catch((error) => {
                logDevError('Stored Moodle session restore failed', error);
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        let mounted = true;

        void Linking.getInitialURL()
            .then((url) => {
                if (mounted) {
                    void handleIncomingLink(url, 'initial');
                }
            })
            .catch((error) => {
                logDevError('Initial deep link lookup failed', error);
            });

        const subscription = Linking.addEventListener('url', (event) => {
            void handleIncomingLink(event.url, 'event');
        });

        return () => {
            mounted = false;
            subscription.remove();
        };
    }, []);

    useEffect(() => {
        if (!connection) {
            setObservabilityUser(null);
            setSiteInfo(null);
            setCourses([]);
            setSelectedCourseId(null);
            setCourseContentsById({});
            return;
        }

        setObservabilityUser(connection.moodleUserId);
        void refreshDashboard(connection);
    }, [connection]);

    useEffect(() => {
        if (
            !connection ||
            !selectedCourseId ||
            courseContentsById[selectedCourseId]
        ) {
            return;
        }

        void loadCourseContents(connection, selectedCourseId);
    }, [connection, selectedCourseId, courseContentsById]);

    async function refreshDashboard(currentConnection: MoodleConnection) {
        setLoadingDashboard(true);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            const [nextSiteInfo, nextCourses] = await Promise.all([
                getSiteInfo(currentConnection),
                getCourses(currentConnection),
            ]);
            setSiteInfo(nextSiteInfo);
            setCourses(nextCourses);
            setSelectedCourseId((previous) => {
                if (
                    previous &&
                    nextCourses.some((course) => course.id === previous)
                ) {
                    return previous;
                }
                return null;
            });
            setInfoMessage(
                'Moodle is connected. Courses and pairing are ready.',
            );
        } catch (error) {
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setLoadingDashboard(false);
        }
    }

    async function loadCourseContents(
        currentConnection: MoodleConnection,
        courseId: number,
    ) {
        setLoadingCourseId(courseId);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            const sections = await getCourseContents(
                currentConnection,
                courseId,
            );
            setCourseContentsById((current) => ({
                ...current,
                [courseId]: sections,
            }));
        } catch (error) {
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setLoadingCourseId((current) =>
                current === courseId ? null : current,
            );
        }
    }

    async function handleBarcodeScanned(
        result: BarcodeScanningResult,
    ): Promise<void> {
        if (!scannerMode || busy || scanLockRef.current) {
            return;
        }

        const currentScannerMode = scannerMode;
        scanLockRef.current = true;
        setScannerMode(null);

        try {
            if (currentScannerMode === 'moodle') {
                await connectMoodle(result.data);
            } else {
                reviewPairing(result.data);
            }
        } finally {
            setTimeout(() => {
                scanLockRef.current = false;
            }, 900);
        }
    }

    async function openScanner(nextMode: ScannerMode): Promise<void> {
        setErrorMessage('');
        setErrorDebugDetails([]);
        if (Platform.OS === 'web') {
            setScannerMode(nextMode);
            return;
        }

        if (!permission) {
            const response = await requestPermission();
            if (!response.granted) {
                setErrorMessage(
                    'Camera permission is required to scan QR codes.',
                );
                return;
            }

            setScannerMode(nextMode);
            return;
        }

        if (!permission.granted) {
            const response = await requestPermission();
            if (!response.granted) {
                setErrorMessage(
                    'Camera permission is required to scan QR codes.',
                );
                return;
            }
        }

        setScannerMode(nextMode);
    }

    async function handleIncomingLink(
        rawUrl: string | null,
        source: 'initial' | 'event',
    ): Promise<void> {
        if (!rawUrl) {
            return;
        }

        logDevInfo('Incoming link received', { source, rawUrl });

        if (isMoodleBrowserSSOTokenUrl(rawUrl)) {
            setActiveView('connect');
            setInfoMessage(
                'Received the Moodle browser login callback.',
            );
            await finishMoodleBrowserSSO(rawUrl);
            return;
        }

        if (rawUrl.toLowerCase().startsWith('moodlemobile://')) {
            setActiveView('connect');
            setInfoMessage(
                'Received a Moodle QR login link from the operating system.',
            );
            await connectMoodle(rawUrl);
            return;
        }

        try {
            const target = parseMobilePairTarget(rawUrl);
            setActiveView('profile');
            setPendingPairTarget(target);
            setInfoMessage(
                `Review the bridge request from ${target.appName ?? target.origin}.`,
            );
        } catch {
            return;
        }
    }

    async function startMoodleBrowserSSO(): Promise<void> {
        setBusy(true);
        setErrorMessage('');
        setErrorDebugDetails([]);
        setInfoMessage('Preparing Moodle browser login.');

        try {
            const launchRequest = await createMoodleBrowserSSOLaunch(
                connection?.moodleSiteUrl ?? DEFAULT_MOODLE_SITE_URL,
            );
            await storeMoodleBrowserSSOLaunch(launchRequest.launch);
            setInfoMessage(
                'Opening Moodle login. The app will finish setup when Moodle redirects back.',
            );
            setMoodleSsoLaunchUrl(launchRequest.launchUrl);
        } catch (error) {
            logDevError('Moodle browser SSO start failed', error);
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function finishMoodleBrowserSSO(rawUrl: string): Promise<void> {
        setBusy(true);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            const launch = await loadMoodleBrowserSSOLaunch();
            if (!launch) {
                throw new Error(
                    'Moodle returned a login token, but this device has no matching login request.',
                );
            }

            const nextConnection = await completeMoodleBrowserSSO(rawUrl, launch);
            await storeConnection(nextConnection);
            await clearMoodleBrowserSSOLaunch();
            setConnection(nextConnection);
            setPendingPairTarget(null);
            setScannerMode(null);
            setBrowserLoginVisible(false);
            setMoodleSsoLaunchUrl('');
            setActiveView('courses');
            setInfoMessage(
                `Connected to Moodle as user ${nextConnection.moodleUserId}.`,
            );
        } catch (error) {
            logDevError('Moodle browser SSO finish failed', error);
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function connectMoodle(rawQrLink: string): Promise<void> {
        setBusy(true);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            logDevInfo('Moodle QR connection started', { rawQrLink });
            const nextConnection = await exchangeQRToken(
                parseMobileQRLink(rawQrLink),
            );
            await storeConnection(nextConnection);
            setConnection(nextConnection);
            setPendingPairTarget(null);
            setScannerMode(null);
            setActiveView('courses');
            setInfoMessage(
                `Connected to Moodle as user ${nextConnection.moodleUserId}.`,
            );
        } catch (error) {
            if (isQRNetworkMismatchError(error)) {
                // Moodle QR login breaks if the phone is routed through a VPN because the QR page and token exchange
                // must arrive from the same network path. Keep school VPNs off during the scan/connect step.
                setInfoMessage(
                    'Moodle requires the QR page and the app request to use the same network address. Turn off any school VPN on the phone, keep phone and laptop on the same Wi-Fi, and disable iCloud Private Relay. For laptop QR codes, use the laptop web scanner.',
                );
            }
            logDevError('Moodle QR connection failed', error);
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function connectMoodleFromBrowser(rawQrLink: string): Promise<void> {
        if (browserLoginLockRef.current) {
            return;
        }

        browserLoginLockRef.current = true;
        setInfoMessage('Moodle profile QR found. Connecting in the background.');
        try {
            await connectMoodle(rawQrLink);
            setBrowserLoginVisible(false);
        } finally {
            browserLoginLockRef.current = false;
        }
    }

    async function runAppUpdateCheck(manual: boolean): Promise<void> {
        setCheckingForUpdate(true);
        if (manual) {
            setAppUpdateNotice(null);
            setInfoMessage('Checking for app updates.');
        }

        try {
            const result = await checkAndApplyAppUpdate();
            handleAppUpdateResult(result, manual);
        } catch (error) {
            logDevError('App update check failed', error);
            if (manual) {
                setErrorDebugDetails(getErrorDebugDetails(error));
                setErrorMessage(getSafeMessage(error));
            } else {
                setAppUpdateNotice({
                    title: 'Could not check for updates',
                    message:
                        'Automatic update check failed. Open the download page if you want to install the latest app.',
                    downloadUrl: '',
                });
            }
        } finally {
            setAppUpdateDiagnostics(getAppUpdateDiagnostics());
            setCheckingForUpdate(false);
        }
    }

    function handleAppUpdateResult(
        result: AppUpdateCheckResult,
        manual: boolean,
    ) {
        if (
            result.kind === 'manual-update' ||
            result.kind === 'self-update-disabled'
        ) {
            setAppUpdateNotice({
                title: result.title,
                message: result.message,
                downloadUrl: result.downloadUrl,
            });
            setInfoMessage(result.message);
            return;
        }

        if (result.kind === 'reloading') {
            setInfoMessage('App update installed. Restarting now.');
            return;
        }

        if (manual && result.kind === 'development') {
            setInfoMessage(
                'Update checks run in installed builds. Use the download button for the latest install.',
            );
            return;
        }

        if (manual) {
            setInfoMessage('The app is already up to date.');
        }
    }

    async function openUpdateDownload(downloadUrl?: string): Promise<void> {
        try {
            if (downloadUrl) {
                await Linking.openURL(downloadUrl);
                return;
            }
            await openAppDownloadPage();
        } catch (error) {
            logDevError('App download link failed', error);
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        }
    }

    function reviewPairing(rawPairQr: string): void {
        try {
            const target = parseMobilePairTarget(rawPairQr);
            setPendingPairTarget(target);
            setScannerMode(null);
            setActiveView('profile');
            setInfoMessage(
                `Review the bridge request from ${target.appName ?? target.origin}.`,
            );
        } catch (error) {
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        }
    }

    async function sendPairing(
        target: MobilePairTarget,
        currentConnection: MoodleConnection,
    ): Promise<void> {
        setBusy(true);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            await completeMobilePairing(target, currentConnection);
            setScannerMode(null);
            setPendingPairTarget(null);
            setPairQrInput('');
            setInfoMessage(
                `Login shared with ${target.appName ?? target.origin}.`,
            );
        } catch (error) {
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setBusy(false);
        }
    }

    const codexActions = createCodexAppActions({
        connection,
        courseContentsById,
        setActiveView,
        setSelectedCourseId,
        setCourseContentsById,
        setPdfPreview,
        loadCourseContents,
    });

    const currentCourse =
        courses.find((course) => course.id === selectedCourseId) ?? null;
    const currentSections = selectedCourseId
        ? (courseContentsById[selectedCourseId] ?? [])
        : [];
    const hasCamera = Platform.OS === 'web' || (permission?.granted ?? false);
    const connected = connection !== null;
    const showBottomNav = connected;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <HeroUINativeProvider
                    config={{ devInfo: { stylingPrinciples: false } }}>
                    <SafeAreaView style={styles.safeArea}>
                        <StatusBar style="light" />
                        <View style={styles.appShell}>
                            {(connected || activeView === 'codex') && (
                                <View
                                    style={[
                                        styles.topBar,
                                        {
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        },
                                    ]}>
                                    <Text style={styles.appTitle}>
                                        {getScreenTitle(activeView)}
                                    </Text>
                                    {activeView === 'courses' ? (
                                        <Pressable
                                            onPress={() => {
                                                if (connection) {
                                                    void refreshDashboard(
                                                        connection,
                                                    );
                                                }
                                            }}
                                            style={({ pressed }) => ({
                                                padding: 8,
                                                opacity: pressed ? 0.7 : 1,
                                            })}>
                                            <RefreshCw
                                                size={24}
                                                color={palette.text}
                                            />
                                        </Pressable>
                                    ) : null}
                                </View>
                            )}

                            <View style={styles.mainScroll}>
                                {(!connected &&
                                    activeView !== 'codex' &&
                                    activeView !== 'profile') ||
                                activeView === 'connect' ? (
                                    <ScrollView
                                        contentContainerStyle={
                                            styles.scrollContent
                                        }>
                                        <ConnectScreen
                                            busy={busy}
                                            connection={connection}
                                            pendingPairTarget={
                                                pendingPairTarget
                                            }
                                            moodleQrInput={moodleQrInput}
                                            pairQrInput={pairQrInput}
                                            onChangeMoodleQr={setMoodleQrInput}
                                            onChangePairQr={setPairQrInput}
                                            onOpenBrowserLogin={() => {
                                                void startMoodleBrowserSSO();
                                            }}
                                            onScanMoodleQr={() =>
                                                void openScanner('moodle')
                                            }
                                            onUseMoodleQrValue={(value) => {
                                                setMoodleQrInput(value);
                                                void connectMoodle(value);
                                            }}
                                            onMoodleQrImportError={
                                                setErrorMessage
                                            }
                                            onScanPairQr={() => {
                                                if (!connection) {
                                                    setErrorMessage(
                                                        'Connect Moodle first.',
                                                    );
                                                    return;
                                                }
                                                void openScanner('pair');
                                            }}
                                            onUsePairQrValue={(value) => {
                                                if (!connection) {
                                                    setErrorMessage(
                                                        'Connect Moodle first.',
                                                    );
                                                    return;
                                                }
                                                setPairQrInput(value);
                                                reviewPairing(value);
                                            }}
                                            onConfirmPairing={() => {
                                                if (
                                                    !connection ||
                                                    !pendingPairTarget
                                                ) {
                                                    setErrorMessage(
                                                        'Scan a bridge QR first.',
                                                    );
                                                    return;
                                                }
                                                void sendPairing(
                                                    pendingPairTarget,
                                                    connection,
                                                );
                                            }}
                                            onCancelPairing={() => {
                                                setPendingPairTarget(null);
                                                setPairQrInput('');
                                                setInfoMessage(
                                                    'Bridge request cancelled.',
                                                );
                                            }}
                                            onPairQrImportError={
                                                setErrorMessage
                                            }
                                        />
                                    </ScrollView>
                                ) : null}

                                {connected && activeView === 'courses' ? (
                                    <CoursesScreen
                                        connection={connection}
                                        courses={courses}
                                        sections={currentSections}
                                        currentCourse={currentCourse}
                                        loadingDashboard={loadingDashboard}
                                        loadingCourseId={loadingCourseId}
                                        onOpenConnect={() =>
                                            setActiveView('profile')
                                        }
                                        onSelectCourse={(courseId) => {
                                            setSelectedCourseId(courseId);
                                            if (
                                                connection &&
                                                !courseContentsById[courseId]
                                            ) {
                                                void loadCourseContents(
                                                    connection,
                                                    courseId,
                                                );
                                            }
                                        }}
                                        onBackToCourses={() =>
                                            setSelectedCourseId(null)
                                        }
                                        onOpenFile={(file) => {
                                            if (!connection) {
                                                return;
                                            }
                                            codexActions.openMoodleFile(file);
                                        }}
                                    />
                                ) : null}

                                {connected && activeView === 'videos' ? (
                                    <VideosScreen
                                        connection={connection}
                                        courses={courses}
                                        loadingCourses={loadingDashboard}
                                        onOpenConnect={() =>
                                            setActiveView('profile')
                                        }
                                    />
                                ) : null}

                                {connected && activeView === 'calendar' ? (
                                    <CalendarScreen
                                        courses={courses}
                                        onOpenCourse={(courseId) => {
                                            setSelectedCourseId(courseId);
                                            setActiveView('courses');
                                            if (
                                                connection &&
                                                !courseContentsById[courseId]
                                            ) {
                                                void loadCourseContents(
                                                    connection,
                                                    courseId,
                                                );
                                            }
                                        }}
                                    />
                                ) : null}

                                {activeView === 'profile' ? (
                                    <ScrollView
                                        contentContainerStyle={
                                            styles.scrollContent
                                        }>
                                        <ProfileScreen
                                            connection={connection}
                                            siteInfo={siteInfo}
                                            courseCount={courses.length}
                                            onOpenConnect={() =>
                                                setActiveView('connect')
                                            }
                                            appVersion={getCurrentAppVersion()}
                                            checkingForUpdate={
                                                checkingForUpdate
                                            }
                                            updateDiagnostics={
                                                appUpdateDiagnostics
                                            }
                                            onCheckForUpdate={() => {
                                                void runAppUpdateCheck(true);
                                            }}
                                            onOpenDownload={() => {
                                                void openUpdateDownload();
                                            }}
                                        />
                                        {connection ? (
                                            <ConnectScreen
                                                busy={busy}
                                                connection={connection}
                                                pendingPairTarget={
                                                    pendingPairTarget
                                                }
                                                moodleQrInput={moodleQrInput}
                                                pairQrInput={pairQrInput}
                                                onChangeMoodleQr={
                                                    setMoodleQrInput
                                                }
                                                onChangePairQr={setPairQrInput}
                                                onOpenBrowserLogin={() => {
                                                    void startMoodleBrowserSSO();
                                                }}
                                                onScanMoodleQr={() =>
                                                    void openScanner('moodle')
                                                }
                                                onUseMoodleQrValue={(value) => {
                                                    setMoodleQrInput(value);
                                                    void connectMoodle(value);
                                                }}
                                                onMoodleQrImportError={
                                                    setErrorMessage
                                                }
                                                onScanPairQr={() => {
                                                    if (!connection) {
                                                        setErrorMessage(
                                                            'Connect Moodle first.',
                                                        );
                                                        return;
                                                    }
                                                    void openScanner('pair');
                                                }}
                                                onUsePairQrValue={(value) => {
                                                    if (!connection) {
                                                        setErrorMessage(
                                                            'Connect Moodle first.',
                                                        );
                                                        return;
                                                    }
                                                    setPairQrInput(value);
                                                    reviewPairing(value);
                                                }}
                                                onConfirmPairing={() => {
                                                    if (
                                                        !connection ||
                                                        !pendingPairTarget
                                                    ) {
                                                        setErrorMessage(
                                                            'Scan a bridge QR first.',
                                                        );
                                                        return;
                                                    }
                                                    void sendPairing(
                                                        pendingPairTarget,
                                                        connection,
                                                    );
                                                }}
                                                onCancelPairing={() => {
                                                    setPendingPairTarget(null);
                                                    setPairQrInput('');
                                                    setInfoMessage(
                                                        'Bridge request cancelled.',
                                                    );
                                                }}
                                                onPairQrImportError={
                                                    setErrorMessage
                                                }
                                            />
                                        ) : null}
                                    </ScrollView>
                                ) : null}

                                {activeView === 'codex' ? (
                                    <CodexScreen
                                        connection={connection}
                                        courses={courses}
                                        courseContentsById={courseContentsById}
                                        activeView={activeView}
                                        selectedCourseId={selectedCourseId}
                                        onNavigateTab={setActiveView}
                                        onOpenCourse={
                                            codexActions.openCourseFromCodex
                                        }
                                        onLoadCourseContents={
                                            codexActions.loadCourseContentsFromCodex
                                        }
                                        onOpenResource={
                                            codexActions.openResourceFromCodex
                                        }
                                    />
                                ) : null}
                            </View>

                            {showBottomNav ? (
                                <BottomNav
                                    activeView={activeView}
                                    onChangeView={setActiveView}
                                />
                            ) : null}

                            {activeView !== 'codex' ? (
                                <StatusBanner
                                    busy={busy || loadingDashboard}
                                    infoMessage={infoMessage}
                                    errorMessage={errorMessage}
                                    errorDetails={errorDebugDetails}
                                    withBottomNav={showBottomNav}
                                />
                            ) : null}
                            {activeView !== 'codex' &&
                            appUpdateNotice &&
                            !busy &&
                            !loadingDashboard &&
                            !errorMessage ? (
                                <AppUpdateBanner
                                    title={appUpdateNotice.title}
                                    message={appUpdateNotice.message}
                                    withBottomNav={showBottomNav}
                                    onDismiss={() => setAppUpdateNotice(null)}
                                    onDownload={() => {
                                        void openUpdateDownload(
                                            appUpdateNotice.downloadUrl,
                                        );
                                    }}
                                />
                            ) : null}
                        </View>

                        <ScannerModal
                            visible={scannerMode !== null}
                            mode={scannerMode}
                            hasCamera={hasCamera}
                            onClose={() => setScannerMode(null)}
                            onScannerError={setErrorMessage}
                            onBarcodeScanned={(result) => {
                                void handleBarcodeScanned(result);
                            }}
                        />
                        <PdfViewerModal
                            visible={pdfPreview !== null}
                            title={pdfPreview?.title ?? ''}
                            url={pdfPreview?.url ?? null}
                            onClose={() => setPdfPreview(null)}
                        />
                        <MoodleBrowserLoginModal
                            visible={browserLoginVisible}
                            busy={busy}
                            siteUrl={
                                connection?.moodleSiteUrl ??
                                DEFAULT_MOODLE_SITE_URL
                            }
                            onClose={() => setBrowserLoginVisible(false)}
                            onResolvedQr={(value) => {
                                void connectMoodleFromBrowser(value);
                            }}
                            onStatus={setInfoMessage}
                            onError={setErrorMessage}
                        />
                        <MoodleSSOLoginModal
                            visible={Boolean(moodleSsoLaunchUrl)}
                            launchUrl={moodleSsoLaunchUrl}
                            busy={busy}
                            onClose={() => setMoodleSsoLaunchUrl('')}
                            onCallback={(url) => {
                                void finishMoodleBrowserSSO(url);
                            }}
                            onStatus={setInfoMessage}
                        />
                    </SafeAreaView>
                </HeroUINativeProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

export default wrapWithObservability(App);

function getScreenTitle(view: AppView): string {
    switch (view) {
        case 'courses':
            return 'Courses';
        case 'videos':
            return 'Videos';
        case 'calendar':
            return 'Calendar';
        case 'connect':
            return 'Connect';
        case 'codex':
            return 'Codex';
        case 'profile':
            return 'Profile';
    }
}

function getScreenSubtitle(view: AppView, connected: boolean): string {
    if (!connected) {
        return view === 'connect'
            ? 'Sign in with Moodle in the browser.'
            : 'Connect once. The token stays local.';
    }

    switch (view) {
        case 'courses':
            return '';
        case 'videos':
            return 'FS26 Webex recordings.';
        case 'calendar':
            return 'Your FHGR schedule.';
        case 'connect':
            return 'Browser login and session sharing.';
        case 'codex':
            return 'Run Codex with ChatGPT sign-in.';
        case 'profile':
            return 'Local session details.';
    }
}
