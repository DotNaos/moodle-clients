import { StatusBar } from "expo-status-bar";
import { type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Linking, SafeAreaView, ScrollView, Text, View } from "react-native";

import { BottomNav } from "./src/components/BottomNav";
import { PdfViewerModal } from "./src/components/PdfViewerModal";
import { ScannerModal } from "./src/components/ScannerModal";
import { StatusBanner } from "./src/components/StatusBanner";
import { ConnectScreen } from "./src/screens/ConnectScreen";
import { CoursesScreen } from "./src/screens/CoursesScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { TodayScreen } from "./src/screens/TodayScreen";
import { getSafeMessage } from "./src/format";
import {
  exchangeQRToken,
  getAuthenticatedFileUrl,
  getCourseContents,
  getCourses,
  getSiteInfo,
  parseMobileQRLink,
  type MoodleConnection,
  type MoodleCourse,
  type MoodleCourseSection,
  type MoodleSiteInfo,
} from "./src/moodle";
import { completeMobilePairing, parseMobilePairTarget } from "./src/pairing";
import { loadStoredConnection, storeConnection } from "./src/storage";
import { styles } from "./src/styles";
import type { AppView, ScannerMode } from "./src/types";

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [activeView, setActiveView] = useState<AppView>("today");
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingCourseId, setLoadingCourseId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState(
    "Connect Moodle to load courses, or pair a browser session when needed.",
  );
  const [moodleQrInput, setMoodleQrInput] = useState("");
  const [pairQrInput, setPairQrInput] = useState("");
  const [connection, setConnection] = useState<MoodleConnection | null>(null);
  const [siteInfo, setSiteInfo] = useState<MoodleSiteInfo | null>(null);
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [courseContentsById, setCourseContentsById] = useState<Record<number, MoodleCourseSection[]>>({});
  const [pdfPreview, setPdfPreview] = useState<{ title: string; url: string } | null>(null);
  const scanLockRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadStoredConnection().then((storedConnection) => {
      if (!mounted || !storedConnection) {
        return;
      }

      setConnection(storedConnection);
      setInfoMessage("Restored the local Moodle session.");
    });

    return () => {
      mounted = false;
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
    if (!connection || !selectedCourseId || courseContentsById[selectedCourseId]) {
      return;
    }

    void loadCourseContents(connection, selectedCourseId);
  }, [connection, selectedCourseId, courseContentsById]);

  async function refreshDashboard(currentConnection: MoodleConnection) {
    setLoadingDashboard(true);
    setErrorMessage("");

    try {
      const [nextSiteInfo, nextCourses] = await Promise.all([
        getSiteInfo(currentConnection),
        getCourses(currentConnection),
      ]);
      setSiteInfo(nextSiteInfo);
      setCourses(nextCourses);
      setSelectedCourseId((previous) => {
        if (previous && nextCourses.some((course) => course.id === previous)) {
          return previous;
        }
        return nextCourses[0]?.id ?? null;
      });
      setInfoMessage("Moodle is connected. Courses and pairing are ready.");
    } catch (error) {
      setErrorMessage(getSafeMessage(error));
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function loadCourseContents(currentConnection: MoodleConnection, courseId: number) {
    setLoadingCourseId(courseId);
    setErrorMessage("");

    try {
      const sections = await getCourseContents(currentConnection, courseId);
      setCourseContentsById((current) => ({
        ...current,
        [courseId]: sections,
      }));
    } catch (error) {
      setErrorMessage(getSafeMessage(error));
    } finally {
      setLoadingCourseId((current) => (current === courseId ? null : current));
    }
  }

  async function handleBarcodeScanned(result: BarcodeScanningResult): Promise<void> {
    if (!scannerMode || busy || scanLockRef.current) {
      return;
    }

    scanLockRef.current = true;
    try {
      if (scannerMode === "moodle") {
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
    setErrorMessage("");
    if (!permission) {
      return;
    }

    if (!permission.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        setErrorMessage("Camera permission is required to scan QR codes.");
        return;
      }
    }

    setScannerMode(nextMode);
  }

  async function connectMoodle(rawQrLink: string): Promise<void> {
    setBusy(true);
    setErrorMessage("");

    try {
      const nextConnection = await exchangeQRToken(parseMobileQRLink(rawQrLink));
      await storeConnection(nextConnection);
      setConnection(nextConnection);
      setScannerMode(null);
      setActiveView("today");
      setInfoMessage(`Connected to Moodle as user ${nextConnection.moodleUserId}.`);
    } catch (error) {
      setErrorMessage(getSafeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendPairing(rawPairQr: string, currentConnection: MoodleConnection): Promise<void> {
    setBusy(true);
    setErrorMessage("");

    try {
      await completeMobilePairing(parseMobilePairTarget(rawPairQr), currentConnection);
      setScannerMode(null);
      setInfoMessage("Pairing complete. The browser should finish automatically.");
    } catch (error) {
      setErrorMessage(getSafeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const currentCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const currentSections = selectedCourseId ? courseContentsById[selectedCourseId] ?? [] : [];
  const hasCamera = permission?.granted ?? false;
  const connected = connection !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appShell}>
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.brandCopy}>
              <Text style={styles.eyebrow}>Moodle Client</Text>
              <Text style={styles.appTitle}>{getScreenTitle(activeView)}</Text>
            </View>
            <View
              style={[
                styles.connectionPill,
                connected ? styles.connectionPillReady : styles.connectionPillWaiting,
              ]}
            >
              <View style={[styles.pillDot, connected ? styles.pillDotReady : styles.pillDotWaiting]} />
              <Text style={styles.connectionPillText}>{connected ? "Ready" : "Setup"}</Text>
            </View>
          </View>
          <Text style={styles.appSubtitle}>{getScreenSubtitle(activeView, connected)}</Text>
        </View>

        <ScrollView style={styles.mainScroll} contentContainerStyle={styles.scrollContent}>
          {activeView === "today" ? (
            <TodayScreen
              connection={connection}
              siteInfo={siteInfo}
              courses={courses}
              loading={loadingDashboard}
              onRefresh={() => {
                if (connection) {
                  void refreshDashboard(connection);
                }
              }}
              onOpenConnect={() => setActiveView("connect")}
              onOpenCourses={() => setActiveView("courses")}
            />
          ) : null}

          {activeView === "courses" ? (
            <CoursesScreen
              connection={connection}
              courses={courses}
              selectedCourseId={selectedCourseId}
              sections={currentSections}
              currentCourse={currentCourse}
              loadingDashboard={loadingDashboard}
              loadingCourseId={loadingCourseId}
              onRefresh={() => {
                if (connection) {
                  void refreshDashboard(connection);
                }
              }}
              onOpenConnect={() => setActiveView("connect")}
              onSelectCourse={(courseId) => {
                setSelectedCourseId(courseId);
                if (connection && !courseContentsById[courseId]) {
                  void loadCourseContents(connection, courseId);
                }
              }}
              onOpenFile={(file) => {
                if (!connection) {
                  return;
                }

                const url = getAuthenticatedFileUrl(connection, file.fileUrl);
                if (file.mimeType === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf")) {
                  setPdfPreview({ title: file.filename, url });
                  return;
                }

                void Linking.openURL(url);
              }}
            />
          ) : null}

          {activeView === "connect" ? (
            <ConnectScreen
              busy={busy}
              connection={connection}
              moodleQrInput={moodleQrInput}
              pairQrInput={pairQrInput}
              onChangeMoodleQr={setMoodleQrInput}
              onChangePairQr={setPairQrInput}
              onScanMoodleQr={() => void openScanner("moodle")}
              onUseMoodleQr={() => void connectMoodle(moodleQrInput)}
              onScanPairQr={() => {
                if (!connection) {
                  setErrorMessage("Connect Moodle first.");
                  return;
                }
                void openScanner("pair");
              }}
              onUsePairQr={() => {
                if (!connection) {
                  setErrorMessage("Connect Moodle first.");
                  return;
                }
                void sendPairing(pairQrInput, connection);
              }}
            />
          ) : null}

          {activeView === "profile" ? (
            <ProfileScreen
              connection={connection}
              siteInfo={siteInfo}
              courseCount={courses.length}
              onOpenConnect={() => setActiveView("connect")}
            />
          ) : null}

          <StatusBanner busy={busy || loadingDashboard} infoMessage={infoMessage} errorMessage={errorMessage} />
        </ScrollView>

        <BottomNav activeView={activeView} onChangeView={setActiveView} />
      </View>

      <ScannerModal
        visible={scannerMode !== null}
        mode={scannerMode}
        hasCamera={hasCamera}
        onClose={() => setScannerMode(null)}
        onBarcodeScanned={(result) => {
          void handleBarcodeScanned(result);
        }}
      />
      <PdfViewerModal
        visible={pdfPreview !== null}
        title={pdfPreview?.title ?? ""}
        url={pdfPreview?.url ?? null}
        onClose={() => setPdfPreview(null)}
      />
    </SafeAreaView>
  );
}

function getScreenTitle(view: AppView): string {
  switch (view) {
    case "today":
      return "Today";
    case "courses":
      return "Courses";
    case "connect":
      return "Connect";
    case "profile":
      return "Profile";
  }
}

function getScreenSubtitle(view: AppView, connected: boolean): string {
  if (!connected) {
    return view === "connect"
      ? "Scan the Moodle QR code once."
      : "Connect once. The token stays local.";
  }

  switch (view) {
    case "today":
      return "Daily overview.";
    case "courses":
      return "Grouped by semester.";
    case "connect":
      return "QR login and browser pairing.";
    case "profile":
      return "Local session details.";
  }
}
