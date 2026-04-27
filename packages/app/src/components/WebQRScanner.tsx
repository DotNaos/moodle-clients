import type { BarcodeScanningResult } from 'expo-camera';
import jsQR from 'jsqr';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { styles } from '../styles';

type MediaDevice = {
    deviceId: string;
    label: string;
};

const AUTO_CAMERA_ID = '__auto__';

export function WebQRScanner(
    props: Readonly<{
        active: boolean;
        onScanned: (result: BarcodeScanningResult) => boolean;
        onError: (message: string) => void;
    }>,
) {
    const { active, onError, onScanned } = props;
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scanLockedRef = useRef(false);
    const [devices, setDevices] = useState<MediaDevice[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(AUTO_CAMERA_ID);

    const selectedDevice = useMemo(
        () =>
            selectedDeviceId === AUTO_CAMERA_ID
                ? null
                : (devices.find(
                      (device) => device.deviceId === selectedDeviceId,
                  ) ?? null),
        [devices, selectedDeviceId],
    );

    useEffect(() => {
        if (!active) {
            return;
        }

        if (!navigator.mediaDevices?.enumerateDevices) {
            onError(
                'This browser does not support camera selection. Open the deployed app in a modern mobile browser.',
            );
            return;
        }

        let mounted = true;
        void navigator.mediaDevices
            .enumerateDevices()
            .then((nextDevices) => {
                if (!mounted) {
                    return;
                }
                const videoDevices = nextDevices
                    .filter((device) => device.kind === 'videoinput')
                    .map((device, index) => ({
                        deviceId: device.deviceId,
                        label: device.label || `Camera ${index + 1}`,
                    }));
                setDevices(videoDevices);
            })
            .catch(() => onError('Could not list available cameras.'));

        return () => {
            mounted = false;
        };
    }, [active, onError]);

    useEffect(() => {
        if (!active) {
            return;
        }

        if (!globalThis.isSecureContext) {
            onError(
                'Web camera access needs HTTPS. Vercel deployments work automatically, and localhost works during local development.',
            );
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            onError(
                'This browser does not support camera access. Try Safari on iPhone or Chrome on Android.',
            );
            return;
        }

        scanLockedRef.current = false;
        let cancelled = false;

        async function startCamera() {
            stopCamera();
            try {
                const videoConstraints = selectedDevice?.deviceId
                    ? {
                          deviceId: { exact: selectedDevice.deviceId },
                          height: { ideal: 720 },
                          width: { ideal: 1280 },
                      }
                    : {
                          facingMode: { ideal: 'environment' },
                          height: { ideal: 720 },
                          width: { ideal: 1280 },
                      };

                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: videoConstraints,
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
            } catch (error) {
                onError(getCameraErrorMessage(error));
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

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d', {
                willReadFrequently: true,
            });
            if (!context) {
                return;
            }

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
            );
            const code = jsQR(image.data, image.width, image.height, {
                inversionAttempts: 'attemptBoth',
            });
            if (!code?.data) {
                return;
            }

            const accepted = onScanned({
                type: 'qr',
                data: code.data,
                bounds: {
                    origin: { x: 0, y: 0 },
                    size: { height: 0, width: 0 },
                },
                cornerPoints: [],
            });
            if (!accepted) {
                return;
            }

            scanLockedRef.current = true;
            stopCamera();
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
                    .filter((device) => device.kind === 'videoinput')
                    .map((device, index) => ({
                        deviceId: device.deviceId,
                        label:
                            device.label ||
                            currentDevices[index]?.label ||
                            `Camera ${index + 1}`,
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
                {React.createElement(
                    'select',
                    {
                        value: selectedDeviceId,
                        onChange: (
                            event: React.ChangeEvent<HTMLSelectElement>,
                        ) => {
                            setSelectedDeviceId(event.currentTarget.value);
                        },
                        style: {
                            background: '#121820',
                            border: '1px solid rgba(255,255,255,0.18)',
                            borderRadius: 14,
                            color: '#f8fafc',
                            fontFamily:
                                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                            fontSize: 16,
                            minHeight: 56,
                            padding: '8px 16px',
                            cursor: 'pointer',
                        },
                    },
                    React.createElement(
                        'option',
                        { value: AUTO_CAMERA_ID },
                        'Back camera (recommended)',
                    ),
                    devices.map((device) =>
                        React.createElement(
                            'option',
                            { key: device.deviceId, value: device.deviceId },
                            device.label,
                        ),
                    ),
                )}
            </View>
            <View style={styles.webVideoFrame}>
                {React.createElement('video', {
                    ref: videoRef,
                    muted: true,
                    playsInline: true,
                    style: {
                        height: '100%',
                        objectFit: 'cover',
                        width: '100%',
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

function getCameraErrorMessage(error: unknown): string {
    if (error instanceof DOMException) {
        if (
            error.name === 'NotAllowedError' ||
            error.name === 'SecurityError'
        ) {
            return 'Allow camera access in the browser to scan QR codes.';
        }

        if (
            error.name === 'NotFoundError' ||
            error.name === 'OverconstrainedError'
        ) {
            return 'No compatible camera was found. On phones, try the recommended back camera option.';
        }
    }

    return 'Could not start the selected camera.';
}
