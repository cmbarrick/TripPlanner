import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup';

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
