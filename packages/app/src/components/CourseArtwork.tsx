import { useMemo, useState } from 'react';
import {
    Image,
    StyleSheet,
    Text,
    View,
    type ImageResizeMode,
    type ImageStyle,
    type StyleProp,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import { SvgUri, SvgXml } from 'react-native-svg';

import { getInitials, sanitizeCourseName } from '../format';
import { palette } from '../styles';

type CourseArtworkProps = {
    readonly imageUrl?: string | null;
    readonly title: string;
    readonly fallbackLabel?: string;
    readonly resizeMode?: ImageResizeMode;
    readonly style?: StyleProp<ViewStyle>;
    readonly imageStyle?: StyleProp<ImageStyle>;
    readonly fallbackTextStyle?: StyleProp<TextStyle>;
};

export function CourseArtwork(props: CourseArtworkProps) {
    const [failed, setFailed] = useState(false);
    const svgXml = useMemo(
        () => decodeSvgDataUri(props.imageUrl ?? ''),
        [props.imageUrl],
    );
    const label =
        props.fallbackLabel ??
        getInitials(sanitizeCourseName(props.title)).slice(0, 3) ??
        'FS';
    const canRenderRaster =
        Boolean(props.imageUrl) &&
        !failed &&
        !svgXml &&
        !isSvgUri(props.imageUrl ?? '');

    return (
        <View style={[artworkStyles.container, props.style]}>
            <View style={artworkStyles.fallback}>
                <Text
                    style={[
                        artworkStyles.fallbackText,
                        props.fallbackTextStyle,
                    ]}
                    numberOfLines={1}>
                    {label || 'FS'}
                </Text>
            </View>
            {svgXml && !failed ? (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        props.imageStyle as StyleProp<ViewStyle>,
                    ]}>
                    <SvgXml
                        xml={svgXml}
                        width="100%"
                        height="100%"
                        preserveAspectRatio="xMidYMid slice"
                    />
                </View>
            ) : null}
            {!svgXml && isSvgUri(props.imageUrl ?? '') && !failed ? (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        props.imageStyle as StyleProp<ViewStyle>,
                    ]}>
                    <SvgUri
                        uri={props.imageUrl ?? ''}
                        width="100%"
                        height="100%"
                        onError={() => setFailed(true)}
                    />
                </View>
            ) : null}
            {canRenderRaster ? (
                <Image
                    source={{ uri: props.imageUrl ?? '' }}
                    style={[StyleSheet.absoluteFill, props.imageStyle]}
                    resizeMode={props.resizeMode ?? 'cover'}
                    onError={() => setFailed(true)}
                />
            ) : null}
        </View>
    );
}

function isSvgUri(value: string): boolean {
    return /\.svg(?:$|[?#])/i.test(value) && !isSvgDataUri(value);
}

function decodeSvgDataUri(value: string): string | null {
    if (!isSvgDataUri(value)) {
        return null;
    }

    const commaIndex = value.indexOf(',');
    if (commaIndex === -1) {
        return null;
    }

    const metadata = value.slice(0, commaIndex).toLowerCase();
    const payload = value.slice(commaIndex + 1);
    try {
        if (metadata.includes(';base64')) {
            return decodeBase64(payload);
        }
        return decodeURIComponent(payload);
    } catch {
        return null;
    }
}

function isSvgDataUri(value: string): boolean {
    return /^data:image\/svg\+xml/i.test(value);
}

function decodeBase64(value: string): string {
    const clean = value.replace(/\s/g, '');
    const binary =
        typeof globalThis.atob === 'function'
            ? globalThis.atob(clean)
            : decodeBase64Binary(clean);
    const escaped = Array.from(binary, (char) =>
        `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
    ).join('');
    return decodeURIComponent(escaped);
}

function decodeBase64Binary(value: string): string {
    const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let buffer = 0;
    let bits = 0;

    for (const char of value) {
        const index = alphabet.indexOf(char);
        if (index < 0 || char === '=') {
            continue;
        }
        buffer = (buffer << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            output += String.fromCharCode((buffer >> bits) & 0xff);
        }
    }

    return output;
}

const artworkStyles = StyleSheet.create({
    container: {
        backgroundColor: palette.surfaceRaised,
        overflow: 'hidden',
    },
    fallback: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
    },
    fallbackText: {
        color: palette.blue,
        fontSize: 18,
        fontWeight: '900',
    },
});
