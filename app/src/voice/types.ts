import { MediaAsset, NoteScope } from '../types';

export interface VoiceControlsProps {
  tripId: string;
  scope: NoteScope;
  /** Day or itinerary-item id for Day/Event scope; omit for Trip scope. */
  targetId?: string | null;
}

export interface VoicePlayerProps {
  tripId: string;
  media: MediaAsset;
}
