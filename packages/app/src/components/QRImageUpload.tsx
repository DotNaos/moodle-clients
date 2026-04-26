import jsQR from "jsqr";
import React from "react";
import { Platform } from "react-native";

import { Upload } from "../icons";
import { palette } from "../styles";

export function QRImageUpload(props: {
  label: string;
  disabled?: boolean;
  onDecoded: (data: string) => void;
  onError: (message: string) => void;
}) {
  if (Platform.OS !== "web") {
    return null;
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    try {
      const data = await decodeQRCodeFile(file);
      props.onDecoded(data);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : "Could not read the QR image.");
    }
  }

  return React.createElement(
    "label",
    {
      style: {
        alignItems: "center",
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${palette.borderStrong}`,
        borderRadius: 8,
        boxSizing: "border-box",
        color: palette.text,
        cursor: props.disabled ? "default" : "pointer",
        display: "flex",
        font: "inherit",
        fontSize: 14,
        fontWeight: 800,
        gap: 8,
        justifyContent: "center",
        minHeight: 48,
        opacity: props.disabled ? 0.45 : 1,
        padding: "12px 16px",
      },
    },
    React.createElement(Upload, { color: palette.text, size: 18 }),
    props.label,
    React.createElement("input", {
      accept: "image/*",
      disabled: props.disabled,
      onChange: handleFileChange,
      style: { display: "none" },
      type: "file",
    }),
  );
}

async function decodeQRCodeFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not inspect the QR image.");
  }

  context.drawImage(bitmap, 0, 0);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(image.data, image.width, image.height, {
    inversionAttempts: "attemptBoth",
  });

  if (!code?.data) {
    throw new Error("No QR code found in this image.");
  }

  return code.data;
}
