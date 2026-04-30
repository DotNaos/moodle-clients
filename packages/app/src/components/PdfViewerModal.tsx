import React from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';

import { X } from '../icons';
import { palette, styles } from '../styles';

declare const require: (id: string) => { WebView: React.ComponentType<any> };

export function PdfViewerModal(
    props: Readonly<{
        visible: boolean;
        title: string;
        url: string | null;
        onClose: () => void;
    }>,
) {
    return (
        <Modal
            animationType="slide"
            visible={props.visible}
            onRequestClose={props.onClose}>
            <View style={styles.pdfModal}>
                <View style={styles.pdfHeader}>
                    <View style={styles.rowText}>
                        <Text style={styles.pdfTitle} numberOfLines={1}>
                            {props.title || 'PDF'}
                        </Text>
                    </View>
                    <Pressable
                        onPress={props.onClose}
                        style={styles.iconButton}>
                        <X color={palette.text} size={22} />
                    </Pressable>
                </View>
                {props.url ? <PdfSurface url={props.url} /> : null}
            </View>
        </Modal>
    );
}

function PdfSurface(props: Readonly<{ url: string }>) {
    const targetUrl =
        Platform.OS === 'android' || Platform.OS === 'web'
            ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(
                  props.url,
              )}`
            : props.url;

    if (Platform.OS === 'web') {
        return (
            <View style={styles.pdfFrame}>
                {/*
          React Native Web can host a native iframe for browser previews while
          iOS and Android use the WebView below.
        */}
                {React.createElement('iframe', {
                    src: targetUrl,
                    style: {
                        border: 0,
                        height: '100%',
                        width: '100%',
                    },
                    title: 'PDF preview',
                })}
            </View>
        );
    }

    const NativeWebView = require('react-native-webview').WebView;

    return (
        <NativeWebView
            source={{ uri: targetUrl }}
            style={styles.pdfWebView}
            startInLoadingState
            allowsBackForwardNavigationGestures
        />
    );
}
