import { StyleSheet } from "react-native";
import { palette } from "./palette";
import { formAndOverlayStyles } from "./styles.formAndOverlay";
import { navigationAndMediaStyles } from "./styles.navigationAndMedia";

export { palette } from "./palette";

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  surfaceFrame: {
    backgroundColor: palette.surface,
    borderRadius: 24,
    overflow: "hidden",
  },
  surfaceFrameRaised: {
    backgroundColor: palette.surfaceRaised,
  },
  surfaceFrameReady: {
    backgroundColor: "rgba(140,199,255,0.06)",
  },
  heroSurface: {
    backgroundColor: "#101720",
  },
  appShell: {
    flex: 1,
  },
  mainScroll: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  brandCopy: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: palette.subtle,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.6,
    textTransform: "uppercase",
  },
  brandLabel: {
    color: palette.subtle,
    fontSize: 13,
    fontWeight: "700",
  },
  appTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "800",
  },
  appSubtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  connectionPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  connectionPillReady: {
    backgroundColor: palette.greenSoft,
    borderColor: "rgba(125,211,166,0.35)",
  },
  connectionPillWaiting: {
    backgroundColor: palette.amberSoft,
    borderColor: "rgba(247,200,115,0.35)",
  },
  pillDot: {
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  pillDotReady: {
    backgroundColor: palette.green,
  },
  pillDotWaiting: {
    backgroundColor: palette.amber,
  },
  connectionPillText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "800",
  },
  scrollContent: { flexGrow: 1,
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  screen: { flex: 1,
    gap: 14,
  },
  connectStage: {
    flex: 1,
    marginHorizontal: -20,
    marginTop: -8,
    overflow: "hidden",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    position: "relative",
  },
  connectStageBackgroundImage: {
    bottom: 0,
    height: "100%",
    left: 0,
    right: 0,
    top: 0,
    width: "100%",
    ...({
      objectFit: "cover",
      objectPosition: "50% 50%",
    } as object),
  },
  connectStageSideGradientLeft: {
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
    width: "24%",
    zIndex: 1,
    ...({
      backgroundImage:
        "linear-gradient(90deg, rgba(0,0,0,0.82), rgba(0,0,0,0))",
    } as object),
  },
  connectStageSideGradientRight: {
    bottom: 0,
    position: "absolute",
    right: 0,
    top: 0,
    width: "24%",
    zIndex: 1,
    ...({
      backgroundImage:
        "linear-gradient(270deg, rgba(0,0,0,0.82), rgba(0,0,0,0))",
    } as object),
  },
  connectStageBottomGradient: {
    bottom: 0,
    height: "38%",
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1,
    ...({
      backgroundImage:
        "linear-gradient(0deg, rgba(0,0,0,0.58), rgba(0,0,0,0))",
    } as object),
  },
  connectHelpSection: {
    gap: 12,
    paddingTop: 8,
  },
  qrImportMenu: {
    gap: 12,
  },
  qrImportMenuContent: {
    gap: 12,
  },
  qrImportHeader: {
    gap: 4,
  },
  qrImportHint: {
    color: palette.subtle,
    fontSize: 12,
    lineHeight: 18,
  },
  qrImportSupport: {
    paddingTop: 4,
  },
  connectStageContent: {
    flex: 1,
    justifyContent: "space-between",
    position: "relative",
    width: "100%",
    zIndex: 2,
  },
  connectSection: {
    gap: 14,
    paddingBottom: 18,
    paddingTop: 4,
  },
  connectSectionBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  calendarHero: {
    alignItems: "center",
    backgroundColor: "rgba(140,199,255,0.06)",
    borderRadius: 24,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  calendarHeroIcon: {
    alignItems: "center",
    backgroundColor: "rgba(140,199,255,0.12)",
    borderRadius: 18,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  calendarSettings: {
    gap: 12,
  },
  calendarLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  calendarList: {
    gap: 8,
  },
  calendarEventRow: {
    alignItems: "center",
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 76,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  calendarDateBlock: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    height: 52,
    justifyContent: "center",
    width: 54,
  },
  calendarDateDay: {
    color: palette.text,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 22,
  },
  calendarDateMonth: {
    color: palette.subtle,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  calendarEventBody: {
    flex: 1,
    gap: 3,
  },
  calendarCourseHint: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  bridgeApprovalPanel: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 24,
    gap: 8,
    padding: 16,
  },
  bridgeApprovalKicker: {
    color: palette.subtle,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.7,
    textTransform: "uppercase",
  },
  bridgeApprovalTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  bridgeApprovalBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  connectWelcomeHero: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 24,
  },
  connectWelcomeCopy: {
    alignItems: "center",
    gap: 14,
    maxWidth: 620,
    marginTop: 18,
  },
  connectWelcomeLogoHalo: {
    display: "none",
  },
  connectWelcomeLogo: {
    height: 240,
    width: 240,
  },
  connectWelcomeTitle: {
    color: palette.text,
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -0.6,
    lineHeight: 40,
    textAlign: "center",
  },
  connectWelcomeBody: {
    color: "rgba(248,250,252,0.78)",
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 30,
    maxWidth: 560,
    textAlign: "center",
  },
  connectWelcomeActions: {
    alignItems: "center",
    backgroundColor: "transparent",
    gap: 12,
    maxWidth: 620,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 36,
    width: "100%",
    alignSelf: "center",
  },
  connectWelcomePrimaryButton: {
    alignSelf: "stretch",
    borderRadius: 9999,
    minHeight: 56,
    paddingHorizontal: 24,
    width: "100%",
  },
  connectWelcomePrimaryButtonText: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  ghostButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderRadius: 9999,
    borderWidth: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 10,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  buttonSmall: {
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  ghostButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  buttonSmallText: {
    fontSize: 14,
    fontWeight: "600",
  },
  connectWelcomeSecondaryAction: {
    alignSelf: "center",
    opacity: 0.88,
    paddingHorizontal: 12,
  },
  connectWelcomeSecondaryActionText: {
    color: "rgba(248,250,252,0.86)",
    fontSize: 16,
    fontWeight: "700",
  },
  infoPanel: {
    gap: 10,
    padding: 13,
  },
  heroPanel: {
    gap: 18,
    padding: 22,
  },
  heroPanelReady: {
  },
  heroLabel: {
    color: palette.subtle,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: palette.text,
    fontSize: 21,
    fontWeight: "800",
    lineHeight: 27,
  },
  heroBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    gap: 12,
    padding: 16,
  },
  cardCompact: {
    padding: 10,
  },
  cardRaised: {
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 21,
  },
  cardBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  tipList: {
    gap: 8,
  },
  tipItem: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  tipItemStrong: {
    color: palette.text,
    fontWeight: "800",
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 4,
    zIndex: 10,
    elevation: 10,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "800",
  },
  sectionKicker: {
    color: palette.subtle,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  actionRow: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  buttonBase: {
    alignItems: "center",
    borderRadius: 9999,
    borderWidth: 0,
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "center",
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 24,
  },
  buttonFill: {
    width: "100%",
  },
  primaryButton: {
    backgroundColor: palette.text,
  },
  primaryButtonText: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.56,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
  metricGrid: {
    flexDirection: "row",
    gap: 10,
  },
  metricCard: {
    flex: 1,
    gap: 7,
    minHeight: 86,
    padding: 14,
  },
  metricLabel: {
    color: palette.subtle,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  metricValue: {
    color: palette.text,
    fontSize: 21,
    fontWeight: "800",
  },
  metricHint: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  listRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  listRowActive: {
  },
  courseAvatar: {
    alignItems: "center",
    backgroundColor: "#223041",
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  courseAvatarText: {
    color: palette.blue,
    fontSize: 13,
    fontWeight: "900",
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 19,
  },
  rowSubtitle: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  badge: {
    alignSelf: "flex-start",
    borderColor: palette.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});

export const styles = {
  ...baseStyles,
  ...formAndOverlayStyles,
  ...navigationAndMediaStyles,
};
