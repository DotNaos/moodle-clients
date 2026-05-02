import { useState } from 'react';
import {
    Image,
    ImageBackground,
    type ImageStyle,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';

import { QRImportMenu } from '../components/QRImportMenu';
import {
    PrimaryButton,
    ScreenSection,
    SecondaryButton,
    SectionHeader,
    SessionCard,
} from '../components/ui';
import { ScanLine } from '../icons';
import type { MoodleConnection } from '../moodle';
import type { MobilePairTarget } from '../pairing';
import { styles } from '../styles';

const moodleClientLogo = require('../../../../apps/mobile/assets/splash-icon.png');
const loginBackground = require('../../../../assets/new_other_aspect.png');

type ConnectScreenProps = Readonly<{
    busy: boolean;
    connection: MoodleConnection | null;
    pendingPairTarget: MobilePairTarget | null;
    moodleQrInput: string;
    pairQrInput: string;
    onChangeMoodleQr: (value: string) => void;
    onChangePairQr: (value: string) => void;
    onScanMoodleQr: () => void;
    onUseMoodleQrValue: (value: string) => void;
    onMoodleQrImportError: (message: string) => void;
    onScanPairQr: () => void;
    onUsePairQrValue: (value: string) => void;
    onConfirmPairing: () => void;
    onCancelPairing: () => void;
    onPairQrImportError: (message: string) => void;
}>;

type DisconnectedConnectStateProps = Readonly<{
    busy: boolean;
    moodleQrInput: string;
    showOptions: boolean;
    onChangeMoodleQr: (value: string) => void;
    onScanMoodleQr: () => void;
    onUseMoodleQrValue: (value: string) => void;
    onMoodleQrImportError: (message: string) => void;
    onToggleOptions: () => void;
}>;

type ConnectedSetupCardProps = Readonly<{
    busy: boolean;
    showOptions: boolean;
    moodleQrInput: string;
    onChangeMoodleQr: (value: string) => void;
    onScanMoodleQr: () => void;
    onUseMoodleQrValue: (value: string) => void;
    onMoodleQrImportError: (message: string) => void;
    onToggleOptions: () => void;
}>;

type PairingCardProps = Readonly<{
    busy: boolean;
    showOptions: boolean;
    pendingTarget: MobilePairTarget | null;
    pairQrInput: string;
    onChangePairQr: (value: string) => void;
    onScanPairQr: () => void;
    onUsePairQrValue: (value: string) => void;
    onConfirmPairing: () => void;
    onCancelPairing: () => void;
    onPairQrImportError: (message: string) => void;
    onToggleOptions: () => void;
}>;

export function ConnectScreen(props: ConnectScreenProps) {
    const [showMoodleOptions, setShowMoodleOptions] = useState(false);
    const [showPairOptions, setShowPairOptions] = useState(false);

    if (!props.connection) {
        return (
            <DisconnectedConnectState
                busy={props.busy}
                moodleQrInput={props.moodleQrInput}
                showOptions={showMoodleOptions}
                onChangeMoodleQr={props.onChangeMoodleQr}
                onScanMoodleQr={props.onScanMoodleQr}
                onUseMoodleQrValue={props.onUseMoodleQrValue}
                onMoodleQrImportError={props.onMoodleQrImportError}
                onToggleOptions={() =>
                    setShowMoodleOptions((current) => !current)
                }
            />
        );
    }

    return (
        <ScreenSection>
            <SessionCard siteUrl={props.connection.moodleSiteUrl} />

            <PairingCard
                busy={props.busy}
                showOptions={showPairOptions}
                pendingTarget={props.pendingPairTarget}
                pairQrInput={props.pairQrInput}
                onChangePairQr={props.onChangePairQr}
                onScanPairQr={props.onScanPairQr}
                onUsePairQrValue={props.onUsePairQrValue}
                onConfirmPairing={props.onConfirmPairing}
                onCancelPairing={props.onCancelPairing}
                onPairQrImportError={props.onPairQrImportError}
                onToggleOptions={() =>
                    setShowPairOptions((current) => !current)
                }
            />

            <ConnectedSetupCard
                busy={props.busy}
                showOptions={showMoodleOptions}
                moodleQrInput={props.moodleQrInput}
                onChangeMoodleQr={props.onChangeMoodleQr}
                onScanMoodleQr={props.onScanMoodleQr}
                onUseMoodleQrValue={props.onUseMoodleQrValue}
                onMoodleQrImportError={props.onMoodleQrImportError}
                onToggleOptions={() =>
                    setShowMoodleOptions((current) => !current)
                }
            />
        </ScreenSection>
    );
}

function DisconnectedConnectState(props: DisconnectedConnectStateProps) {
    const { height } = useWindowDimensions();
    const stageMinHeight = Math.max(height - 40, 640);

    return (
        <ScreenSection>
            <ImageBackground
                source={loginBackground}
                style={[styles.connectStage, { minHeight: stageMinHeight }]}
                imageStyle={styles.connectStageBackgroundImage as ImageStyle}
                resizeMode="cover">
                <View
                    style={styles.connectStageSideGradientLeft}
                    pointerEvents="none"
                />
                <View
                    style={styles.connectStageSideGradientRight}
                    pointerEvents="none"
                />
                <View
                    style={styles.connectStageBottomGradient}
                    pointerEvents="none"
                />
                <View style={styles.connectStageContent}>
                    <View style={styles.connectWelcomeHero}>
                        <Image
                            source={moodleClientLogo}
                            style={styles.connectWelcomeLogo as ImageStyle}
                            resizeMode="contain"
                            accessibilityLabel="Moodle Client logo"
                        />
                        <View style={styles.connectWelcomeCopy}>
                            <Text style={styles.connectWelcomeTitle}>
                                Moodle Client
                            </Text>
                            <Text style={styles.connectWelcomeBody}>
                                Scan the QR code on your Moodle login page.
                            </Text>
                        </View>
                    </View>

                    <View style={styles.connectWelcomeActions}>
                        <PrimaryButton
                            label={props.busy ? 'Working...' : 'Scan QR Code'}
                            icon={ScanLine}
                            onPress={props.onScanMoodleQr}
                            disabled={props.busy}
                            style={styles.connectWelcomePrimaryButton}
                            labelStyle={styles.connectWelcomePrimaryButtonText}
                        />
                        <QRImportMenu
                            open={props.showOptions}
                            busy={props.busy}
                            revealLabel="No camera?"
                            title="Import Moodle QR"
                            placeholder="moodlemobile://..."
                            value={props.moodleQrInput}
                            submitLabel="Continue with value"
                            uploadLabel="Upload image"
                            onToggle={props.onToggleOptions}
                            onChangeValue={props.onChangeMoodleQr}
                            onResolvedValue={props.onUseMoodleQrValue}
                            onError={props.onMoodleQrImportError}
                        />
                    </View>
                </View>
            </ImageBackground>
        </ScreenSection>
    );
}

function ConnectedSetupCard(props: ConnectedSetupCardProps) {
    return (
        <View style={styles.connectSection}>
            <SectionHeader
                kicker="Moodle"
                title="Switch Account"
                action={
                    <QRImportMenu
                        open={props.showOptions}
                        busy={props.busy}
                        revealLabel="Keyboard"
                        title="Import Moodle QR"
                        placeholder="moodlemobile://..."
                        value={props.moodleQrInput}
                        submitLabel="Continue with value"
                        uploadLabel="Upload image"
                        onToggle={props.onToggleOptions}
                        onChangeValue={props.onChangeMoodleQr}
                        onResolvedValue={props.onUseMoodleQrValue}
                        onError={props.onMoodleQrImportError}
                    />
                }
            />
            <SecondaryButton
                label={props.busy ? 'Working…' : 'Scan Moodle QR'}
                icon={ScanLine}
                onPress={props.onScanMoodleQr}
                disabled={props.busy}
            />
        </View>
    );
}

function PairingCard(props: PairingCardProps) {
    return (
        <View style={styles.connectSection}>
            <SectionHeader
                kicker="Authenticator"
                title="Share Moodle Login"
                action={
                    <QRImportMenu
                        open={props.showOptions}
                        busy={props.busy}
                        revealLabel="Keyboard"
                        title="Import Bridge QR"
                        description="Paste a bridge QR from Moodle Web, ChatGPT, or another app. The target app provides its own origin and endpoint in the QR."
                        placeholder="moodleauth://bridge?origin=..."
                        value={props.pairQrInput}
                        submitLabel="Continue with value"
                        uploadLabel="Upload image"
                        onToggle={props.onToggleOptions}
                        onChangeValue={props.onChangePairQr}
                        onResolvedValue={props.onUsePairQrValue}
                        onError={props.onPairQrImportError}
                    />
                }
            />
            <Text style={styles.connectSectionBody}>
                Scan a bridge QR from another app, then approve the target
                before this phone shares its Moodle token.
            </Text>
            {props.pendingTarget ? (
                <View style={styles.bridgeApprovalPanel}>
                    <Text style={styles.bridgeApprovalKicker}>
                        Ready to share with
                    </Text>
                    <Text style={styles.bridgeApprovalTitle}>
                        {props.pendingTarget.appName ??
                            compactHost(props.pendingTarget.origin)}
                    </Text>
                    <Text style={styles.bridgeApprovalBody}>
                        Origin: {compactHost(props.pendingTarget.origin)}
                        {'\n'}
                        Endpoint: {compactHost(props.pendingTarget.endpoint)}
                    </Text>
                    <View style={styles.actionRow}>
                        <PrimaryButton
                            label={props.busy ? 'Sharing...' : 'Share Login'}
                            icon={ScanLine}
                            onPress={props.onConfirmPairing}
                            disabled={props.busy}
                            fullWidth={false}
                        />
                        <SecondaryButton
                            label="Cancel"
                            onPress={props.onCancelPairing}
                            disabled={props.busy}
                            fullWidth={false}
                        />
                    </View>
                </View>
            ) : null}
            <PrimaryButton
                label="Scan Bridge QR"
                icon={ScanLine}
                onPress={props.onScanPairQr}
                disabled={props.busy}
            />
        </View>
    );
}

function compactHost(origin: string): string {
    try {
        return new URL(origin).host;
    } catch {
        return origin;
    }
}
