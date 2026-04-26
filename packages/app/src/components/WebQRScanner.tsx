import jsQR from "jsqr";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { BarcodeScanningResult } from "expo-camera";

import { styles } from "../styles";

type MediaDevice = {
  deviceId: string;
  label: string;
};

export function WebQRScanner(props: {
  active: boolean;
  onScanned: (result: BarcodeScanningResult) => void;
  onError: (message: string) => void;
}) {
  const { active, onError, onScanned } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanLockedRef = useRef(false);
  const [devices, setDevices] = useState<MediaDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) ?? devices[0],
    [devices, selectedDeviceId],
  );

  useEffect(() => {
    if (!active) {
      return;
    }

    let mounted = true;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((nextDevices) => {
        if (!mounted) {
          return;
        }
        const videoDevices = nextDevices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || `Camera ${index + 1}`,
          }));
        setDevices(videoDevices);
        setSelectedDeviceId((current) => current || videoDevices[0]?.deviceId || "");
      })
      .catch(() => onError("Could not list available cameras."));

    return () => {
      mounted = false;
    };
  }, [active, onError]);

  useEffect(() => {
    if (!active || !selectedDevice?.deviceId) {
      return;
    }

    scanLockedRef.current = false;
    let cancelled = false;

    async function startCamera() {
      stopCamera();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: selectedDevice?.deviceId },
            height: { ideal: 720 },
            width: { ideal: 1280 },
          },
        });
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        void refreshDevices();
        scheduleScan();
      } catch {
        onError("Could not start the selected camera.");
      }
    }

    function scheduleScan() {
      scanTimerRef.current = setTimeout(() => {
        scanFrame();
        if (!scanLockedRef.current) {
          scheduleScan();
        }
      }, 250);
    }

    function scanFrame() {
      const video = videoRef.current;
      if (!video || video.readyState < video.HAVE_CURRENT_DATA) {
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!code?.data) {
        return;
      }

      scanLockedRef.current = true;
      stopCamera();
      onScanned({
        type: "qr",
        data: code.data,
        bounds: { origin: { x: 0, y: 0 }, size: { height: 0, width: 0 } },
        cornerPoints: [],
      });
    }

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [active, onError, onScanned, selectedDevice?.deviceId]);

  async function refreshDevices() {
    try {
      const nextDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices((currentDevices) => {
        const videoDevices = nextDevices
          .filter((device) => device.kind === "videoinput")
          .map((device, index) => ({
            deviceId: device.deviceId,
            label: device.label || currentDevices[index]?.label || `Camera ${index + 1}`,
          }));
        return videoDevices.length > 0 ? videoDevices : currentDevices;
      });
    } catch {
      // Camera labels are a convenience. Scanning can continue without them.
    }
  }

  function stopCamera() {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }
  }

  return (
    <View style={styles.webScannerShell}>
      <View style={styles.webCameraPicker}>
        <Text style={styles.rowSubtitle}>Camera</Text>
        {React.createElement(
          "select",
          {
            value: selectedDevice?.deviceId ?? "",
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
              setSelectedDeviceId(event.currentTarget.value);
            },
            style: {
              background: "#121820",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 8,
              color: "#f8fafc",
              font: "inherit",
              minHeight: 40,
              padding: "8px 10px",
            },
          },
          devices.map((device) =>
            React.createElement("option", { key: device.deviceId, value: device.deviceId }, device.label),
          ),
        )}
      </View>
      <View style={styles.webVideoFrame}>
        {React.createElement("video", {
          ref: videoRef,
          muted: true,
          playsInline: true,
          style: {
            height: "100%",
            objectFit: "cover",
            width: "100%",
          },
        })}
        <View style={styles.scanGuide} />
      </View>
    </View>
  );
}

function stopStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}
