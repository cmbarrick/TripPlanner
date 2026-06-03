import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// On web, the Entra login opens in a popup that is redirected back to the app's
// redirect URI (e.g. /auth?code=...). This call lets that popup hand the result
// back to the opener window and close itself; without it the popup just renders
// the app at an unmatched route and the sign-in never completes.
WebBrowser.maybeCompleteAuthSession();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
