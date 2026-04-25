import { Modal, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, type BarcodeScanningResult } from "expo-camera";

import { SecondaryButton } from "./ui";
import { styles } from "../styles";
import type { ScannerMode } from "../types";

export function ScannerModal(props: {
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
          <Text style={styles.eyebrow}>Scanner</Text>
          <Text style={styles.modalTitle}>
            {props.mode === "moodle" ? "Scan Moodle QR" : "Scan pairing QR"}
          </Text>
          <Text style={styles.modalBody}>
            {props.mode === "moodle"
              ? "Point the camera at the Moodle Mobile QR code. The app will unlock the Moodle session automatically."
              : "Point the camera at the pairing QR shown by the web app or GPT OAuth page."}
          </Text>
          <SecondaryButton label="Close scanner" onPress={props.onClose} />
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
