import jsQR from 'jsqr';
import React, { useRef } from 'react';
import { Platform } from 'react-native';

import { Upload } from '../icons';
import { palette } from '../styles';

export function QRImageUpload(
    props: Readonly<{
        label: string;
        disabled?: boolean;
        onDecoded: (data: string) => void;
        onError: (message: string) => void;
    }>,
) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    if (Platform.OS !== 'web') {
        return null;
    }

    async function handleFileChange(
        event: React.ChangeEvent<HTMLInputElement>,
    ) {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (!file) {
            return;
        }

        try {
            const data = await decodeQRCodeFile(file);
            props.onDecoded(data);
        } catch (error) {
            props.onError(
                error instanceof Error
                    ? error.message
                    : 'Could not read the QR image.',
            );
        }
    }

    function handleOpenPicker() {
        if (props.disabled) {
            return;
        }

        inputRef.current?.click();
    }

    return (
        <>
            <button
                type="button"
                onClick={handleOpenPicker}
                disabled={props.disabled}
                style={{
                    alignItems: 'center',
                    appearance: 'none',
                    background: 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: 9999,
                    boxSizing: 'border-box',
                    color: palette.text,
                    cursor: props.disabled ? 'default' : 'pointer',
                    display: 'flex',
                    fontFamily:
                        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                    fontSize: 16,
                    fontWeight: 800,
                    gap: 8,
                    justifyContent: 'center',
                    minHeight: 56,
                    opacity: props.disabled ? 0.45 : 1,
                    padding: '16px 24px',
                    whiteSpace: 'nowrap',
                    width: '100%',
                }}>
                <Upload color={palette.text} size={18} />
                <span>{props.label}</span>
            </button>

            <input
                ref={inputRef}
                accept="image/*"
                disabled={props.disabled}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                type="file"
            />
        </>
    );
}

export async function decodeQRCodeFile(file: File): Promise<string> {
    return decodeQRCodeBlob(file);
}

export async function decodeQRCodeDataUrl(dataUrl: string): Promise<string> {
    try {
        const imageElement = await loadImageFromSource(dataUrl);
        return decodeImageElement(imageElement);
    } catch (error) {
        throw new Error('Could not read that image data.', { cause: error });
    }
}

export async function decodeQRCodeImageUrl(imageUrl: string): Promise<string> {
    try {
        const imageElement = await loadImageFromSource(imageUrl, true);
        return decodeImageElement(imageElement);
    } catch (error) {
        throw new Error(
            'Could not load that image URL. If Moodle blocks direct access, download the QR image and upload it instead.',
            { cause: error },
        );
    }
}

export async function decodeQRCodeBlob(blob: Blob): Promise<string> {
    const objectUrl = URL.createObjectURL(blob);
    try {
        const imageElement = await loadImageFromSource(objectUrl);
        return await decodeImageElement(imageElement);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function decodeImageElement(
    imageElement: HTMLImageElement,
): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        throw new Error('Could not inspect the QR image.');
    }

    context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < image.data.length; i += 4) {
        const r = image.data[i];
        const g = image.data[i + 1];
        const b = image.data[i + 2];
        const a = image.data[i + 3];

        if (a < 128) {
            image.data[i] = 255;
            image.data[i + 1] = 255;
            image.data[i + 2] = 255;
            image.data[i + 3] = 255;
        } else {
            const avg = (r + g + b) / 3;
            const v = avg < 160 ? 0 : 255;
            image.data[i] = v;
            image.data[i + 1] = v;
            image.data[i + 2] = v;
            image.data[i + 3] = 255;
        }
    }

    const code = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'attemptBoth',
    });

    if (!code?.data) {
        throw new Error('No QR code found in this image.');
    }

    return code.data;
}

async function loadImageFromSource(
    src: string,
    crossOrigin: boolean = false,
): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (crossOrigin) {
            image.crossOrigin = 'Anonymous';
        }

        image.onload = () => {
            resolve(image);
        };

        image.onerror = () => {
            reject(new Error('Could not decode this image.'));
        };

        image.src = src;
    });
}
