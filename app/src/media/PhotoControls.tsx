import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, radius } from '../theme';
import { useCreatePhotoNoteMutation } from '../queries/notes';
import { UploadFile } from '../api';
import { NoteScope } from '../types';

interface PhotoControlsProps {
  tripId: string;
  scope: NoteScope;
  targetId?: string | null;
}

/** Pick an image from the library (web file dialog or native picker) and upload it as a photo note. */
export function PhotoControls({ tripId, scope, targetId }: PhotoControlsProps) {
  const createPhoto = useCreatePhotoNoteMutation(tripId);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const pick = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      let upload: UploadFile;
      let fileName: string;

      if (Platform.OS === 'web') {
        const file = asset.file ?? (await (await fetch(asset.uri)).blob());
        upload = file;
        fileName = asset.file?.name ?? asset.fileName ?? 'photo.jpg';
      } else {
        const type = asset.mimeType ?? 'image/jpeg';
        const ext = type.split('/')[1] ?? 'jpg';
        fileName = asset.fileName ?? `photo.${ext}`;
        upload = { uri: asset.uri, name: fileName, type };
      }

      setUploadProgress(0);
      createPhoto.mutate({ fields: { scope, targetId }, image: upload, fileName, onProgress: setUploadProgress });
    } catch {
      setError("Couldn't add that photo. Try again.");
    }
  };

  if (createPhoto.isPending) {
    return (
      <View style={st.row}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={st.recText}>
          Uploading photo{uploadProgress > 0 ? `… ${Math.round(uploadProgress * 100)}%` : '…'}
        </Text>
      </View>
    );
  }

  return (
    <View>
      <Pressable style={st.btn} onPress={pick} accessibilityLabel="Add a photo">
        <Text style={st.btnText}>📷 Add photo</Text>
      </Pressable>
      {error ?? createPhoto.isError ? (
        <Text style={st.error}>{error ?? "Couldn't upload the photo. Try again."}</Text>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  btn: { marginTop: 8, alignItems: 'center', paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  btnText: { fontSize: 13, fontWeight: '800', color: colors.ink600 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  recText: { fontSize: 12, color: colors.ink600, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 12, fontWeight: '600', marginTop: 4 },
});
