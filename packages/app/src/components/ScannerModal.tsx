import { CameraView, type BarcodeScanningResult } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { Dialog } from 'heroui-native';
import { CircleHelp, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { parseMobileQRLink } from '../moodle';
import { parseMobilePairTarget } from '../pairing';
import { styles } from '../styles';
import type { ScannerMode } from '../types';

import { WebQRScanner } from './WebQRScanner';

export function ScannerModal(props: {
    readonly visible: boolean;
    readonly mode: ScannerMode;
    readonly hasCamera: boolean;
    readonly onClose: () => void;
    readonly onBarcodeScanned: (result: BarcodeScanningResult) => void;
    readonly onScannerError: (message: string) => void;
}) {
    const [scanComplete, setScanComplete] = useState(false);
    const scanCompleteRef = useRef(false);
    const closeEnabledRef = useRef(false);
    const openedAtRef = useRef(0);
    const isWeb = Platform.OS === 'web';

    function renderCameraContent() {
        if (!props.hasCamera) {
            return (
                <View style={styles.permissionBox}>
                    <Text style={styles.permissionText}>
                        Camera permission is required to scan QR codes.
                    </Text>
                </View>
            );
        }

        if (isWeb) {
            return (
                <WebQRScanner
                    active={!scanComplete}
                    onScanned={handleScanned}
                    onError={props.onScannerError}
                />
            );
        }

        return (
            <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                    barcodeTypes: ['qr'],
                }}
                active={!scanComplete}
                onBarcodeScanned={scanComplete ? undefined : handleScanned}
            />
        );
    }

    useEffect(() => {
        if (props.visible) {
            openedAtRef.current = Date.now();
            closeEnabledRef.current = false;
            scanCompleteRef.current = false;
            setScanComplete(false);
            const timer = setTimeout(() => {
                closeEnabledRef.current = true;
            }, 250);

            return () => {
                clearTimeout(timer);
            };
        }

        closeEnabledRef.current = false;
    }, [props.visible, props.mode]);

    function handleScanned(result: BarcodeScanningResult): boolean {
        if (scanCompleteRef.current) {
            return false;
        }

        if (Date.now() - openedAtRef.current < 1000) {
            return false;
        }

        try {
            if (props.mode === 'moodle') {
                parseMobileQRLink(result.data);
            } else {
                parseMobilePairTarget(result.data);
            }
        } catch {
            return false;
        }

        scanCompleteRef.current = true;
        setScanComplete(true);
        props.onBarcodeScanned(result);
        return true;
    }

    const scannerContent = (
        <View style={scannerStyles.shell}>
            <View style={scannerStyles.header}>
                <Pressable
                    onPress={props.onClose}
                    accessibilityLabel="Close scanner"
                    style={scannerStyles.closeButton}>
                    <X size={18} color="#f8fafc" />
                </Pressable>
            </View>

            {isWeb ? (
                <View style={scannerStyles.webCameraStage}>
                    {renderCameraContent()}
                </View>
            ) : (
                <View style={scannerStyles.cameraFrame}>
                    {renderCameraContent()}
                    {props.hasCamera ? (
                        <View style={scannerStyles.scanGuide}>
                            <View
                                style={[
                                    scannerStyles.corner,
                                    scannerStyles.cornerTopLeft,
                                ]}
                            />
                            <View
                                style={[
                                    scannerStyles.corner,
                                    scannerStyles.cornerTopRight,
                                ]}
                            />
                            <View
                                style={[
                                    scannerStyles.corner,
                                    scannerStyles.cornerBottomLeft,
                                ]}
                            />
                            <View
                                style={[
                                    scannerStyles.corner,
                                    scannerStyles.cornerBottomRight,
                                ]}
                            />
                        </View>
                    ) : null}
                </View>
            )}

            <View style={scannerStyles.helpRow}>
                <CircleHelp size={14} color="#f8fafc" />
                <Text style={scannerStyles.helpText}>
                    {isWeb
                        ? 'On phone web, allow camera access. Your session stays in this browser.'
                        : 'Need help?'}
                </Text>
            </View>
        </View>
    );

    if (isWeb) {
        if (!props.visible) {
            return null;
        }

        return (
            <View style={scannerStyles.webOverlay}>
                <StatusBar style="light" />
                {scannerContent}
            </View>
        );
    }

    return (
        <Dialog
            isOpen={props.visible}
            onOpenChange={(nextOpen) => {
                if (!nextOpen && closeEnabledRef.current) {
                    props.onClose();
                }
            }}>
            <StatusBar style="light" />
            <Dialog.Portal>
                <Dialog.Overlay style={scannerStyles.overlay} />
                <Dialog.Content
                    isSwipeable={true}
                    style={scannerStyles.dialogContent}>
                    {scannerContent}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    );
}

const scannerStyles = StyleSheet.create({
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.48)',
    },
    webOverlay: {
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.48)',
        bottom: 0,
        justifyContent: 'center',
        left: 0,
        paddingHorizontal: 16,
        paddingVertical: 16,
        ...({ position: 'fixed' } as object),
        right: 0,
        top: 0,
        zIndex: 9999,
    },
    dialogContent: {
        width: '92%',
        maxWidth: 360,
        padding: 0,
        backgroundColor: 'transparent',
        borderWidth: 0,
        ...({ boxShadow: 'none' } as object),
    },
    shell: {
        alignItems: 'center',
        backgroundColor: 'rgba(12, 11, 10, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.16)',
        borderRadius: 28,
        borderWidth: 1,
        gap: 12,
        maxWidth: 440,
        paddingBottom: 22,
        paddingHorizontal: 22,
        paddingTop: 12,
        overflow: 'hidden',
        width: '100%',
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        minHeight: 36,
        paddingHorizontal: 18,
        width: '100%',
    },
    closeButton: {
        minHeight: 32,
        minWidth: 32,
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    cameraFrame: {
        aspectRatio: 1,
        alignSelf: 'stretch',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 0,
        maxWidth: 316,
        minHeight: 250,
        overflow: 'hidden',
        position: 'relative',
        width: '100%',
    },
    webCameraStage: {
        alignSelf: 'stretch',
        minHeight: 360,
    },
    debugCameraPlaceholder: {
        alignItems: 'center',
        flex: 1,
        justifyContent: 'center',
    },
    debugCameraText: {
        color: 'rgba(248,250,252,0.7)',
        fontSize: 12,
        fontWeight: '700',
    },
    scanGuide: {
        ...StyleSheet.absoluteFillObject,
    },
    corner: {
        borderColor: '#f8fafc',
        height: 32,
        position: 'absolute',
        width: 32,
    },
    cornerTopLeft: {
        borderLeftWidth: 4,
        borderTopWidth: 4,
        borderTopLeftRadius: 8,
        left: 0,
        top: 0,
    },
    cornerTopRight: {
        borderRightWidth: 4,
        borderTopWidth: 4,
        borderTopRightRadius: 8,
        right: 0,
        top: 0,
    },
    cornerBottomLeft: {
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 8,
        bottom: 0,
        left: 0,
    },
    cornerBottomRight: {
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 8,
        bottom: 0,
        right: 0,
    },
    helpRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 6,
        width: '100%',
    },
    helpText: {
        color: 'rgba(248,250,252,0.82)',
        flex: 1,
        fontSize: 13,
        fontWeight: '700',
    },
});
