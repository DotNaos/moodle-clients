import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';

import { PrimaryButton, SecondaryButton, TextField } from '../../components/ui';
import { Check, LogIn, UserRound } from '../../icons';
import { replayStyles } from '../../replayStyles';
import { palette } from '../../styles';

type RuntimeMode = 'automating' | 'manual';

export function WebexBridgeHeader(props: {
    readonly mode: RuntimeMode;
    readonly status: string;
    readonly onOpenManual: () => void;
    readonly onEditCredentials: () => void;
    readonly onClose: () => void;
}) {
    return (
        <View style={replayStyles.bridgeHeader}>
            <Text style={replayStyles.bridgeTitle}>
                {props.mode === 'automating' ? 'Signing in to Webex' : 'Manual Webex login'}
            </Text>
            <Text style={replayStyles.bridgeCopy}>
                {props.mode === 'automating'
                    ? 'Study Replay is signing in in the background. If the school login needs extra confirmation, open the WebView.'
                    : 'Complete the school login here. Study Replay will keep playback in the native player.'}
            </Text>
            {props.status ? <Text style={replayStyles.bridgeStatus}>{props.status}</Text> : null}
            <View style={replayStyles.bridgeActions}>
                {props.mode === 'automating' ? (
                    <SecondaryButton
                        label="Open WebView"
                        fullWidth={false}
                        onPress={props.onOpenManual}
                    />
                ) : (
                    <SecondaryButton
                        label="Edit Login"
                        fullWidth={false}
                        onPress={props.onEditCredentials}
                    />
                )}
                <SecondaryButton
                    label="Close"
                    fullWidth={false}
                    onPress={props.onClose}
                />
            </View>
        </View>
    );
}

export function WebexAutomationPanel() {
    return (
        <View
            accessibilityLabel="Webex automatic sign in running"
            style={replayStyles.bridgeAutomationPanel}>
            <ActivityIndicator color={palette.text} />
            <Text style={replayStyles.bridgeAutomationTitle}>
                Signing in in the background
            </Text>
            <Text style={replayStyles.bridgeCopy}>
                The browser is hidden unless the school login needs manual confirmation.
            </Text>
        </View>
    );
}

export function MoodleReconnectPrompt(props: { readonly onClose: () => void }) {
    return (
        <View
            accessibilityLabel="Moodle reconnect required"
            style={replayStyles.bridgeLoginWrap}>
            <View style={replayStyles.bridgeLoginContent}>
                <View style={replayStyles.bridgeLoginIcon}>
                    <LogIn color={palette.blue} size={26} />
                </View>
                <Text style={replayStyles.bridgeTitle}>Reconnect Moodle</Text>
                <Text style={replayStyles.bridgeCopy}>
                    Videos need Moodle's browser login session. Reconnect Moodle from
                    Profile, then open this course again.
                </Text>
                <View style={replayStyles.bridgeActions}>
                    <SecondaryButton
                        label="Close"
                        onPress={props.onClose}
                    />
                </View>
            </View>
        </View>
    );
}

export function WebexLoginPrompt(props: {
    readonly username: string;
    readonly password: string;
    readonly remember: boolean;
    readonly error: string;
    readonly onUsernameChange: (value: string) => void;
    readonly onPasswordChange: (value: string) => void;
    readonly onToggleRemember: () => void;
    readonly onSubmit: () => void | Promise<void>;
    readonly onManualLogin: () => void;
    readonly onClose: () => void;
}) {
    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            accessibilityLabel="Webex login screen"
            style={replayStyles.bridgeLoginWrap}>
            <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={replayStyles.bridgeLoginContent}>
                <View style={replayStyles.bridgeLoginIcon}>
                    <UserRound color={palette.blue} size={26} />
                </View>
                <Text style={replayStyles.bridgeTitle}>Webex sign in</Text>
                <Text style={replayStyles.bridgeCopy}>
                    Enter your FHGR/Moodle username, not the Webex email address. Study
                    Replay uses it only inside the WebView login flow and can save it in
                    the device keychain.
                </Text>
                <View style={replayStyles.bridgeForm}>
                    <TextField
                        value={props.username}
                        onChangeText={props.onUsernameChange}
                        placeholder="FHGR/Moodle username"
                        textContentType="username"
                        autoComplete="username"
                        autoCapitalize="none"
                    />
                    <TextField
                        value={props.password}
                        onChangeText={props.onPasswordChange}
                        placeholder="Password"
                        secureTextEntry
                        textContentType="password"
                        autoComplete="password"
                    />
                    <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel="Remember Webex login"
                        accessibilityState={{ checked: props.remember }}
                        style={replayStyles.rememberRow}
                        onPress={props.onToggleRemember}>
                        <View
                            style={[
                                replayStyles.checkbox,
                                props.remember && replayStyles.checkboxChecked,
                            ]}>
                            {props.remember ? (
                                <Check color={palette.ink} size={16} />
                            ) : null}
                        </View>
                        <View style={replayStyles.rememberCopy}>
                            <Text style={replayStyles.rememberTitle}>Remember login</Text>
                            <Text style={replayStyles.rememberHint}>
                                Stored in the device keychain.
                            </Text>
                        </View>
                    </Pressable>
                    {props.error ? (
                        <Text style={replayStyles.bridgeError}>{props.error}</Text>
                    ) : null}
                </View>
                <View style={replayStyles.bridgeActions}>
                    <PrimaryButton
                        label="Sign in"
                        icon={LogIn}
                        onPress={props.onSubmit}
                    />
                    <SecondaryButton
                        label="Manual WebView"
                        onPress={props.onManualLogin}
                    />
                    <SecondaryButton
                        label="Close"
                        onPress={props.onClose}
                    />
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}
