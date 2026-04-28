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

import { BottomNav } from './src/components/BottomNav';
import { PdfViewerModal } from './src/components/PdfViewerModal';
import { ScannerModal } from './src/components/ScannerModal';
import { StatusBanner } from './src/components/StatusBanner';
import { logDevError, logDevInfo } from './src/debug';
import { getErrorDebugDetails, getSafeMessage } from './src/format';
import {
    exchangeQRToken,
    getAuthenticatedFileUrl,
    getCourseContents,
    getCourses,
    getSiteInfo,
    isQRNetworkMismatchError,
    parseMobileQRLink,
    type MoodleConnection,
    type MoodleCourse,
    type MoodleCourseSection,
    type MoodleSiteInfo,
} from './src/moodle';
import { completeMobilePairing, parseMobilePairTarget } from './src/pairing';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { CoursesScreen } from './src/screens/CoursesScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { loadStoredConnection, storeConnection } from './src/storage';
import { palette, styles } from './src/styles';
import { RefreshCw } from './src/icons';
import type { AppView, ScannerMode } from './src/types';

export default function App() {
    const [permission, requestPermission] = useCameraPermissions();
    const [activeView, setActiveView] = useState<AppView>('courses');
    const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
    const [busy, setBusy] = useState(false);
    const [loadingDashboard, setLoadingDashboard] = useState(false);
    const [loadingCourseId, setLoadingCourseId] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState('');
    const [errorDebugDetails, setErrorDebugDetails] = useState<string[]>([]);
    const [infoMessage, setInfoMessage] = useState(
        'Connect Moodle to load courses, or pair a browser session when needed.',
    );
    const [moodleQrInput, setMoodleQrInput] = useState('');
    const [pairQrInput, setPairQrInput] = useState('');
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

    useEffect(() => {
        let mounted = true;
        void loadStoredConnection()
            .then((storedConnection) => {
                if (!mounted || !storedConnection) {
                    return;
                }

                setConnection(storedConnection);
                setInfoMessage('Restored the local Moodle session.');
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
            setSiteInfo(null);
            setCourses([]);
            setSelectedCourseId(null);
            setCourseContentsById({});
            return;
        }

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
            } else if (connection) {
                await sendPairing(result.data, connection);
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

        if (!rawUrl.toLowerCase().startsWith('moodlemobile://')) {
            return;
        }

        setActiveView('connect');
        setInfoMessage(
            'Received a Moodle QR login link from the operating system.',
        );
        await connectMoodle(rawUrl);
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

    async function sendPairing(
        rawPairQr: string,
        currentConnection: MoodleConnection,
    ): Promise<void> {
        setBusy(true);
        setErrorMessage('');
        setErrorDebugDetails([]);

        try {
            await completeMobilePairing(
                parseMobilePairTarget(rawPairQr),
                currentConnection,
            );
            setScannerMode(null);
            setInfoMessage(
                'Pairing complete. The browser should finish automatically.',
            );
        } catch (error) {
            setErrorDebugDetails(getErrorDebugDetails(error));
            setErrorMessage(getSafeMessage(error));
        } finally {
            setBusy(false);
        }
    }

    const currentCourse =
        courses.find((course) => course.id === selectedCourseId) ?? null;
    const currentSections = selectedCourseId
        ? (courseContentsById[selectedCourseId] ?? [])
        : [];
    const hasCamera = Platform.OS === 'web' || (permission?.granted ?? false);
    const connected = connection !== null;

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <HeroUINativeProvider>
                    <SafeAreaView style={styles.safeArea}>
                        <StatusBar style="light" />
                        <View style={styles.appShell}>
                            {connected && (
                                <View style={[styles.topBar, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                                    <Text style={styles.appTitle}>
                                        {getScreenTitle(activeView)}
                                    </Text>
                                    {activeView === 'courses' ? (
                                        <Pressable 
                                            onPress={() => {
                                                if (connection) {
                                                    void refreshDashboard(connection);
                                                }
                                            }}
                                            style={({ pressed }) => ({
                                                padding: 8,
                                                opacity: pressed ? 0.7 : 1,
                                            })}
                                        >
                                            <RefreshCw size={24} color={palette.text} />
                                        </Pressable>
                                    ) : null}
                                </View>
                            )}

                            <View style={styles.mainScroll}>
                                {!connected || activeView === 'connect' ? (
                                    <ScrollView contentContainerStyle={styles.scrollContent}>
                                        <ConnectScreen
                                            busy={busy}
                                            connection={connection}
                                            moodleQrInput={moodleQrInput}
                                            pairQrInput={pairQrInput}
                                            onChangeMoodleQr={setMoodleQrInput}
                                            onChangePairQr={setPairQrInput}
                                            onScanMoodleQr={() =>
                                                void openScanner('moodle')
                                            }
                                            onUseMoodleQrValue={(value) => {
                                                setMoodleQrInput(value);
                                                void connectMoodle(value);
                                            }}
                                            onMoodleQrImportError={setErrorMessage}
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
                                                void sendPairing(value, connection);
                                            }}
                                            onPairQrImportError={setErrorMessage}
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
                                            setActiveView('connect')
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

                                            const url = getAuthenticatedFileUrl(
                                                connection,
                                                file.fileUrl,
                                            );
                                            if (
                                                file.mimeType ===
                                                    'application/pdf' ||
                                                file.filename
                                                    .toLowerCase()
                                                    .endsWith('.pdf')
                                            ) {
                                                setPdfPreview({
                                                    title: file.filename,
                                                    url,
                                                });
                                                return;
                                            }

                                            void Linking.openURL(url);
                                        }}
                                    />
                                ) : null}

                                {connected && activeView === 'profile' ? (
                                    <ScrollView contentContainerStyle={styles.scrollContent}>
                                        <ProfileScreen
                                            connection={connection}
                                            siteInfo={siteInfo}
                                            courseCount={courses.length}
                                            onOpenConnect={() =>
                                                setActiveView('connect')
                                            }
                                        />
                                    </ScrollView>
                                ) : null}
                            </View>

                            {connected && (
                                <BottomNav
                                    activeView={activeView}
                                    onChangeView={setActiveView}
                                />
                            )}

                            <StatusBanner
                                busy={busy || loadingDashboard}
                                infoMessage={infoMessage}
                                errorMessage={errorMessage}
                                errorDetails={errorDebugDetails}
                                withBottomNav={!!connected}
                            />
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
                    </SafeAreaView>
                </HeroUINativeProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

function getScreenTitle(view: AppView): string {
    switch (view) {
        case 'courses':
            return 'Courses';
        case 'connect':
            return 'Connect';
        case 'profile':
            return 'Profile';
    }
}

function getScreenSubtitle(view: AppView, connected: boolean): string {
    if (!connected) {
        return view === 'connect'
            ? 'Scan the Moodle QR code once.'
            : 'Connect once. The token stays local.';
    }

    switch (view) {
        case 'courses':
            return '';
        case 'connect':
            return 'QR login and browser pairing.';
        case 'profile':
            return 'Local session details.';
    }
}
