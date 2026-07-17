import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NoteCard } from './NoteCard';
import { Note } from '../types';

const baseNote: Note = {
  id: 'note-1',
  tripId: 't1',
  ownerId: 'owner',
  scope: 'Trip',
  kind: 'Text',
  bodyText: 'Original text',
  mediaAssets: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  version: 3,
};

describe('NoteCard — edit conflict handling', () => {
  it('closes the editor after a successful save', () => {
    const onEdit = jest.fn();
    const { getByLabelText, rerender, queryByLabelText, getByText } = render(
      <NoteCard note={baseNote} tripId="t1" onDelete={jest.fn()} onEdit={onEdit} savingEdit={false} />,
    );

    fireEvent.press(getByLabelText('Edit journal entry'));
    fireEvent.changeText(getByLabelText('Edit journal entry'), 'Updated text');
    fireEvent.press(getByLabelText('Save edit'));
    expect(onEdit).toHaveBeenCalledWith('Updated text');

    // Simulate the mutation resolving successfully (savingEdit observed true, then false, no error).
    rerender(<NoteCard note={baseNote} tripId="t1" onDelete={jest.fn()} onEdit={onEdit} savingEdit={true} />);
    rerender(<NoteCard note={baseNote} tripId="t1" onDelete={jest.fn()} onEdit={onEdit} savingEdit={false} />);

    // Editing closed: the "Save edit"/"Cancel edit" controls are gone and the (unchanged, since
    // this note prop was never actually updated in this test) body text renders as plain text again.
    expect(queryByLabelText('Save edit')).toBeNull();
    expect(getByText('Original text')).toBeTruthy();
  });

  it('keeps the editor open with the draft and shows the error on a conflict', () => {
    const onEdit = jest.fn();
    const { getByLabelText, rerender, getByText } = render(
      <NoteCard note={baseNote} tripId="t1" onDelete={jest.fn()} onEdit={onEdit} savingEdit={false} />,
    );

    fireEvent.press(getByLabelText('Edit journal entry'));
    fireEvent.changeText(getByLabelText('Edit journal entry'), 'My conflicting edit');
    fireEvent.press(getByLabelText('Save edit'));

    // Simulate the mutation resolving with a 409 (savingEdit true -> false, editError set).
    rerender(
      <NoteCard note={baseNote} tripId="t1" onDelete={jest.fn()} onEdit={onEdit} savingEdit={true} />,
    );
    rerender(
      <NoteCard
        note={baseNote}
        tripId="t1"
        onDelete={jest.fn()}
        onEdit={onEdit}
        savingEdit={false}
        editError="This was changed by someone else since you last loaded it."
      />,
    );

    // Editor stays open with the user's draft intact, and the error is visible.
    expect(getByLabelText('Edit journal entry').props.value).toBe('My conflicting edit');
    expect(getByText('This was changed by someone else since you last loaded it.')).toBeTruthy();
  });
});
