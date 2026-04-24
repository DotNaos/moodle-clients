import { StatusBar } from "expo-status-bar";
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  exchangeQRToken,
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

type AppTab = "home" | "courses" | "connect";
type ScannerMode = "moodle" | "pair" | null;

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [scannerMode, setScannerMode] = useState<ScannerMode>(null);
  const [busy, setBusy] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadingCourseId, setLoadingCourseId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState(
    "Scan the Moodle QR first, then browse courses or scan the website pairing QR.",
  );
  const [moodleQrInput, setMoodleQrInput] = useState("");
  const [pairQrInput, setPairQrInput] = useState("");
  const [connection, setConnection] = useState<MoodleConnection | null>(null);
  const [siteInfo, setSiteInfo] = useState<MoodleSiteInfo | null>(null);
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [courseContentsById, setCourseContentsById] = useState<Record<number, MoodleCourseSection[]>>({});
  const scanLockRef = useRef(false);

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
      setInfoMessage("Moodle connected. Browse courses or pair a browser session.");
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
      setConnection(nextConnection);
      setScannerMode(null);
      setActiveTab("home");
      setInfoMessage(
        `Connected to ${nextConnection.moodleSiteUrl} as user ${nextConnection.moodleUserId}.`,
      );
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
      setInfoMessage("Pairing complete. The browser should finish OAuth automatically.");
    } catch (error) {
      setErrorMessage(getSafeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const currentCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const currentSections = selectedCourseId ? courseContentsById[selectedCourseId] ?? [] : [];
  const hasCamera = permission?.granted ?? false;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.shell}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Moodle Client</Text>
          <Text style={styles.title}>Study workspace</Text>
          <Text style={styles.lede}>
            One place for Moodle login, course browsing, and connected study tools.
          </Text>
        </View>

        <View style={styles.tabBar}>
          <TabButton label="Home" active={activeTab === "home"} onPress={() => setActiveTab("home")} />
          <TabButton label="Courses" active={activeTab === "courses"} onPress={() => setActiveTab("courses")} />
          <TabButton label="Connect" active={activeTab === "connect"} onPress={() => setActiveTab("connect")} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {activeTab === "home" ? (
            <HomeTab
              connection={connection}
              siteInfo={siteInfo}
              courseCount={courses.length}
              loading={loadingDashboard}
              onRefresh={() => {
                if (connection) {
                  void refreshDashboard(connection);
                }
              }}
              onOpenConnect={() => setActiveTab("connect")}
              onOpenCourses={() => setActiveTab("courses")}
            />
          ) : null}

          {activeTab === "courses" ? (
            <CoursesTab
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
              onSelectCourse={(courseId) => {
                setSelectedCourseId(courseId);
                if (connection && !courseContentsById[courseId]) {
                  void loadCourseContents(connection, courseId);
                }
              }}
            />
          ) : null}

          {activeTab === "connect" ? (
            <ConnectTab
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

          <StatusPanel busy={busy || loadingDashboard} infoMessage={infoMessage} errorMessage={errorMessage} />
        </ScrollView>
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
    </SafeAreaView>
  );
}

function HomeTab(props: {
  connection: MoodleConnection | null;
  siteInfo: MoodleSiteInfo | null;
  courseCount: number;
  loading: boolean;
  onRefresh: () => void;
  onOpenConnect: () => void;
  onOpenCourses: () => void;
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Overview</Text>
        <Text style={styles.cardBody}>
          {props.connection
            ? "Your Moodle mobile token is active in this app. Use Courses to inspect content or Connect to pair a browser session."
            : "Connect Moodle first to load site info and courses."}
        </Text>
        <View style={styles.buttonRow}>
          <PrimaryButton label="Refresh" onPress={props.onRefresh} />
          <GhostButton label="Connect" onPress={props.onOpenConnect} />
        </View>
      </View>

      {props.siteInfo ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Connected account</Text>
          <Text style={styles.infoValue}>{props.siteInfo.siteName}</Text>
          <Text style={styles.infoSecondary}>{props.siteInfo.userName}</Text>
          <Text style={styles.infoSecondary}>User {props.siteInfo.userId}</Text>
          <Text style={styles.infoSecondary}>{props.siteInfo.siteUrl}</Text>
        </View>
      ) : (
        <EmptyState
          title="No Moodle connection yet"
          body="Open the Connect tab and scan the Moodle Mobile QR to unlock the app."
          actionLabel="Open Connect"
          onPress={props.onOpenConnect}
        />
      )}

      <View style={styles.statsGrid}>
        <StatCard label="Courses" value={props.loading ? "..." : String(props.courseCount)} />
        <StatCard label="Status" value={props.connection ? "Ready" : "Waiting"} />
      </View>

      {props.connection ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Next step</Text>
          <Text style={styles.cardBody}>
            Browse your courses directly in the app or jump to Connect when a browser needs OAuth pairing.
          </Text>
          <GhostButton label="Open Courses" onPress={props.onOpenCourses} />
        </View>
      ) : null}
    </View>
  );
}

function CoursesTab(props: {
  connection: MoodleConnection | null;
  courses: MoodleCourse[];
  selectedCourseId: number | null;
  sections: MoodleCourseSection[];
  currentCourse: MoodleCourse | null;
  loadingDashboard: boolean;
  loadingCourseId: number | null;
  onRefresh: () => void;
  onSelectCourse: (courseId: number) => void;
}) {
  if (!props.connection) {
    return (
      <View style={styles.tabContent}>
        <EmptyState
          title="Course explorer locked"
          body="Connect Moodle in the Connect tab first. Then the app can load your enrolled courses and sections."
        />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Course explorer</Text>
        <Text style={styles.cardBody}>
          Uses the same authenticated Moodle Mobile token to load your courses and course contents directly.
        </Text>
        <GhostButton label="Refresh courses" onPress={props.onRefresh} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Courses</Text>
        {props.loadingDashboard ? (
          <ActivityIndicator color="#f5f5f4" />
        ) : props.courses.length > 0 ? (
          props.courses.map((course) => (
            <Pressable
              key={course.id}
              onPress={() => props.onSelectCourse(course.id)}
              style={({ pressed }) => [
                styles.courseRow,
                props.selectedCourseId === course.id && styles.courseRowActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <View style={styles.courseMeta}>
                <Text style={styles.courseTitle}>{course.fullName}</Text>
                <Text style={styles.courseSubtitle}>{course.shortName}</Text>
              </View>
              <Text style={styles.courseBadge}>{course.visible ? "Visible" : "Hidden"}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>No courses returned.</Text>
        )}
      </View>

      {props.currentCourse ? (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Course content</Text>
          <Text style={styles.cardTitle}>{props.currentCourse.fullName}</Text>
          {props.loadingCourseId === props.currentCourse.id ? (
            <ActivityIndicator color="#f5f5f4" />
          ) : props.sections.length > 0 ? (
            props.sections.map((section, index) => (
              <View key={`${props.currentCourse?.id}-${section.id ?? index}`} style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{section.name || `Section ${index + 1}`}</Text>
                {section.summary ? <Text style={styles.sectionBody}>{stripHtml(section.summary)}</Text> : null}
                {section.modules.length > 0 ? (
                  section.modules.map((module, moduleIndex) => (
                    <View key={`${module.id ?? moduleIndex}-${module.name}`} style={styles.moduleRow}>
                      <View style={styles.moduleDot} />
                      <View style={styles.moduleMeta}>
                        <Text style={styles.moduleTitle}>{module.name}</Text>
                        {module.modname ? <Text style={styles.moduleSubtitle}>{module.modname}</Text> : null}
                        {module.url ? <Text style={styles.moduleLink}>{module.url}</Text> : null}
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyText}>No modules in this section.</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No course sections returned yet.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function ConnectTab(props: {
  busy: boolean;
  connection: MoodleConnection | null;
  moodleQrInput: string;
  pairQrInput: string;
  onChangeMoodleQr: (value: string) => void;
  onChangePairQr: (value: string) => void;
  onScanMoodleQr: () => void;
  onUseMoodleQr: () => void;
  onScanPairQr: () => void;
  onUsePairQr: () => void;
}) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connect this phone to Moodle</Text>
        <Text style={styles.cardBody}>
          Scan the Moodle Mobile QR or paste the raw <Text style={styles.inlineCode}>moodlemobile://</Text> link.
        </Text>
        <View style={styles.buttonRow}>
          <PrimaryButton label={props.busy ? "Working..." : "Open scanner"} onPress={props.onScanMoodleQr} />
          <GhostButton label="Use pasted QR link" onPress={props.onUseMoodleQr} />
        </View>
        <TextInput
          value={props.moodleQrInput}
          onChangeText={props.onChangeMoodleQr}
          placeholder="moodlemobile://https://..."
          placeholderTextColor="#78716c"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pair a browser OAuth session</Text>
        <Text style={styles.cardBody}>
          After the website shows its pairing QR, open the scanner modal here and scan that QR to finish OAuth.
        </Text>
        <View style={styles.buttonRow}>
          <PrimaryButton label="Scan pairing QR" onPress={props.onScanPairQr} />
          <GhostButton label="Use pasted pair QR" onPress={props.onUsePairQr} />
        </View>
        <TextInput
          value={props.pairQrInput}
          onChangeText={props.onChangePairQr}
          placeholder="moodlereadonlyproxy://pair?pairId=..."
          placeholderTextColor="#78716c"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      {props.connection ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Phone is authenticated</Text>
          <Text style={styles.infoValue}>{props.connection.moodleSiteUrl}</Text>
          <Text style={styles.infoSecondary}>User {props.connection.moodleUserId}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScannerModal(props: {
  visible: boolean;
  mode: ScannerMode;
  hasCamera: boolean;
  onClose: () => void;
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
}) {
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" transparent={false}>
      <SafeAreaView style={styles.modalSafeArea}>
        <StatusBar style="light" />
        <View style={styles.modalHeader}>
          <View style={styles.modalHeaderCopy}>
            <Text style={styles.eyebrow}>Scanner</Text>
            <Text style={styles.modalTitle}>
              {props.mode === "moodle" ? "Scan Moodle QR" : "Scan pairing QR"}
            </Text>
            <Text style={styles.modalBody}>
              {props.mode === "moodle"
                ? "Point the camera at the Moodle Mobile QR. The app will authenticate automatically."
                : "Point the camera at the pairing QR on the OAuth website. The browser will finish OAuth automatically."}
            </Text>
          </View>
          <GhostButton label="Close" onPress={props.onClose} />
        </View>

        {props.hasCamera ? (
          <View style={styles.modalCameraFrame}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={props.onBarcodeScanned}
            />
            <View style={styles.scanGuide} />
          </View>
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera permission is required to scan QR codes.</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function StatusPanel(props: {
  busy: boolean;
  infoMessage: string;
  errorMessage: string;
}) {
  return (
    <View style={styles.statusCard}>
      {props.busy ? <ActivityIndicator color="#f5f5f4" style={styles.spinner} /> : null}
      <Text style={styles.statusTitle}>Status</Text>
      <Text style={styles.statusBody}>{props.infoMessage}</Text>
      {props.errorMessage ? <Text style={styles.errorText}>{props.errorMessage}</Text> : null}
    </View>
  );
}

function EmptyState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{props.title}</Text>
      <Text style={styles.cardBody}>{props.body}</Text>
      {props.actionLabel && props.onPress ? <GhostButton label={props.actionLabel} onPress={props.onPress} /> : null}
    </View>
  );
}

function StatCard(props: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.sectionLabel}>{props.label}</Text>
      <Text style={styles.statValue}>{props.value}</Text>
    </View>
  );
}

function TabButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.tabButton,
        props.active && styles.tabButtonActive,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.tabButtonText, props.active && styles.tabButtonTextActive]}>{props.label}</Text>
    </Pressable>
  );
}

function PrimaryButton(props: { label: string; onPress: () => void | Promise<void> }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
    >
      <Text style={styles.primaryButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function GhostButton(props: { label: string; onPress: () => void | Promise<void> }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.ghostButton, pressed && styles.buttonPressed]}
    >
      <Text style={styles.ghostButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getSafeMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "The request failed.";
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0c0a09",
  },
  shell: {
    flex: 1,
  },
  content: {
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  eyebrow: {
    color: "#a8a29e",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafaf9",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -0.9,
  },
  lede: {
    color: "#d6d3d1",
    fontSize: 15,
    lineHeight: 24,
  },
  tabBar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tabButtonActive: {
    backgroundColor: "#f5f5f4",
    borderColor: "rgba(255,255,255,0.35)",
  },
  tabButtonText: {
    color: "#e7e5e4",
    fontSize: 14,
    fontWeight: "700",
  },
  tabButtonTextActive: {
    color: "#111827",
  },
  tabContent: {
    gap: 16,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  cameraCard: {
    backgroundColor: "rgba(14,165,233,0.08)",
    borderColor: "rgba(14,165,233,0.24)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 18,
  },
  cardTitle: {
    color: "#fafaf9",
    fontSize: 18,
    fontWeight: "700",
  },
  cardBody: {
    color: "#d6d3d1",
    fontSize: 14,
    lineHeight: 22,
  },
  inlineCode: {
    color: "#fafaf9",
    fontSize: 13,
    fontWeight: "700",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#f5f5f4",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  ghostButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ghostButtonText: {
    color: "#fafaf9",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonPressed: {
    opacity: 0.8,
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.2)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    color: "#fafaf9",
    fontSize: 14,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cameraFrame: {
    aspectRatio: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  permissionBox: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 220,
    padding: 16,
  },
  permissionText: {
    color: "#fafaf9",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  infoCard: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.26)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 4,
    padding: 18,
  },
  infoLabel: {
    color: "#bbf7d0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    color: "#fafaf9",
    fontSize: 16,
    fontWeight: "600",
  },
  infoSecondary: {
    color: "#e7e5e4",
    fontSize: 14,
    lineHeight: 21,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  statValue: {
    color: "#fafaf9",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  sectionLabel: {
    color: "#a8a29e",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  courseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  courseRowActive: {
    backgroundColor: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.28)",
  },
  courseMeta: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  courseTitle: {
    color: "#fafaf9",
    fontSize: 15,
    fontWeight: "700",
  },
  courseSubtitle: {
    color: "#a8a29e",
    fontSize: 13,
  },
  courseBadge: {
    color: "#e7e5e4",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionCard: {
    gap: 10,
    marginTop: 12,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
  },
  sectionTitle: {
    color: "#fafaf9",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionBody: {
    color: "#d6d3d1",
    fontSize: 14,
    lineHeight: 22,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  moduleDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 7,
    backgroundColor: "#38bdf8",
  },
  moduleMeta: {
    flex: 1,
    gap: 2,
  },
  moduleTitle: {
    color: "#fafaf9",
    fontSize: 14,
    fontWeight: "600",
  },
  moduleSubtitle: {
    color: "#a8a29e",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  moduleLink: {
    color: "#7dd3fc",
    fontSize: 12,
  },
  emptyText: {
    color: "#a8a29e",
    fontSize: 14,
    lineHeight: 21,
  },
  statusCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  spinner: {
    alignSelf: "flex-start",
  },
  statusTitle: {
    color: "#fafaf9",
    fontSize: 16,
    fontWeight: "700",
  },
  statusBody: {
    color: "#d6d3d1",
    fontSize: 14,
    lineHeight: 22,
  },
  errorText: {
    color: "#fcd34d",
    fontSize: 14,
    lineHeight: 22,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#09090b",
    padding: 20,
    gap: 16,
  },
  modalHeader: {
    gap: 14,
  },
  modalHeaderCopy: {
    gap: 8,
  },
  modalTitle: {
    color: "#fafaf9",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  modalBody: {
    color: "#d6d3d1",
    fontSize: 15,
    lineHeight: 24,
  },
  modalCameraFrame: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#000000",
    position: "relative",
  },
  scanGuide: {
    position: "absolute",
    left: "17%",
    top: "24%",
    width: "66%",
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: "rgba(245,245,244,0.85)",
    borderRadius: 24,
  },
});
