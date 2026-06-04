import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup';

// expo-audio / expo-image-picker pull in native modules that aren't initialized
// under Jest. Stub the surface our components use so the App smoke test renders.
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
    uri: null,
    getStatus: () => ({ durationMillis: 0 }),
  }),
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
  RecordingPresets: { HIGH_QUALITY: {} },
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  setAudioModeAsync: jest.fn(async () => {}),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  MediaTypeOptions: { Images: 'Images' },
}));

// react-native-reanimated and react-native-worklets require native module
// initialization that doesn't happen in Jest. Use the official mock so any
// test that transitively imports animated/gesture code still compiles.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// react-native-draggable-flatlist is a pure UI component; stub it out so the
// App smoke test can render without a native Worklets runtime.
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ data, renderItem, ListHeaderComponent, ListFooterComponent, contentContainerStyle, ...rest }: any) =>
      React.createElement('ScrollView', { style: contentContainerStyle },
        ListHeaderComponent,
        ...(data ?? []).map((item: any, i: number) =>
          React.createElement('View', { key: item.id ?? i },
            renderItem({ item, drag: () => {}, isActive: false, getIndex: () => i }),
          ),
        ),
        ListFooterComponent,
      ),
    ScaleDecorator: ({ children }: any) => children,
  };
});
