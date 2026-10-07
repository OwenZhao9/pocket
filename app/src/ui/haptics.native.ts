import * as Haptics from "expo-haptics";

export const tap = () => void Haptics.selectionAsync();
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
export const failure = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
