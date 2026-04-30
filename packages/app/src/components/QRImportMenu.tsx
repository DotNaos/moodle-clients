import { Dialog, Tabs } from 'heroui-native';
import { useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { FileText, Keyboard, Link2, Upload, X } from '../icons';
import { palette } from '../styles';

import {
    decodeQRCodeDataUrl,
    decodeQRCodeImageUrl,
    QRImageUpload,
} from './QRImageUpload';
import { GhostButton, SecondaryButton, TextField } from './ui';

type ImportTab = 'upload' | 'image' | 'value';

type QRImportMenuProps = Readonly<{
    open: boolean;
    busy?: boolean;
    revealLabel: string;
    title: string;
    description?: string;
    hint?: string;
    placeholder: string;
    value: string;
    submitLabel: string;
    uploadLabel: string;
    onToggle: () => void;
    onChangeValue: (value: string) => void;
    onResolvedValue: (value: string) => void;
    onError: (message: string) => void;
    supportingContent?: React.ReactNode;
}>;

export function QRImportMenu(props: QRImportMenuProps) {
    const [processing, setProcessing] = useState(false);
    const [activeTab, setActiveTab] = useState<ImportTab>(
        Platform.OS === 'web' ? 'upload' : 'value',
    );
    const disabled = props.busy || processing;

    async function handleImageSourceImport() {
        setProcessing(true);

        try {
            const resolved = await resolveImageImportValue(props.value);
            props.onResolvedValue(resolved);
        } catch (error) {
            props.onError(
                getImportErrorMessage(
                    error,
                    'Could not read that image source.',
                ),
            );
        } finally {
            setProcessing(false);
        }
    }

    async function handleSubmit() {
        setProcessing(true);

        try {
            const resolved = await resolveDirectValue(props.value);
            props.onResolvedValue(resolved);
        } catch (error) {
            props.onError(
                getImportErrorMessage(error, 'Could not use the pasted value.'),
            );
        } finally {
            setProcessing(false);
        }
    }

    function renderTabTrigger(tab: ImportTab, label: string) {
        return (
            <Tabs.Trigger value={tab} style={importPopupStyles.tabTrigger}>
                {({ isSelected }) => (
                    <View
                        style={[
                            importPopupStyles.tabTriggerInner,
                            isSelected &&
                                importPopupStyles.tabTriggerInnerActive,
                        ]}>
                        <Tabs.Label
                            numberOfLines={1}
                            style={[
                                importPopupStyles.tabLabel,
                                isSelected && importPopupStyles.tabLabelActive,
                            ]}>
                            {label}
                        </Tabs.Label>
                    </View>
                )}
            </Tabs.Trigger>
        );
    }

    const popupContent = (
        <View style={importPopupStyles.shell}>
            <View style={importPopupStyles.header}>
                <Text style={importPopupStyles.title}>{props.title}</Text>
                <Pressable
                    onPress={props.onToggle}
                    style={importPopupStyles.closeButton}
                    accessibilityLabel="Close">
                    <X size={18} color="rgba(248,250,252,0.7)" />
                </Pressable>
            </View>

            {props.description ? (
                <Text style={importPopupStyles.description}>
                    {props.description}
                </Text>
            ) : null}

            {props.hint ? (
                <Text style={importPopupStyles.hint}>{props.hint}</Text>
            ) : null}

            <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as ImportTab)}
                variant="primary"
                animation="disable-all"
                style={importPopupStyles.tabsRoot}>
                <Tabs.List style={importPopupStyles.tabsList}>
                    {renderTabTrigger('upload', 'Upload')}
                    {renderTabTrigger('image', 'Image')}
                    {renderTabTrigger('value', 'Value')}
                </Tabs.List>

                <View style={importPopupStyles.tabPanels}>
                    <Tabs.Content
                        value="upload"
                        style={importPopupStyles.tabContent}>
                        <View style={importPopupStyles.tabStack}>
                            <View style={importPopupStyles.inlineHeader}>
                                <Upload color={palette.text} size={16} />
                                <Text
                                    style={importPopupStyles.inlineHeaderText}>
                                    Upload the saved QR image
                                </Text>
                            </View>
                            <Text style={importPopupStyles.tabBody}>
                                Download or save the QR image first, then upload
                                the PNG or JPG here.
                            </Text>
                            {Platform.OS === 'web' ? (
                                <QRImageUpload
                                    label={props.uploadLabel}
                                    disabled={disabled}
                                    onDecoded={props.onResolvedValue}
                                    onError={props.onError}
                                />
                            ) : (
                                <Text style={importPopupStyles.tabHint}>
                                    Upload is available in the web app on your
                                    laptop.
                                </Text>
                            )}
                        </View>
                    </Tabs.Content>

                    <Tabs.Content
                        value="image"
                        style={importPopupStyles.tabContent}>
                        <View style={importPopupStyles.tabStack}>
                            <View style={importPopupStyles.inlineHeader}>
                                <Link2 color={palette.text} size={16} />
                                <Text
                                    style={importPopupStyles.inlineHeaderText}>
                                    Paste image URL or data URL
                                </Text>
                            </View>
                            <Text style={importPopupStyles.tabBody}>
                                Paste either the image address from your browser
                                or a full data:image/... string. We decode the
                                QR for you.
                            </Text>
                            <TextField
                                value={props.value}
                                onChangeText={props.onChangeValue}
                                placeholder="https://.../qr.png or data:image/png;base64,..."
                            />
                            <SecondaryButton
                                label={
                                    processing
                                        ? 'Reading image...'
                                        : 'Read image'
                                }
                                icon={Link2}
                                onPress={() => void handleImageSourceImport()}
                                disabled={disabled}
                            />
                        </View>
                    </Tabs.Content>

                    <Tabs.Content
                        value="value"
                        style={importPopupStyles.tabContent}>
                        <View style={importPopupStyles.tabStack}>
                            <View style={importPopupStyles.inlineHeader}>
                                <FileText color={palette.text} size={16} />
                                <Text
                                    style={importPopupStyles.inlineHeaderText}>
                                    Paste the QR value directly
                                </Text>
                            </View>
                            <Text style={importPopupStyles.tabBody}>
                                Use this when you already have the final QR
                                value and do not need the app to decode an image
                                first.
                            </Text>
                            <TextField
                                value={props.value}
                                onChangeText={props.onChangeValue}
                                placeholder={props.placeholder}
                            />
                            <SecondaryButton
                                label={
                                    processing
                                        ? 'Working...'
                                        : props.submitLabel
                                }
                                icon={FileText}
                                onPress={() => void handleSubmit()}
                                disabled={disabled}
                            />
                        </View>
                    </Tabs.Content>
                </View>
            </Tabs>

            {props.supportingContent ? (
                <View style={importPopupStyles.supportSection}>
                    {props.supportingContent}
                </View>
            ) : null}
        </View>
    );

    if (Platform.OS === 'web') {
        return (
            <View>
                <GhostButton
                    size="sm"
                    label={props.revealLabel}
                    icon={Keyboard}
                    onPress={props.onToggle}
                    disabled={props.busy}
                />
                <Modal
                    visible={props.open}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={props.onToggle}>
                    <View style={importPopupStyles.webOverlay}>
                        {popupContent}
                    </View>
                </Modal>
            </View>
        );
    }

    return (
        <View>
            <GhostButton
                label={props.revealLabel}
                icon={Keyboard}
                onPress={props.onToggle}
                disabled={props.busy}
            />
            <Dialog
                isOpen={props.open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) props.onToggle();
                }}>
                <Dialog.Portal>
                    <Dialog.Overlay style={importPopupStyles.overlay} />
                    <Dialog.Content style={importPopupStyles.dialogContent}>
                        {popupContent}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog>
        </View>
    );
}

const importPopupStyles = StyleSheet.create({
    webOverlay: {
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.58)',
        bottom: 0,
        justifyContent: 'center',
        left: 0,
        paddingHorizontal: 16,
        ...({ position: 'fixed' } as object),
        right: 0,
        top: 0,
        zIndex: 9999,
    },
    overlay: {
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    dialogContent: {
        width: '92%',
        maxWidth: 420,
        padding: 0,
        backgroundColor: 'transparent',
        borderWidth: 0,
        ...({ boxShadow: 'none' } as object),
    },
    shell: {
        backgroundColor: '#18181A',
        borderColor: 'transparent',
        borderRadius: 22,
        borderWidth: 0,
        gap: 16,
        maxWidth: 420,
        minHeight: 460,
        padding: 24,
        width: '100%',
        ...({
            boxShadow: '0px 10px 40px -10px rgba(0,0,0,0.6)',
        } as object),
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    title: {
        color: '#f8fafc',
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: -0.2,
    },
    closeButton: {
        alignItems: 'center',
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    description: {
        color: 'rgba(248, 250, 252, 0.72)',
        fontSize: 13,
        lineHeight: 19,
        marginBottom: 8,
    },
    hint: {
        color: 'rgba(248, 250, 252, 0.52)',
        fontSize: 11,
        lineHeight: 16,
    },
    tabsRoot: {
        gap: 14,
        flex: 1,
    },
    tabsList: {
        alignSelf: 'stretch',
        alignItems: 'stretch',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 9999,
        flexDirection: 'row',
        padding: 4,
    },
    tabTrigger: {
        flexBasis: 0,
        flex: 1,
        minWidth: 0,
    },
    tabTriggerInner: {
        alignItems: 'center',
        borderRadius: 9999,
        justifyContent: 'center',
        minHeight: 40,
        paddingHorizontal: 12,
        width: '100%',
    },
    tabTriggerInnerActive: {
        backgroundColor: 'rgba(255,255,255,0.14)',
        ...({
            boxShadow: '0px 1px 6px rgba(0,0,0,0.24)',
        } as object),
    },
    tabLabel: {
        color: 'rgba(248,250,252,0.68)',
        fontSize: 13,
        fontWeight: '700',
        minWidth: 0,
        textAlign: 'center',
    },
    tabLabelActive: {
        color: '#f8fafc',
    },
    tabPanels: {
        gap: 12,
        flex: 1,
        paddingTop: 8,
    },
    tabContent: {
        flex: 1,
    },
    tabStack: {
        flex: 1,
        gap: 16,
    },
    inlineHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    inlineHeaderText: {
        color: '#f8fafc',
        fontSize: 15,
        fontWeight: '700',
    },
    tabBody: {
        color: 'rgba(248,250,252,0.85)',
        fontSize: 14,
        lineHeight: 22,
        marginBottom: 'auto',
    },
    tabHint: {
        color: 'rgba(248,250,252,0.56)',
        fontSize: 12,
        lineHeight: 18,
    },
    supportSection: {
        paddingTop: 4,
    },
});

async function resolveImageImportValue(raw: string): Promise<string> {
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new Error('Paste an image URL or a data:image string first.');
    }

    if (/^data:/i.test(trimmed)) {
        if (!/^data:image\//i.test(trimmed)) {
            throw new Error('Only image data URLs are supported here.');
        }

        return decodeQRCodeDataUrl(trimmed);
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return decodeQRCodeImageUrl(trimmed);
    }

    throw new Error(
        'Paste an image URL or a full data:image string in this tab.',
    );
}

async function resolveDirectValue(raw: string): Promise<string> {
    const trimmed = raw.trim();

    if (!trimmed) {
        throw new Error('Paste the QR value first.');
    }

    return trimmed;
}

function getImportErrorMessage(error: unknown, fallback: string): string {
    if (!(error instanceof Error)) {
        return fallback;
    }

    if (/failed to fetch/i.test(error.message)) {
        return 'Could not load that image URL. If Moodle blocks direct access, download the QR image and upload it instead.';
    }

    return error.message || fallback;
}
