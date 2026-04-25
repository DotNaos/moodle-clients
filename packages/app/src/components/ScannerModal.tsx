import { useEffect, useRef, useState } from "react";
import { Modal, Platform, SafeAreaView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView, type BarcodeScanningResult } from "expo-camera";

import { SecondaryButton } from "./ui";
import { WebQRScanner } from "./WebQRScanner";
import { styles } from "../styles";
import type { ScannerMode } from "../types";

export function ScannerModal(props: {
  visible: boolean;
  mode: ScannerMode;
  hasCamera: boolean;
  onClose: () => void;
  onBarcodeScanned: (result: BarcodeScanningResult) => void;
  onScannerError: (message: string) => void;
}) {
  const [scanComplete, setScanComplete] = useState(false);
  const scanCompleteRef = useRef(false);

  useEffect(() => {
    if (props.visible) {
      scanCompleteRef.current = false;
      setScanComplete(false);
    }
  }, [props.visible, props.mode]);

  function handleScanned(result: BarcodeScanningResult) {
    if (scanCompleteRef.current) {
      return;
    }

    scanCompleteRef.current = true;
    setScanComplete(true);
    props.onBarcodeScanned(result);
  }

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
          Platform.OS === "web" ? (
            <WebQRScanner
              active={props.visible && !scanComplete}
              onScanned={handleScanned}
              onError={props.onScannerError}
            />
          ) : (
            <View style={styles.modalCameraFrame}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                active={!scanComplete}
                onBarcodeScanned={scanComplete ? undefined : handleScanned}
              />
              <View style={styles.scanGuide} />
            </View>
          )
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera permission is required to scan QR codes.</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
