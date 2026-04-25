import { ActivityIndicator, Text, View } from "react-native";

import { palette, styles } from "../styles";

export function StatusBanner(props: {
  busy: boolean;
  infoMessage: string;
  errorMessage: string;
}) {
  if (!props.busy && !props.errorMessage) {
    return null;
  }

  return (
    <View style={[styles.statusBanner, props.errorMessage ? styles.statusBannerError : styles.statusBannerInfo]}>
      {props.busy ? <ActivityIndicator color={palette.text} /> : null}
      <Text style={styles.statusTitle}>{props.errorMessage ? "Needs attention" : "Working"}</Text>
      <Text style={styles.statusBody}>{props.infoMessage}</Text>
      {props.errorMessage ? <Text style={styles.errorText}>{props.errorMessage}</Text> : null}
    </View>
  );
}
