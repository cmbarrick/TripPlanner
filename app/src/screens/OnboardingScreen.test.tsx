import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { OnboardingScreen } from './OnboardingScreen';

describe('OnboardingScreen', () => {
  it('starts on the first step', () => {
    const { getByText } = render(<OnboardingScreen onDone={jest.fn()} />);
    expect(getByText('Welcome to Wander')).toBeTruthy();
  });

  it('advances through steps via Next and calls onDone on the last one', () => {
    const onDone = jest.fn();
    const { getByLabelText, getByText, queryByText } = render(<OnboardingScreen onDone={onDone} />);

    fireEvent.press(getByLabelText('Next'));
    expect(getByText('Plan with an AI assistant')).toBeTruthy();
    expect(queryByText('Welcome to Wander')).toBeNull();
    expect(onDone).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('Next'));
    expect(getByText('Capture the journey')).toBeTruthy();

    fireEvent.press(getByLabelText('Get started'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Skip calls onDone immediately from the first step', () => {
    const onDone = jest.fn();
    const { getByLabelText } = render(<OnboardingScreen onDone={onDone} />);

    fireEvent.press(getByLabelText('Skip onboarding'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
